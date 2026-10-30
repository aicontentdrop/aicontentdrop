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

/** Wire contract: shared/billing-contract.ts. No provider IDs or arbitrary redirects. */
export type BillingCheckoutInput = {
  catalogVersion: string;
  idempotencyKey: string;
  returnTarget: 'billing' | 'generate' | 'quiz';
} & (
  | { kind: 'subscription'; skuId: `subscription:${string}:s${0 | 1 | 2}:${'monthly' | 'annual'}`; offerId?: string }
  | { kind: 'topup'; skuId: `topup:${string}` }
  | { kind: 'quiz'; skuId: `quiz:${string}` }
);

export type BillingCheckoutStatus = 'pending' | 'processing' | 'paid_pending_review' | 'fulfilled' | 'failed' | 'expired' | 'refunded';
export interface BillingCheckout {
  checkoutId: string;
  url: string | null;
  status: BillingCheckoutStatus;
  statusUrl: string;
  expiresAt: string | null;
  amountMinor: number;
  currency: string;
  renewalTerms?: unknown;
}
export interface BillingCatalog {
  version: string;
  currency: string;
  enabled: boolean;
  reason: string | null;
  items: Array<{
    skuId: string;
    kind: 'subscription' | 'topup' | 'quiz';
    name: string;
    amountMinor: number;
    currency: string;
    credits: number;
    availability: { enabled: boolean; reason: string | null };
    [key: string]: unknown;
  }>;
}
export interface BillingHistory {
  history: Array<{
    id: string; amount: number; currency: string; status: string;
    productName: string; createdAt: string; invoiceUrl: string | null; provider?: string;
  }>;
  degraded?: boolean;
  nextCursor?: string | null;
  environment?: 'test' | 'live';
  legacyHistoryComplete?: boolean;
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

// ── The video agent (Drop) and reference intake ──────────────────────────────
//
// Routes: POST /v1/engine/analyze (reference intake), GET /v1/engine/references/:id,
// POST /v1/engine/chat and POST /v1/engine/runs (start), GET /v1/engine/runs/:id,
// POST /v1/engine/runs/:id/approve. Every result is words: the reference read
// comes back as facts, never as frames, and a piece's review is a score, a
// verdict and reasons. Nothing in these shapes names the engine behind a step.

/** Who holds the rights to a reference. Required by the API for video. */
export type RightsBasis = "own_work" | "licensed" | "permission";

export type ReferenceClass =
  | "cel_anime"
  | "western_animation"
  | "3d_animation"
  | "live_action"
  | "ugc"
  | "product"
  | "unknown";

export interface ReferenceShot {
  index: number;
  /** Shot size in plain words: close-up, medium, wide … */
  size: string;
  /** Camera in plain words: static, slow push-in, handheld follow … */
  camera: string;
  action: string;
  beatTags?: string[];
  durationSeconds?: number;
}

/** What the agent saw, in words. The whole of what the API returns about a reference. */
export interface ReferenceFacts {
  summary: string;
  shots: ReferenceShot[];
  cast: Array<{ key: string; role: string; look: string }>;
  look: { register: string; palette: string[]; notes?: string };
  /** Dialogue or on-screen lines heard or read, in order. */
  lines: string[];
  durationSeconds?: number;
  frameCount?: number;
}

export interface ReferenceAnalysis {
  reference_id: string;
  kind: "image" | "video" | string;
  /** The address the brief carries as `reference: { kind: "upload", url }`. */
  reference_url?: string;
  /** `ready` carries the facts; `analyzing` (202) means a longer video is still being read. */
  status: "ready" | "analyzing" | string;
  reference_class?: ReferenceClass | string;
  /** 0–1. */
  confidence?: number;
  facts?: ReferenceFacts;
  created_at?: string;
}

export interface AnalyzeReferenceInput {
  /** A local image or video. Sent as multipart form-data. */
  file?: string;
  /** A public https address instead of a file. */
  url?: string;
  rightsBasis?: RightsBasis;
}

export type PieceReviewVerdict = "accept" | "retry" | "switch" | "accepted_with_notes" | "unscored" | string;

export interface PieceReview {
  /** 0–100. */
  score: number;
  verdict: PieceReviewVerdict;
  reasons: string[];
  rubric?: Record<string, number>;
  /** Director's notes for this piece, in words. */
  notes?: string[];
  /** The task this piece retried, when it is itself a retry. */
  retry_of?: string;
  /** The retry or switch task this review enqueued, when it did. */
  retry_task_id?: string;
  offer?: { label?: string; [key: string]: unknown };
  judged_at?: string;
}

export interface DirectorNote {
  skill: string;
  why: string;
}

export interface DropPiece {
  id: string;
  status: string;
  url?: string | null;
  credits_used?: number | null;
  error?: string | null;
  review?: PieceReview;
  [key: string]: unknown;
}

export interface DropQuote {
  credits: number;
  expires_at?: string;
  approved?: boolean;
  declined?: boolean;
  refusal?: string | null;
  task_id?: string | null;
  [key: string]: unknown;
}

export interface DropBriefArtifact {
  id?: string;
  brief?: Record<string, unknown>;
  director_notes?: DirectorNote[];
  reference_class?: ReferenceClass | string;
  reference_facts?: ReferenceFacts;
  reference_id?: string;
  [key: string]: unknown;
}

export interface DropEntities {
  brief?: Record<string, DropBriefArtifact>;
  videos?: Record<string, DropPiece>;
  images?: Record<string, DropPiece>;
  ads?: Record<string, DropPiece>;
  quotes?: Record<string, DropQuote>;
  [key: string]: unknown;
}

export interface DropRun {
  id: string;
  title?: string;
  goal?: string;
  phase: string;
  status: string;
  lane?: string | null;
  approvalMode?: string;
  budgetCredits?: number | null;
  creditsQuoted?: number;
  creditsSpent?: number;
  revision?: number;
  error?: string | null;
  entities?: DropEntities;
  [key: string]: unknown;
}

export interface DropTask {
  id: string;
  kind: string;
  phase?: string;
  status: string;
  quoteId: string | null;
  creditsUsed?: number;
  error?: string | null;
  /** The piece this task retries, when the read exposes it. */
  retry_of?: string;
  input?: { retry_of?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** The owner's read of one run: GET /v1/engine/runs/:id. */
export interface DropRead {
  run: DropRun;
  messages?: unknown[];
  tasks?: DropTask[];
}

export interface DropPendingApproval {
  task_id: string;
  quote_id: string | null;
  credits: number | null;
  what?: string;
  expires_at?: string;
}

export type DropLane = "auto" | "marketing" | "cinematic" | "ugc" | "drama";

export interface StartDropInput {
  goal: string;
  /** `reference_url` from analyzeReference(). With it the run starts through POST /v1/engine/chat. */
  referenceUrl?: string;
  referenceClass?: ReferenceClass | string;
  /** `auto` (the default) lets the agent pick; any other value is written on the brief. Needs `referenceUrl`. */
  lane?: DropLane | string;
  approvalMode?: "confirm_each" | string;
  budgetCredits?: number;
}

export interface StartDropResult {
  run_id: string;
  phase: string;
  status: string;
  answer?: string;
  artifacts?: DropEntities;
  pending_approval?: DropPendingApproval;
  next_step?: string;
  questions?: unknown[];
  /** Only when the run was opened through POST /v1/engine/runs. */
  run?: DropRun;
  [key: string]: unknown;
}

/** The words every surface uses for a priced second attempt at a piece. */
export const RETRY_OFFER_LABEL = "Try the other model";

export interface RetryOffer {
  /** The piece the offer is for: its task id when the read names it, otherwise the artifact id. */
  piece_id: string;
  task_id: string;
  quote_id: string | null;
  credits: number | null;
  label: typeof RETRY_OFFER_LABEL;
}

const PIECE_BUCKETS = ["videos", "images", "ads"] as const;
export type PieceBucket = (typeof PIECE_BUCKETS)[number];

/** Every made piece of a run with the bucket it sits in. */
export function piecesOf(run: DropRun | null | undefined): Array<{ bucket: PieceBucket; piece: DropPiece }> {
  const out: Array<{ bucket: PieceBucket; piece: DropPiece }> = [];
  for (const bucket of PIECE_BUCKETS) {
    const map = run?.entities?.[bucket];
    if (!map || typeof map !== "object") continue;
    for (const [id, piece] of Object.entries(map as Record<string, DropPiece>)) {
      if (piece && typeof piece === "object") out.push({ bucket, piece: { ...piece, id: piece.id ?? id } });
    }
  }
  return out;
}

/**
 * The retry offers waiting on a run: tasks in `waiting_approval` that retry a
 * piece, priced by `entities.quotes[task.quoteId]`. A task is a retry when
 * the read says so (`retry_of`, on the task or its input) or when a piece's
 * review names it as the retry it enqueued. Nothing here approves anything.
 */
export function retryOffersOf(read: DropRead | null | undefined): RetryOffer[] {
  const run = read?.run;
  const tasks = read?.tasks ?? [];
  const pieces = piecesOf(run);
  const quotes = run?.entities?.quotes ?? {};
  const offers: RetryOffer[] = [];
  for (const task of tasks) {
    if (task.status !== "waiting_approval") continue;
    const retryOf = typeof task.retry_of === "string" ? task.retry_of : task.input?.retry_of;
    const pieceId =
      typeof retryOf === "string" && retryOf
        ? retryOf
        : pieces.find((entry) => entry.piece.review?.retry_task_id === task.id)?.piece.id;
    if (!pieceId) continue;
    const quote = task.quoteId ? quotes[task.quoteId] : undefined;
    if (quote?.declined) continue;
    offers.push({
      piece_id: pieceId,
      task_id: task.id,
      quote_id: task.quoteId,
      credits: typeof quote?.credits === "number" ? quote.credits : null,
      label: RETRY_OFFER_LABEL,
    });
  }
  return offers;
}

/** The offer for one piece, by the piece's id or by the retry task's own id. */
export function findRetryOffer(read: DropRead | null | undefined, id: string): RetryOffer | undefined {
  return retryOffersOf(read).find((offer) => offer.piece_id === id || offer.task_id === id);
}

const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function mediaTypeOf(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return MEDIA_TYPES[ext] ?? "application/octet-stream";
}

function basenameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "reference";
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
    init: { body?: unknown; form?: FormData; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    // A multipart body sets its own Content-Type (with the boundary); only JSON is declared here.
    if (init.body !== undefined && !init.form) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    if (this.sandbox) headers["X-Sandbox"] = "true";

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
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

  /** Server-authoritative SKUs and current accepted catalog version. No key required. */
  billingCatalog() {
    return this.request<BillingCatalog>('GET', '/v1/billing/catalog');
  }

  /** Create a hosted human handoff. Requires an explicitly granted billing:checkout scope. */
  createBillingCheckout(input: BillingCheckoutInput) {
    this.assertBillingHandoffAllowed();
    return this.request<BillingCheckout>('POST', '/v1/billing/checkouts', {
      body: input,
      idempotencyKey: input.idempotencyKey,
    });
  }

  /** Owned checkout state; the return URL does not prove payment or grant credits. */
  billingCheckout(checkoutId: string) {
    return this.request<Omit<BillingCheckout, 'url'>>('GET', `/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`);
  }

  billingStatus() {
    return this.request<{ subscription: Record<string, unknown> | null; subscriptions: Record<string, unknown>[];
      reconciliationRequired: boolean; environment: 'test' | 'live'; entitlementsAvailable: boolean;
      legacyHistoryComplete: boolean }>('GET', '/v1/billing/subscription');
  }

  billingHistory(options: { limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.cursor !== undefined) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.request<BillingHistory>('GET', `/v1/billing/history${query ? `?${query}` : ''}`);
  }

  /** Return an owned portal URL; never opens a browser or completes an action. */
  createBillingPortal(input: { idempotencyKey: string; returnTarget: 'billing' | 'generate' }) {
    this.assertBillingHandoffAllowed();
    return this.request<{ url: string; expiresAt?: string }>('POST', '/v1/billing/portal-sessions', {
      body: input,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private assertBillingHandoffAllowed() {
    if (this.sandbox) {
      throw new AcdError(400, { error: { code: 'billing_sandbox_required', message:
        'The generation sandbox flag does not simulate billing. Use a billing sandbox deployment and its API key.' } });
    }
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

  /**
   * Read a reference into words. Free, capped per day. Requires an API key.
   *
   * A local path is sent as multipart form-data (field `file`, plus a `rights`
   * JSON field when a rights basis is given); a URL goes as JSON. The 200 body
   * carries the facts; a 202 body means a longer video is still being read —
   * follow it with `getReference()` or `analyzeReferenceAndWait()`.
   */
  async analyzeReference(input: AnalyzeReferenceInput): Promise<ReferenceAnalysis> {
    const rights = input.rightsBasis ? { basis: input.rightsBasis, confirmed: true } : undefined;
    if (input.file) {
      const { readFile } = await import("node:fs/promises");
      const bytes = await readFile(input.file);
      const name = basenameOf(input.file);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mediaTypeOf(name) }), name);
      if (rights) form.append("rights", JSON.stringify(rights));
      return this.request<ReferenceAnalysis>("POST", "/v1/engine/analyze", { form });
    }
    if (!input.url) {
      throw new AcdError(400, {
        error: { code: "invalid_request", message: "Give a local file path or a public https URL to analyze." },
      });
    }
    return this.request<ReferenceAnalysis>("POST", "/v1/engine/analyze", {
      body: { url: input.url, ...(rights ? { rights } : {}) },
    });
  }

  /** The words for one reference, by id. Never the media. Owner only. */
  getReference(referenceId: string) {
    return this.request<ReferenceAnalysis>("GET", `/v1/engine/references/${encodeURIComponent(referenceId)}`);
  }

  /** Analyze and, when the read is still going (202), poll until it is `ready`. */
  async analyzeReferenceAndWait(
    input: AnalyzeReferenceInput,
    options: { pollIntervalMs?: number; timeoutMs?: number; onProgress?: (ref: ReferenceAnalysis) => void } = {},
  ): Promise<ReferenceAnalysis> {
    const started = Date.now();
    const interval = options.pollIntervalMs ?? 5_000;
    const timeout = options.timeoutMs ?? 5 * 60_000;
    let ref = await this.analyzeReference(input);
    while (ref.status === "analyzing") {
      if (Date.now() - started > timeout) return ref;
      await sleep(interval);
      ref = await this.getReference(ref.reference_id);
      options.onProgress?.(ref);
    }
    return ref;
  }

  /**
   * Open a drop (a run of the video agent). Nothing is charged by starting one.
   *
   * With `referenceUrl` the run starts through POST /v1/engine/chat with the
   * reference on the brief, answered as JSON; without one it opens through
   * POST /v1/engine/runs, exactly as before. `lane` is written on the brief
   * only when it is not `auto`, and only the brief carries it.
   */
  async startDrop(input: StartDropInput): Promise<StartDropResult> {
    const approval = input.approvalMode ? { approval_mode: input.approvalMode } : {};
    const budget = input.budgetCredits !== undefined ? { budget_credits: input.budgetCredits } : {};
    if (input.referenceUrl) {
      const lane = input.lane && input.lane !== "auto" ? { lane: input.lane } : {};
      const referenceClass = input.referenceClass ? { reference_class: input.referenceClass } : {};
      return this.request<StartDropResult>("POST", "/v1/engine/chat", {
        body: {
          message: input.goal,
          brief: { reference: { kind: "upload", url: input.referenceUrl }, ...referenceClass, ...lane },
          ...approval,
          ...budget,
        },
      });
    }
    const body = await this.request<{ run: DropRun }>("POST", "/v1/engine/runs", {
      body: { goal: input.goal, ...approval, ...budget },
    });
    return { run_id: body.run.id, phase: body.run.phase, status: body.run.status, run: body.run };
  }

  /** The owner's read of one drop: the run with its artifacts, the transcript and the tasks. */
  getDrop(runId: string) {
    return this.request<DropRead>("GET", `/v1/engine/runs/${encodeURIComponent(runId)}`);
  }

  /** The account's drops, newest first. */
  listDrops(limit?: number) {
    return this.request<{ runs: DropRun[] }>("GET", `/v1/engine/runs${limit ? `?limit=${limit}` : ""}`);
  }

  /**
   * Approve one priced step: the only call here that lets a drop charge credits.
   * `taskId` and `quoteId` must be passed exactly as the run reported them.
   */
  approveDrop(runId: string, taskId: string, quoteId: string) {
    return this.request<{ run: DropRun; task: DropTask }>(
      "POST",
      `/v1/engine/runs/${encodeURIComponent(runId)}/approve`,
      { body: { task_id: taskId, quote_id: quoteId, decision: "approve" } },
    );
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
