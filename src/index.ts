/**
 * AI Content Drop SDK — a thin, dependency-free client over the /v1 REST API.
 *
 * Thin on purpose: the API is the contract, and a client that re-models it
 * invents a second contract to keep in sync. Everything here maps one method to
 * one endpoint, with the two behaviours a hand-rolled fetch usually gets wrong —
 * polling until a generation finishes, and sending an idempotency key so a
 * retry cannot double-charge.
 *
 * Spec: https://aicontentdrop.com/openapi.json
 */

export const DEFAULT_BASE_URL = "https://aicontentdrop.com";

export interface ClientOptions {
  /** `acd_live_…`, created at https://aicontentdrop.com/settings/integrations. */
  apiKey?: string;
  baseUrl?: string;
  /** Route every request through sandbox mode: no credits, synthetic results. */
  sandbox?: boolean;
  fetch?: typeof fetch;
}

export interface ApiErrorBody {
  error?: { code?: string; message?: string } | string;
  code?: string;
}

export class AcdError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;
  /** Seconds to wait before retrying, from Retry-After (429 only). */
  readonly retryAfter?: number;

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    const nested = typeof body?.error === "object" ? body.error : undefined;
    const message =
      nested?.message ?? (typeof body?.error === "string" ? body.error : undefined) ?? `HTTP ${status}`;
    super(message);
    this.name = "AcdError";
    this.status = status;
    this.code = nested?.code ?? body?.code ?? String(status);
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

export interface Model {
  id: string;
  name: string;
  credits: number;
}

export interface Video {
  id: string;
  status: "generating" | "completed" | "failed" | "timeout" | string;
  title?: string | null;
  model?: string | null;
  prompt?: string | null;
  credits_used?: number;
  video_url?: string | null;
  thumbnail_url?: string | null;
  error_message?: string | null;
  created_at?: string | null;
}

export interface GenerateVideoInput {
  prompt: string;
  aiModel?: string;
  duration?: number;
  aspectRatio?: string;
  negativePrompt?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

function randomKey(): string {
  // crypto.randomUUID is in Node 20 and every modern browser; the fallback
  // keeps the SDK usable in odd embedded runtimes rather than throwing.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `acd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class AiContentDrop {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly sandbox: boolean;
  private readonly doFetch: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey ?? process?.env?.ACD_API_KEY;
    this.baseUrl = (options.baseUrl ?? process?.env?.ACD_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.sandbox = options.sandbox ?? false;
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    init: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    if (this.sandbox) headers["X-Sandbox"] = "true";

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await res.text();
    const parsed = text ? safeJson(text) : {};
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      throw new AcdError(res.status, parsed as ApiErrorBody, Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    return parsed as T;
  }

  /** Account and credit balance. Requires an API key. */
  me() {
    return this.request<Record<string, unknown>>("GET", "/v1/me");
  }

  /** Model catalogue with flat credit costs. No key required. */
  async models(options: { type?: "video" | "image"; maxCredits?: number } = {}): Promise<Model[]> {
    const params = new URLSearchParams({ type: options.type ?? "video" });
    if (options.maxCredits !== undefined) params.set("max_credits", String(options.maxCredits));
    const body = await this.request<{ models: Model[] }>("GET", `/v1/models?${params}`);
    return body.models;
  }

  /** Credit cost of one model. No key required. */
  cost(modelId: string, quantity = 1) {
    return this.request<{ model_id: string; credits_each: number; credits_total: number }>(
      "GET",
      `/v1/models/${encodeURIComponent(modelId)}/cost?quantity=${quantity}`,
    );
  }

  /** Credit cost of many models in one call. No key required. */
  costBatch(items: Array<{ model_id: string; quantity?: number }>) {
    return this.request<{ credits_total: number; items: unknown[] }>("POST", "/v1/models/cost", {
      body: { items },
    });
  }

  /**
   * Start a video generation. Returns as soon as the job is accepted.
   *
   * An idempotency key is sent by default: without one, a retry after a dropped
   * response starts a second generation and charges twice.
   */
  async generateVideo(
    input: GenerateVideoInput,
    options: { idempotencyKey?: string } = {},
  ): Promise<Video> {
    const body = await this.request<{ video: Video }>("POST", "/v1/generate/video", {
      body: input,
      idempotencyKey: options.idempotencyKey ?? randomKey(),
    });
    return body.video;
  }

  /** Poll one generation. */
  video(id: string) {
    return this.request<Video>("GET", `/v1/videos/${encodeURIComponent(id)}`);
  }

  /** One page of recent generations, newest first. */
  videos(options: { limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.cursor) params.set("cursor", options.cursor);
    const qs = params.toString();
    return this.request<{ videos: Video[]; next_cursor: string | null; has_more: boolean }>(
      "GET",
      `/v1/videos${qs ? `?${qs}` : ""}`,
    );
  }

  /** Every generation, following the cursor — the loop most callers write by hand. */
  async *allVideos(pageSize = 50): AsyncGenerator<Video> {
    let cursor: string | undefined;
    for (;;) {
      const page = await this.videos({ limit: pageSize, cursor });
      for (const video of page.videos) yield video;
      if (!page.has_more || !page.next_cursor) return;
      cursor = page.next_cursor;
    }
  }

  /**
   * Generate and wait for the render.
   *
   * Polls at the interval the API suggests until the job leaves `generating`.
   * Throws AcdError on failure so a caller cannot mistake a failed job for a
   * finished one.
   */
  async generateVideoAndWait(
    input: GenerateVideoInput,
    options: {
      idempotencyKey?: string;
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (video: Video) => void;
    } = {},
  ): Promise<Video> {
    const started = Date.now();
    const interval = options.pollIntervalMs ?? 5_000;
    const timeout = options.timeoutMs ?? 15 * 60_000;

    let video = await this.generateVideo(input, { idempotencyKey: options.idempotencyKey });
    while (video.status === "generating" || video.status === "processing") {
      if (Date.now() - started > timeout) {
        throw new AcdError(504, {
          error: { code: "timeout", message: `Generation ${video.id} did not finish within the timeout.` },
        });
      }
      await sleep(interval);
      video = await this.video(video.id);
      options.onProgress?.(video);
    }
    if (video.status !== "completed") {
      throw new AcdError(422, {
        error: {
          code: "generation_failed",
          message: video.error_message ?? `Generation ${video.id} ended with status ${video.status}.`,
        },
      });
    }
    return video;
  }

  /** Natural-language question about models, pricing, or our guides. No key required. */
  ask(query: string) {
    return this.request<{ _meta: Record<string, unknown>; results: unknown[] }>("POST", "/ask", {
      body: { query },
    });
  }

  /** Self-register for a read-scoped token that raises rate limits. No key required. */
  registerAgent(clientName?: string) {
    return this.request<{ client_id: string; client_secret: string; access_token: string }>(
      "POST",
      "/agent/auth/register",
      { body: { client_name: clientName, identity_type: "anonymous" } },
    );
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: "invalid_response", message: text.slice(0, 200) } };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default AiContentDrop;
