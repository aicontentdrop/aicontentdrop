package aicontentdrop

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version is this package's version, sent in the User-Agent.
const Version = "0.1.0"

// DefaultBaseURL is the production origin.
const DefaultBaseURL = "https://aicontentdrop.com"

// Client talks to the AI Content Drop API. The zero value is not usable; call
// New. A Client is safe for concurrent use.
type Client struct {
	baseURL    string
	apiKey     string
	sandbox    bool
	userAgent  string
	httpClient *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithAPIKey authorizes account and generation calls with an acd_live_ key.
// Without one the read surface still works; generating does not.
func WithAPIKey(key string) Option {
	return func(c *Client) { c.apiKey = key }
}

// WithBaseURL points the client at a different origin. For tests, mostly.
func WithBaseURL(raw string) Option {
	return func(c *Client) { c.baseURL = strings.TrimRight(raw, "/") }
}

// WithHTTPClient supplies the transport, so a caller keeps control of timeouts,
// proxies, and retries.
func WithHTTPClient(h *http.Client) Option {
	return func(c *Client) { c.httpClient = h }
}

// WithSandbox sends X-Sandbox: true on every request. Generations validate
// fully, reach no model, charge nothing, and return the real response shape.
func WithSandbox(on bool) Option {
	return func(c *Client) { c.sandbox = on }
}

// WithUserAgent appends a caller's own identifier to the User-Agent.
func WithUserAgent(ua string) Option {
	return func(c *Client) { c.userAgent = ua }
}

// New builds a client.
//
// The API key falls back to ACD_API_KEY and the origin to ACD_BASE_URL, so an
// agent handed credentials through the environment needs no options at all.
func New(opts ...Option) *Client {
	c := &Client{
		baseURL:    strings.TrimRight(envOr("ACD_BASE_URL", DefaultBaseURL), "/"),
		apiKey:     os.Getenv("ACD_API_KEY"),
		userAgent:  "aicontentdrop-go/" + Version,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── transport ───────────────────────────────────────────────────────────────

type requestOptions struct {
	body           any
	idempotencyKey string
}

func (c *Client) do(ctx context.Context, method, path string, opts requestOptions, out any) error {
	var reader io.Reader
	if opts.body != nil {
		encoded, err := json.Marshal(opts.body)
		if err != nil {
			return fmt.Errorf("aicontentdrop: encoding request: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("aicontentdrop: building request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)
	if opts.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	if c.sandbox {
		req.Header.Set("X-Sandbox", "true")
	}
	if opts.idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", opts.idempotencyKey)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("aicontentdrop: %s %s: %w", method, path, err)
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return fmt.Errorf("aicontentdrop: reading response: %w", err)
	}

	if res.StatusCode >= 400 {
		return parseError(res, raw)
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("aicontentdrop: decoding response: %w", err)
	}
	return nil
}

// parseError turns a failure response into *Error.
//
// The two generation endpoints are aliases onto the website's own handlers, so
// a validation failure there still carries the older {"error": "message"}
// string shape. Both are handled: an SDK that only understood the new one would
// swallow the message that says what the caller got wrong.
func parseError(res *http.Response, raw []byte) *Error {
	out := &Error{
		Status:  res.StatusCode,
		Code:    fmt.Sprintf("http_%d", res.StatusCode),
		Message: fmt.Sprintf("Request failed with %d", res.StatusCode),
	}

	var envelope struct {
		Error json.RawMessage `json:"error"`
	}
	var body map[string]any
	if len(raw) > 0 && json.Unmarshal(raw, &body) == nil {
		out.Body = body
	}
	if len(raw) > 0 && json.Unmarshal(raw, &envelope) == nil && len(envelope.Error) > 0 {
		var structured struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		var plain string
		if json.Unmarshal(envelope.Error, &structured) == nil && structured.Code != "" {
			out.Code = structured.Code
			if structured.Message != "" {
				out.Message = structured.Message
			}
		} else if json.Unmarshal(envelope.Error, &plain) == nil && plain != "" {
			out.Message = plain
		}
	}

	if header := res.Header.Get("Retry-After"); header != "" {
		if seconds, err := strconv.Atoi(header); err == nil {
			out.RetryAfter = time.Duration(seconds) * time.Second
		}
	}
	return out
}

// idempotencyKey generates one when the caller did not supply it.
//
// Sending a key by default is the safe default: without one, retrying after a
// dropped response starts a SECOND generation and charges twice. Derive a
// stable key from the item rather than the attempt when running a batch.
func idempotencyKey(supplied string) string {
	if supplied != "" {
		return supplied
	}
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// A time-based key is still unique per call from one process, and a
		// missing key is worse than a weaker one on a path that spends money.
		return "go-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return "go-" + hex.EncodeToString(buf)
}

// ── read surface: no credential required ────────────────────────────────────

// ModelQuery filters the catalogue.
type ModelQuery struct {
	// Type is "video" (default) or "image".
	Type string
	// MaxCredits keeps only models costing at most this much per generation —
	// the call to make when a user is close to their balance.
	MaxCredits int
}

// Models returns the catalogue with flat per-generation credit costs.
func (c *Client) Models(ctx context.Context, q ModelQuery) (*Catalogue, error) {
	params := url.Values{}
	if q.Type != "" {
		params.Set("type", q.Type)
	}
	if q.MaxCredits > 0 {
		params.Set("max_credits", strconv.Itoa(q.MaxCredits))
	}
	path := "/v1/models"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}
	out := &Catalogue{}
	return out, c.do(ctx, http.MethodGet, path, requestOptions{}, out)
}

// Plans returns subscription tiers, credit packs, and the free tier.
func (c *Client) Plans(ctx context.Context) (*Plans, error) {
	out := &Plans{}
	return out, c.do(ctx, http.MethodGet, "/v1/plans", requestOptions{}, out)
}

// Cost quotes one model for a quantity, before committing to it.
func (c *Client) Cost(ctx context.Context, modelID string, quantity int) (*Cost, error) {
	if quantity < 1 {
		quantity = 1
	}
	path := fmt.Sprintf("/v1/models/%s/cost?quantity=%d", url.PathEscape(modelID), quantity)
	out := &Cost{}
	return out, c.do(ctx, http.MethodGet, path, requestOptions{}, out)
}

// CostItem is one line of a bulk quote.
type CostItem struct {
	Model    string `json:"model"`
	Quantity int    `json:"quantity,omitempty"`
}

// CostBatch prices up to 50 model/quantity pairs in one call. Errors are per
// item, so one unknown model id does not fail the quote.
func (c *Client) CostBatch(ctx context.Context, items []CostItem) (map[string]any, error) {
	out := map[string]any{}
	return out, c.do(ctx, http.MethodPost, "/v1/models/cost",
		requestOptions{body: map[string]any{"items": items}}, &out)
}

// BatchOperation is one read to run inside a batch.
type BatchOperation struct {
	ID     string `json:"id"`
	Method string `json:"method"`
	Path   string `json:"path"`
}

// Batch runs up to 20 read operations in one request.
//
// The envelope is 200 even when an operation fails: check each result's own
// status, not only the outer one.
func (c *Client) Batch(ctx context.Context, ops []BatchOperation) (map[string]any, error) {
	out := map[string]any{}
	return out, c.do(ctx, http.MethodPost, "/v1/batch",
		requestOptions{body: map[string]any{"operations": ops}}, &out)
}

// Ask puts a natural-language question about models, pricing, or the guides.
func (c *Client) Ask(ctx context.Context, query string) (map[string]any, error) {
	out := map[string]any{}
	return out, c.do(ctx, http.MethodPost, "/ask",
		requestOptions{body: map[string]any{"query": query}}, &out)
}

// RegisterAgent mints an anonymous read-scoped bearer token. No email, no human,
// one call. It raises the read rate limit; it cannot generate.
func (c *Client) RegisterAgent(ctx context.Context, clientName string) (*AgentToken, error) {
	if clientName == "" {
		clientName = "aicontentdrop-go"
	}
	out := &AgentToken{}
	return out, c.do(ctx, http.MethodPost, "/agent/auth/register",
		requestOptions{body: map[string]any{"client_name": clientName}}, out)
}

// ── account and generation: API key required ────────────────────────────────

// Me returns the account and its credit balance.
func (c *Client) Me(ctx context.Context) (*Account, error) {
	out := &Account{}
	return out, c.do(ctx, http.MethodGet, "/v1/me", requestOptions{}, out)
}

// GenerateVideo starts a generation and returns immediately with a job, not a
// video. A render outlives any request timeout, so poll Video for the result or
// use GenerateVideoAndWait.
func (c *Client) GenerateVideo(ctx context.Context, req VideoRequest) (*Submission, error) {
	out := &Submission{}
	err := c.do(ctx, http.MethodPost, "/v1/generate/video",
		requestOptions{body: req, idempotencyKey: idempotencyKey(req.IdempotencyKey)}, out)
	return out, err
}

// GenerateImage starts an image generation.
func (c *Client) GenerateImage(ctx context.Context, req ImageRequest) (*Submission, error) {
	out := &Submission{}
	err := c.do(ctx, http.MethodPost, "/v1/generate/image",
		requestOptions{body: req, idempotencyKey: idempotencyKey(req.IdempotencyKey)}, out)
	return out, err
}

// Video polls one generation.
func (c *Client) Video(ctx context.Context, id string) (*Video, error) {
	out := &Video{}
	return out, c.do(ctx, http.MethodGet, "/v1/videos/"+url.PathEscape(id), requestOptions{}, out)
}

// Videos returns one page of recent generations, newest first. Pass the
// previous page's NextCursor to continue.
func (c *Client) Videos(ctx context.Context, limit int, cursor string) (*VideoList, error) {
	params := url.Values{}
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	}
	if cursor != "" {
		params.Set("cursor", cursor)
	}
	path := "/v1/videos"
	if len(params) > 0 {
		path += "?" + params.Encode()
	}
	out := &VideoList{}
	return out, c.do(ctx, http.MethodGet, path, requestOptions{}, out)
}

// WaitOptions tunes GenerateVideoAndWait.
type WaitOptions struct {
	// PollInterval defaults to 5s. The server updates on its own schedule;
	// polling faster does not finish the render sooner.
	PollInterval time.Duration
	// Timeout defaults to 15 minutes.
	Timeout time.Duration
	// OnProgress, when set, is called with each poll result.
	OnProgress func(Video)
}

// GenerateVideoAndWait submits a generation and blocks until it stops moving.
//
// It returns an error for any terminal status other than "completed", so a
// caller cannot mistake a failed job for a finished one by reading an empty
// VideoURL. Nothing was charged for a failure: billing is post-deduct.
func (c *Client) GenerateVideoAndWait(ctx context.Context, req VideoRequest, opts WaitOptions) (*Video, error) {
	if opts.PollInterval <= 0 {
		opts.PollInterval = 5 * time.Second
	}
	if opts.Timeout <= 0 {
		opts.Timeout = 15 * time.Minute
	}

	submission, err := c.GenerateVideo(ctx, req)
	if err != nil {
		return nil, err
	}
	video := submission.Video
	deadline := time.Now().Add(opts.Timeout)

	for !video.Done() {
		if time.Now().After(deadline) {
			return &video, &Error{
				Status:  504,
				Code:    "timeout",
				Message: fmt.Sprintf("Generation %s did not finish within %s.", video.ID, opts.Timeout),
			}
		}
		select {
		case <-ctx.Done():
			return &video, ctx.Err()
		case <-time.After(opts.PollInterval):
		}

		polled, err := c.Video(ctx, video.ID)
		if err != nil {
			return &video, err
		}
		video = *polled
		if opts.OnProgress != nil {
			opts.OnProgress(video)
		}
	}

	if !video.Succeeded() {
		message := video.Error
		if message == "" {
			message = fmt.Sprintf("Generation %s ended with status %s.", video.ID, video.Status)
		}
		return &video, &Error{Status: 422, Code: "generation_failed", Message: message}
	}
	return &video, nil
}
