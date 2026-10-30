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

import {
  AiContentDrop,
  AcdError,
  findRetryOffer,
  piecesOf,
  retryOffersOf,
  type DirectorNote,
  type DropRead,
  type ReferenceAnalysis,
  type RetryOffer,
  type RightsBasis,
} from "./index.js";
import { pathToFileURL } from 'node:url';

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
  analyze <file|url> [--rights own_work|licensed|permission]
                                                  Read a reference into words: class, shots, cast, look, lines (free, capped)
  drop "<goal>" [--reference <file|url>] [--lane auto|marketing|cinematic|ugc|drama] [--budget N] [--confirm-each]
                                                  Hand a job to the video agent; with a reference it is read first
  drop status <run_id> [--notes]                  Phase, status, credits, each piece's score and verdict, retry offers
  drop retry <run_id> <piece_task_id> --quote <quote_id>
                                                  Approve the priced retry waiting on one piece, at the quote shown
  register [--name NAME]                          Self-register an agent token (no key needed)
  billing catalog                                List authoritative billing SKUs and catalog version
  billing status [checkout_id]                    Owned subscription or checkout state
  billing history [--limit N] [--cursor C]         Owned payment history
  billing portal --idempotency-key KEY            Return an owned billing portal link
  checkout plan|topup --sku ID --catalog-version V --idempotency-key KEY --confirm-purchase
                                                  Create a hosted link for a human to complete
  open-api                                        Print the OpenAPI spec URL and key facts
  help                                            This message

OPTIONS
  --key <acd_live_…>   API key. Defaults to $ACD_API_KEY.
  --base-url <url>     Override the API host. Defaults to $ACD_BASE_URL or production.
  --sandbox            Rehearse without spending credits or calling a provider.
  --pretty             Human-readable output instead of JSON.
  --rights <basis>     Who holds the rights to a reference: own_work, licensed or permission. Required for video.
  --notes              With "drop status": the reasons behind each score and the Director's notes.
  --quote <quote_id>   With "drop retry": the quote the person agreed to; a different current quote is refused.
  --help, -h           This message.

EXAMPLES
  acd models --type video --max-credits 15
  acd generate "a golden retriever surfing at sunset" --model kling_3_0 --wait
  acd analyze ./reference.mp4 --rights own_work --pretty
  acd drop "a 15-second product ad in this style" --reference ./reference.mp4 --rights own_work --confirm-each
  acd drop status <run_id> --notes --pretty
  ACD_API_KEY=acd_live_… acd me --pretty

Docs: https://aicontentdrop.com/developers
Spec: https://aicontentdrop.com/openapi.json
Keys: https://aicontentdrop.com/settings/integrations
`;

interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = [
  'help', 'pretty', 'json', 'sandbox', 'wait', 'all', 'confirm-purchase', 'confirm-each', 'notes', 'accept-quote',
];

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--") && !(token === "-h")) {
      out._.push(token);
      continue;
    }
    const name = token === "-h" ? "help" : token.slice(2);
    if (BOOLEAN_FLAGS.includes(name)) {
      out.flags[name] = true;
      continue;
    }
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

// ── The reference and the scorecard, in words ────────────────────────────────
//
// Both printers read only what the API says in words. A piece's engine, its
// prompt and the thumbnail never reach the terminal: the score, the verdict
// and the reasons are what a person decides on.

const RIGHTS: readonly RightsBasis[] = ["own_work", "licensed", "permission"];
const LANES = ["auto", "marketing", "cinematic", "ugc", "drama"] as const;

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** The id inside one of our own reference addresses, or null for anything else. */
function referenceIdOf(value: string): string | null {
  const match = /\/(?:api|v1)\/engine\/references\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(value);
  return match ? decodeURIComponent(match[1]) : null;
}

function rightsOf(flags: Args["flags"]): RightsBasis | undefined {
  const value = flags.rights;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !RIGHTS.includes(value as RightsBasis)) {
    throw new AcdError(400, {
      error: { code: "invalid_request", message: `--rights takes one of ${RIGHTS.join(", ")}.` },
    });
  }
  return value as RightsBasis;
}

/** What was seen, as a flat object a script can read. Words only. */
function wordsOf(ref: ReferenceAnalysis) {
  const facts = ref.facts;
  return {
    reference_id: ref.reference_id,
    kind: ref.kind,
    status: ref.status,
    ...(ref.reference_url ? { reference_url: ref.reference_url } : {}),
    class: ref.reference_class ?? null,
    confidence: typeof ref.confidence === "number" ? Number(ref.confidence.toFixed(2)) : null,
    summary: facts?.summary ?? null,
    shots: (facts?.shots ?? []).map((shot) => ({
      index: shot.index,
      size: shot.size,
      camera: shot.camera,
      action: shot.action,
      tags: shot.beatTags ?? [],
      ...(shot.durationSeconds !== undefined ? { seconds: shot.durationSeconds } : {}),
    })),
    cast: facts?.cast ?? [],
    look: facts?.look ?? null,
    lines: facts?.lines ?? [],
  };
}

function renderWords(words: ReturnType<typeof wordsOf>): string[] {
  const out: string[] = [];
  out.push(`class=${words.class ?? "not sure yet"}  confidence=${words.confidence ?? "—"}  status=${words.status}  reference_id=${words.reference_id}`);
  if (words.status !== "ready") {
    out.push("Still reading the reference. Read it again in a few seconds; the facts fill in when it is done.");
    return out;
  }
  if (words.summary) out.push(`summary: ${words.summary}`);
  if (words.shots.length) {
    out.push("shots:");
    for (const shot of words.shots) {
      const tags = shot.tags.length ? ` · ${shot.tags.join(", ")}` : "";
      out.push(`  ${shot.index} · ${shot.size} · ${shot.camera} · ${shot.action}${tags}`);
    }
  }
  if (words.cast.length) {
    out.push("cast:");
    for (const member of words.cast) out.push(`  ${member.key} · ${member.role} · ${member.look}`);
  }
  if (words.look) {
    out.push(`look: ${words.look.register}`);
    if (words.look.palette?.length) out.push(`  palette: ${words.look.palette.join(", ")}`);
    if (words.look.notes) out.push(`  notes: ${words.look.notes}`);
  }
  if (words.lines.length) {
    out.push("lines:");
    for (const line of words.lines) out.push(`  "${line}"`);
  }
  return out;
}

interface Scorecard {
  run_id: string;
  phase: string;
  status: string;
  lane: string | null;
  credits: { spent: number; quoted: number; budget: number | null };
  what_i_saw?: { class: string | null; summary: string | null };
  pieces: Array<{
    bucket: string;
    id: string;
    status: string;
    score: number | null;
    verdict: string | null;
    reasons?: string[];
    notes?: string[];
  }>;
  director_notes?: DirectorNote[];
  pending_approval: Array<{ task_id: string; quote_id: string | null; credits: number | null; kind: string }>;
  retry_offers: RetryOffer[];
  error?: string | null;
}

function scorecardOf(read: DropRead, withNotes: boolean): Scorecard {
  const run = read.run;
  const quotes = run.entities?.quotes ?? {};
  const brief = run.entities?.brief?.current;
  const offers = retryOffersOf(read);
  const offered = new Set(offers.map((offer) => offer.task_id));
  const pending = (read.tasks ?? [])
    .filter((task) => task.status === "waiting_approval" && !offered.has(task.id))
    .map((task) => {
      const quote = task.quoteId ? quotes[task.quoteId] : undefined;
      return {
        task_id: task.id,
        quote_id: task.quoteId,
        credits: typeof quote?.credits === "number" ? quote.credits : null,
        kind: task.kind,
      };
    });
  return {
    run_id: run.id,
    phase: run.phase,
    status: run.status,
    lane: run.lane ?? null,
    credits: { spent: run.creditsSpent ?? 0, quoted: run.creditsQuoted ?? 0, budget: run.budgetCredits ?? null },
    ...(brief?.reference_class || brief?.reference_facts
      ? { what_i_saw: { class: brief.reference_class ?? null, summary: brief.reference_facts?.summary ?? null } }
      : {}),
    pieces: piecesOf(run).map(({ bucket, piece }) => {
      const review = piece.review;
      return {
        bucket,
        id: piece.id,
        status: piece.status,
        score: typeof review?.score === "number" ? Math.round(review.score) : null,
        verdict: review?.verdict ?? null,
        ...(withNotes && review?.reasons?.length ? { reasons: review.reasons } : {}),
        ...(withNotes && review?.notes?.length ? { notes: review.notes } : {}),
      };
    }),
    ...(withNotes && brief?.director_notes?.length ? { director_notes: brief.director_notes } : {}),
    pending_approval: pending,
    retry_offers: offers,
    ...(run.error ? { error: run.error } : {}),
  };
}

function renderScorecard(card: Scorecard, withNotes: boolean): string[] {
  const out: string[] = [];
  const budget = card.credits.budget === null ? "" : `  budget=${card.credits.budget}`;
  out.push(`run ${card.run_id}  phase=${card.phase}  status=${card.status}${card.lane ? `  lane=${card.lane}` : ""}`);
  out.push(`credits: spent=${card.credits.spent}  quoted=${card.credits.quoted}${budget}`);
  if (card.error) out.push(`error: ${card.error}`);
  if (card.what_i_saw) {
    out.push(`what I saw: class=${card.what_i_saw.class ?? "not sure yet"}${card.what_i_saw.summary ? ` · ${card.what_i_saw.summary}` : ""}`);
  }
  out.push(card.pieces.length ? "pieces:" : "pieces: none yet");
  for (const piece of card.pieces) {
    const score = piece.score === null ? "unscored" : `score=${piece.score}`;
    out.push(`  ${piece.bucket} · ${piece.id} · ${piece.status} · ${score}${piece.verdict ? ` · ${piece.verdict}` : ""}`);
    if (withNotes) {
      for (const reason of piece.reasons ?? []) out.push(`      reason: ${reason}`);
      for (const note of piece.notes ?? []) out.push(`      note: ${note}`);
    }
  }
  if (withNotes && card.director_notes?.length) {
    out.push("Director's notes:");
    for (const note of card.director_notes) out.push(`  ${note.skill} · ${note.why}`);
  }
  for (const step of card.pending_approval) {
    const credits = step.credits === null ? "not priced yet" : `up to ${step.credits} credits`;
    out.push(`waiting for approval: ${step.kind} · task_id=${step.task_id} · quote_id=${step.quote_id ?? "—"} · ${credits}`);
  }
  for (const offer of card.retry_offers) {
    const credits = offer.credits === null ? "not priced yet" : `up to ${offer.credits} credits`;
    out.push(`${offer.label}: piece ${offer.piece_id} · task_id=${offer.task_id} · quote_id=${offer.quote_id ?? "—"} · ${credits}`);
    // The command names the quote the person was shown, so approving it can
    // never approve a different price (money F4). No command until it is priced.
    if (offer.quote_id) out.push(`  acd drop retry ${card.run_id} ${offer.piece_id} --quote ${offer.quote_id}`);
  }
  return out;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const command = args._[0];

  // Asking for help is not a failure. `npx aicontentdrop --help` used to print
  // usage and exit 1, because the exit code was decided by "is there a
  // command" alone; a VM harness that gates a tool on `--help` exiting 0 read
  // that as a broken CLI. Help requested → stdout, 0. No command at all → the
  // same usage on STDERR, 1, so a script can still branch on it.
  if (args.flags.help || command === "help") {
    console.log(HELP);
    return 0;
  }

  if (!command) {
    console.error(HELP);
    return 1;
  }

  const pretty = Boolean(args.flags.pretty);
  const client = new AiContentDrop({
    apiKey: typeof args.flags.key === "string" ? args.flags.key : undefined,
    baseUrl: typeof args.flags["base-url"] === "string" ? args.flags["base-url"] : undefined,
    sandbox: Boolean(args.flags.sandbox),
  });

  switch (command) {
    case 'checkout': {
      if (args.flags['confirm-purchase'] !== true) {
        throw new AcdError(400, { error: { code: 'confirmation_required', message:
          'Checkout requires an explicit --confirm-purchase. The returned hosted link must be completed by a human.' } });
      }
      const kind = args._[1] === 'plan' ? 'subscription' : args._[1] === 'topup' ? 'topup' : null;
      const skuId = args.flags.sku;
      const catalogVersion = args.flags['catalog-version'];
      const idempotencyKey = args.flags['idempotency-key'];
      if (!kind || args._.length !== 2 || typeof skuId !== 'string' || !skuId.startsWith(kind + ':') ||
          typeof catalogVersion !== 'string' || typeof idempotencyKey !== 'string') {
        throw new AcdError(400, { error: { code: 'invalid_request', message:
          'Use checkout plan|topup --sku ID --catalog-version V --idempotency-key KEY --confirm-purchase. Read billing catalog first; reuse the same key when retrying one purchase.' } });
      }
      print(await client.createBillingCheckout({ kind, skuId, catalogVersion, idempotencyKey,
        returnTarget: 'billing' } as Parameters<AiContentDrop['createBillingCheckout']>[0]), pretty);
      return 0;
    }
    case 'billing': {
      switch (args._[1]) {
        case 'catalog': print(await client.billingCatalog(), pretty); return 0;
        case 'status': print(args._[2] ? await client.billingCheckout(args._[2]) : await client.billingStatus(), pretty); return 0;
        case 'history':
          print(await client.billingHistory({ limit: args.flags.limit ? Number(args.flags.limit) : undefined,
            cursor: typeof args.flags.cursor === 'string' ? args.flags.cursor : undefined }), pretty);
          return 0;
        case 'portal': {
          const idempotencyKey = args.flags['idempotency-key'];
          if (typeof idempotencyKey !== 'string') {
            throw new AcdError(400, { error: { code: 'invalid_request', message: 'Use billing portal --idempotency-key KEY.' } });
          }
          print(await client.createBillingPortal({ idempotencyKey, returnTarget: 'billing' }), pretty);
          return 0;
        }
        default: throw new AcdError(400, { error: { code: 'invalid_request', message: 'Use billing catalog|status|history|portal.' } });
      }
    }
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
    case "analyze": {
      const target = args._[1];
      if (!target) {
        console.error("Usage: acd analyze <file|url> [--rights own_work|licensed|permission]");
        return 1;
      }
      const rightsBasis = rightsOf(args.flags);
      const existing = referenceIdOf(target);
      const ref = existing
        ? await client.getReference(existing)
        : await client.analyzeReferenceAndWait(isUrl(target) ? { url: target, rightsBasis } : { file: target, rightsBasis }, {
            onProgress: () => {
              if (pretty) console.error("… still reading the reference");
            },
          });
      const words = wordsOf(ref);
      if (pretty) {
        for (const line of renderWords(words)) console.log(line);
      } else {
        print(words, false);
      }
      return 0;
    }
    case "drop": {
      const verb = args._[1];
      if (verb === "status") {
        const runId = args._[2];
        if (!runId) {
          console.error("Usage: acd drop status <run_id> [--notes]");
          return 1;
        }
        const withNotes = Boolean(args.flags.notes);
        const card = scorecardOf(await client.getDrop(runId), withNotes);
        if (pretty) {
          for (const line of renderScorecard(card, withNotes)) console.log(line);
        } else {
          print(card, false);
        }
        return card.status === "failed" ? 2 : 0;
      }
      if (verb === "retry") {
        const runId = args._[2];
        const pieceId = args._[3];
        if (!runId || !pieceId) {
          console.error("Usage: acd drop retry <run_id> <piece_task_id> --quote <quote_id>");
          return 1;
        }
        const givenQuote = typeof args.flags.quote === "string" ? args.flags.quote.trim() : "";
        if (!givenQuote) {
          // No request is made without the quote: it is the number the person
          // agrees to, and the CLI never agrees on their behalf. --accept-quote
          // alone names no price, so it is refused the same way (money F4).
          throw new AcdError(400, { error: { code: "confirmation_required", message:
            "A retry is a priced step. Read its quote_id and credits with \"acd drop status <run_id>\", show them to the person, and re-run with --quote <quote_id> to approve that quote only. --accept-quote alone approves nothing. Nothing is charged unless the retry succeeds." } });
        }
        const read = await client.getDrop(runId);
        const offer = findRetryOffer(read, pieceId);
        if (!offer) {
          throw new AcdError(404, { error: { code: "no_retry_offer", message:
            `No retry is waiting on piece ${pieceId}. Run "acd drop status ${runId}" to see what is offered.` } });
        }
        if (!offer.quote_id) {
          throw new AcdError(409, { error: { code: "QUOTE_REQUIRED", message:
            "That retry is not priced yet. Read the run again in a few seconds and approve the quote it shows." } });
        }
        if (offer.quote_id !== givenQuote) {
          // The price changed since the person saw it (a quote lapsed and was
          // priced again): approve nothing and say what it costs now.
          const credits = offer.credits === null ? "not priced yet" : `up to ${offer.credits} credits`;
          throw new AcdError(409, { error: { code: "quote_mismatch", message:
            `The retry on piece ${offer.piece_id} is now quote_id=${offer.quote_id} · ${credits}, not ${givenQuote}. Nothing was approved. Show the person the new price, and only if they agree run "acd drop retry ${runId} ${offer.piece_id} --quote ${offer.quote_id}".` } });
        }
        const result = await client.approveDrop(runId, offer.task_id, givenQuote);
        print(
          {
            run_id: runId,
            piece_id: offer.piece_id,
            task_id: offer.task_id,
            quote_id: offer.quote_id,
            credits: offer.credits,
            task_status: result.task?.status ?? null,
            run_status: result.run?.status ?? null,
          },
          pretty,
        );
        return 0;
      }

      const goal = args._.slice(1).join(" ");
      if (!goal) {
        console.error('Usage: acd drop "<goal>" [--reference <file|url>] [--lane auto|marketing|cinematic|ugc|drama] [--budget N] [--confirm-each]');
        return 1;
      }
      const lane = args.flags.lane;
      if (lane !== undefined && (typeof lane !== "string" || !(LANES as readonly string[]).includes(lane))) {
        console.error(`--lane takes one of ${LANES.join(", ")}.`);
        return 1;
      }
      const budgetFlag = args.flags.budget;
      const budgetCredits = budgetFlag === undefined ? undefined : Number(budgetFlag);
      if (budgetCredits !== undefined && (!Number.isInteger(budgetCredits) || budgetCredits < 0)) {
        console.error("--budget takes a whole number of credits.");
        return 1;
      }
      const rightsBasis = rightsOf(args.flags);
      const reference = typeof args.flags.reference === "string" ? args.flags.reference : undefined;

      let analysis: ReferenceAnalysis | undefined;
      let referenceUrl: string | undefined;
      if (reference) {
        const existing = referenceIdOf(reference);
        if (existing) {
          analysis = await client.getReference(existing);
          referenceUrl = reference;
        } else {
          analysis = await client.analyzeReferenceAndWait(
            isUrl(reference) ? { url: reference, rightsBasis } : { file: reference, rightsBasis },
            { onProgress: () => { if (pretty) console.error("… still reading the reference"); } },
          );
          referenceUrl = analysis.reference_url;
          if (!referenceUrl) {
            throw new AcdError(502, { error: { code: "reference_without_address", message:
              "The reference was read but came back without an address to put on the brief. Try again in a minute." } });
          }
        }
      }

      const started = await client.startDrop({
        goal,
        referenceUrl,
        referenceClass: analysis?.reference_class,
        lane: typeof lane === "string" ? lane : undefined,
        approvalMode: args.flags["confirm-each"] === true ? "confirm_each" : undefined,
        budgetCredits,
      });
      const words = analysis ? wordsOf(analysis) : undefined;
      if (pretty) {
        console.log(`run ${started.run_id}  phase=${started.phase}  status=${started.status}`);
        if (words) {
          console.log("what I saw:");
          for (const line of renderWords(words)) console.log(`  ${line}`);
        }
        if (started.answer) console.log(started.answer);
        if (started.pending_approval) {
          const step = started.pending_approval;
          console.log(`waiting for approval: task_id=${step.task_id} · quote_id=${step.quote_id ?? "—"} · up to ${step.credits ?? "—"} credits`);
        }
        if (started.next_step) console.log(started.next_step);
        console.log(`acd drop status ${started.run_id} --notes`);
      } else {
        print(
          {
            run_id: started.run_id,
            phase: started.phase,
            status: started.status,
            ...(words ? { what_i_saw: words } : {}),
            ...(started.answer ? { answer: started.answer } : {}),
            ...(started.questions ? { questions: started.questions } : {}),
            ...(started.pending_approval ? { pending_approval: started.pending_approval } : {}),
            ...(started.next_step ? { next_step: started.next_step } : {}),
          },
          false,
        );
      }
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
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
