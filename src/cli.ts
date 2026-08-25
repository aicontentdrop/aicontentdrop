#!/usr/bin/env node
/**
 * `acd` — the AI Content Drop CLI.
 *
 * Built for two callers with the same needs: a developer trying the API without
 * writing a client, and an AI coding agent that can run shell commands but not
 * necessarily craft signed HTTP requests. Every command therefore prints JSON by
 * default (parseable), takes `--json`/`--pretty` explicitly, and exits non-zero
 * on failure so a script can branch on it.
 *
 * No dependencies: an agent should be able to `npx aicontentdrop` and have
 * it work, not resolve a tree first.
 */

import { AiContentDrop, AcdError } from "./index.js";

const HELP = `acd — AI Content Drop CLI

USAGE
  acd <command> [options]

COMMANDS
  models [--type video|image] [--max-credits N]   List models with credit costs (no key needed)
  cost <model_id> [--quantity N]                  Quote one model (no key needed)
  ask "<question>"                                Ask about models, pricing, or our guides (no key needed)
  me                                              Account and credit balance
  generate "<prompt>" [--model ID] [--wait]       Start a video generation
  status <video_id>                               Poll one generation
  list [--limit N] [--cursor C] [--all]           Recent generations
  register [--name NAME]                          Self-register an agent token (no key needed)
  open-api                                        Print the OpenAPI spec URL and key facts

OPTIONS
  --key <acd_live_…>   API key. Defaults to $ACD_API_KEY.
  --base-url <url>     Override the API host. Defaults to $ACD_BASE_URL or production.
  --sandbox            Rehearse without spending credits or calling a provider.
  --pretty             Human-readable output instead of JSON.
  --help, -h           This message.

EXAMPLES
  acd models --type video --max-credits 15
  acd generate "a golden retriever surfing at sunset" --model kling_3_0 --wait
  ACD_API_KEY=acd_live_… acd me --pretty

Docs: https://aicontentdrop.com/developers
Spec: https://aicontentdrop.com/openapi.json
Keys: https://aicontentdrop.com/settings/integrations
`;

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--") && !(token === "-h")) {
      out._.push(token);
      continue;
    }
    const name = token === "-h" ? "help" : token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.flags[name] = next;
      i++;
    } else {
      out.flags[name] = true;
    }
  }
  return out;
}

function print(value: unknown, pretty: boolean): void {
  if (!pretty) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    for (const row of value) console.log(formatRow(row));
    return;
  }
  console.log(formatRow(value));
}

function formatRow(row: unknown): string {
  if (row && typeof row === "object") {
    return Object.entries(row as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
      .map(([k, v]) => `${k}=${String(v)}`)
      .join("  ");
  }
  return String(row);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.flags.help) {
    console.log(HELP);
    return command ? 0 : 1;
  }

  const pretty = Boolean(args.flags.pretty);
  const client = new AiContentDrop({
    apiKey: typeof args.flags.key === "string" ? args.flags.key : undefined,
    baseUrl: typeof args.flags["base-url"] === "string" ? args.flags["base-url"] : undefined,
    sandbox: Boolean(args.flags.sandbox),
  });

  switch (command) {
    case "models": {
      const type = args.flags.type === "image" ? "image" : "video";
      const maxCredits = args.flags["max-credits"];
      print(
        await client.models({
          type,
          maxCredits: typeof maxCredits === "string" ? Number(maxCredits) : undefined,
        }),
        pretty,
      );
      return 0;
    }
    case "cost": {
      const modelId = args._[1];
      if (!modelId) {
        console.error("Usage: acd cost <model_id> [--quantity N]");
        return 1;
      }
      const quantity = Number(args.flags.quantity ?? 1) || 1;
      print(await client.cost(modelId, quantity), pretty);
      return 0;
    }
    case "ask": {
      const question = args._.slice(1).join(" ");
      if (!question) {
        console.error('Usage: acd ask "<question>"');
        return 1;
      }
      print(await client.ask(question), pretty);
      return 0;
    }
    case "me":
      print(await client.me(), pretty);
      return 0;

    case "generate": {
      const prompt = args._.slice(1).join(" ");
      if (!prompt) {
        console.error('Usage: acd generate "<prompt>" [--model ID] [--wait]');
        return 1;
      }
      const input = {
        prompt,
        ...(typeof args.flags.model === "string" ? { aiModel: args.flags.model } : {}),
        ...(args.flags.duration ? { duration: Number(args.flags.duration) } : {}),
        ...(typeof args.flags["aspect-ratio"] === "string"
          ? { aspectRatio: args.flags["aspect-ratio"] }
          : {}),
      };

      if (args.flags.wait) {
        const video = await client.generateVideoAndWait(input, {
          onProgress: (v) => {
            if (pretty) console.error(`… ${v.id} ${v.status}`);
          },
        });
        print(video, pretty);
        return 0;
      }
      const video = await client.generateVideo(input);
      print(video, pretty);
      return 0;
    }
    case "status": {
      const id = args._[1];
      if (!id) {
        console.error("Usage: acd status <video_id>");
        return 1;
      }
      const video = await client.video(id);
      print(video, pretty);
      // Non-zero for a failed render so `acd status … && deploy` behaves.
      return video.status === "failed" ? 2 : 0;
    }
    case "list": {
      if (args.flags.all) {
        const rows = [];
        for await (const video of client.allVideos()) rows.push(video);
        print(rows, pretty);
        return 0;
      }
      print(
        await client.videos({
          limit: args.flags.limit ? Number(args.flags.limit) : undefined,
          cursor: typeof args.flags.cursor === "string" ? args.flags.cursor : undefined,
        }),
        pretty,
      );
      return 0;
    }
    case "register": {
      print(
        await client.registerAgent(typeof args.flags.name === "string" ? args.flags.name : undefined),
        pretty,
      );
      return 0;
    }
    case "open-api": {
      print(
        {
          documentation: "https://aicontentdrop.com/developers",
          specification: "https://aicontentdrop.com/openapi.json",
          content_surface_specification: "https://aicontentdrop.com/openapi-content.json",
          mcp: "https://aicontentdrop.com/mcp",
          mcp_docs: "https://aicontentdrop.com/mcp/docs",
          agent_instructions: "https://aicontentdrop.com/auth.md",
          create_api_key: "https://aicontentdrop.com/settings/integrations",
        },
        pretty,
      );
      return 0;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
}

// Set exitCode rather than calling process.exit(): exit() tears the loop down
// while the fetch socket is still closing, which trips a libuv assertion on
// Windows and prints a crash after a successful command. Letting the process
// end naturally gives the same exit status without the noise.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof AcdError) {
      // Structured on stderr so an agent can parse the failure, not just read it.
      console.error(
        JSON.stringify({ error: { code: error.code, message: error.message, status: error.status } }),
      );
      process.exitCode = error.status === 429 ? 3 : 2;
      return;
    }
    console.error(JSON.stringify({ error: { code: "cli_error", message: String(error) } }));
    process.exitCode = 2;
  });
