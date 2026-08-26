package aicontentdrop

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// serve stands up a fake API and returns a client pointed at it. Every test
// here is offline: a unit test that needs the internet is a test that fails for
// reasons the code did not cause.
func serve(t *testing.T, handler http.HandlerFunc, opts ...Option) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return New(append([]Option{WithBaseURL(server.URL)}, opts...)...)
}

func TestModelsReadsTheCatalogue(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("max_credits"); got != "12" {
			t.Errorf("max_credits = %q, want 12", got)
		}
		if r.Header.Get("Authorization") != "" {
			t.Error("sent an Authorization header without a key")
		}
		json.NewEncoder(w).Encode(Catalogue{
			Type: "video", Count: 1,
			Models: []Model{{ID: "seedance_1_0_fast", Name: "Seedance 1.0 Fast", Credits: 9}},
		})
	})

	catalogue, err := c.Models(context.Background(), ModelQuery{Type: "video", MaxCredits: 12})
	if err != nil {
		t.Fatal(err)
	}
	if len(catalogue.Models) != 1 || catalogue.Models[0].Credits != 9 {
		t.Fatalf("unexpected catalogue: %+v", catalogue)
	}
}

func TestPlansCarriesTheFreeTier(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{
			"object":"list","currency":"usd",
			"free_tier":{"available":true,"credits":10,"price_usd":0,"allocation":"one_time","renews":false},
			"plans":[{"id":"starter","name":"Starter","price_usd_per_month":19,
			          "price_usd_per_month_billed_annually":14,"credits_per_month":150}],
			"credit_packs":[{"id":"pack_150","credits":150,"price_usd":12,"usd_per_credit":0.08}]
		}`))
	})

	plans, err := c.Plans(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !plans.FreeTier.Available || plans.FreeTier.Credits != 10 {
		t.Fatalf("free tier not read: %+v", plans.FreeTier)
	}
	// The annual figure is a MONTHLY rate. A nil pointer here would mean the
	// field name changed under us and a caller is about to quote a yearly total.
	if plans.Plans[0].PriceUSDPerMonthBilledAnnually == nil ||
		*plans.Plans[0].PriceUSDPerMonthBilledAnnually != 14 {
		t.Fatalf("annual rate not read: %+v", plans.Plans[0])
	}
}

func TestSandboxHeaderRidesEveryRequest(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sandbox") != "true" {
			t.Error("X-Sandbox missing")
		}
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"sandbox":true,"video":{"id":"sandbox_1","status":"completed","creditsUsed":0}}`))
	}, WithSandbox(true))

	submission, err := c.GenerateVideo(context.Background(), VideoRequest{Prompt: "a balloon", Model: "kling_3_0"})
	if err != nil {
		t.Fatal(err)
	}
	if !submission.Sandbox || submission.Video.CreditsUsed != 0 {
		t.Fatalf("sandbox submission not read: %+v", submission)
	}
}

func TestGenerateSendsAnIdempotencyKeyByDefault(t *testing.T) {
	// Without one, a retry after a dropped response starts a SECOND generation
	// and charges twice. The default has to be the safe one.
	var seen string
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("Idempotency-Key")
		w.Write([]byte(`{"video":{"id":"v1","status":"generating"}}`))
	})

	if _, err := c.GenerateVideo(context.Background(), VideoRequest{Prompt: "x", Model: "kling_3_0"}); err != nil {
		t.Fatal(err)
	}
	if seen == "" {
		t.Fatal("no Idempotency-Key sent")
	}

	if _, err := c.GenerateVideo(context.Background(), VideoRequest{
		Prompt: "x", Model: "kling_3_0", IdempotencyKey: "item-42",
	}); err != nil {
		t.Fatal(err)
	}
	if seen != "item-42" {
		t.Fatalf("caller key ignored: %q", seen)
	}
}

func TestErrorCarriesTheCodeAndRetryAfter(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"code":"rate_limited","message":"Slow down."}}`))
	})

	_, err := c.Models(context.Background(), ModelQuery{})
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("want *Error, got %T", err)
	}
	if apiErr.Code != "rate_limited" {
		t.Errorf("code = %q", apiErr.Code)
	}
	if apiErr.RetryAfter != 30*time.Second {
		t.Errorf("retry after = %s", apiErr.RetryAfter)
	}
	if !apiErr.Retryable() {
		t.Error("429 should be retryable — nothing was charged")
	}
}

func TestErrorReadsTheLegacyStringShape(t *testing.T) {
	// The generation endpoints alias the website's own handlers, which still
	// answer validation failures with {"error": "message"}. An SDK that only
	// understood the structured shape would drop the one sentence saying what
	// the caller got wrong.
	c := serve(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"Prompt is required"}`))
	})

	_, err := c.GenerateVideo(context.Background(), VideoRequest{Model: "kling_3_0"})
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("want *Error, got %T", err)
	}
	if apiErr.Message != "Prompt is required" {
		t.Errorf("message = %q", apiErr.Message)
	}
	if apiErr.Retryable() {
		t.Error("400 is not retryable — the request itself is wrong")
	}
}

func TestWaitPollsUntilTerminal(t *testing.T) {
	polls := 0
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.Write([]byte(`{"video":{"id":"v1","status":"generating"}}`))
			return
		}
		polls++
		if polls < 2 {
			w.Write([]byte(`{"id":"v1","status":"generating"}`))
			return
		}
		w.Write([]byte(`{"id":"v1","status":"completed","videoUrl":"https://example.test/v1.mp4"}`))
	})

	video, err := c.GenerateVideoAndWait(context.Background(),
		VideoRequest{Prompt: "x", Model: "kling_3_0"},
		WaitOptions{PollInterval: time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	if !video.Succeeded() || video.VideoURL == "" {
		t.Fatalf("unexpected result: %+v", video)
	}
}

func TestWaitReportsAFailedJobAsAnError(t *testing.T) {
	// The failure this guards: a caller reading VideoURL off a failed job sees
	// an empty string and reports success with no asset.
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.Write([]byte(`{"video":{"id":"v1","status":"generating"}}`))
			return
		}
		w.Write([]byte(`{"id":"v1","status":"failed","error":"The model refused the prompt"}`))
	})

	video, err := c.GenerateVideoAndWait(context.Background(),
		VideoRequest{Prompt: "x", Model: "kling_3_0"},
		WaitOptions{PollInterval: time.Millisecond})
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Code != "generation_failed" {
		t.Fatalf("want generation_failed, got %v", err)
	}
	if video.Succeeded() {
		t.Error("a failed job reported as succeeded")
	}
}

func TestBatchAndAgentRegistration(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batch":
			w.Write([]byte(`{"count":1,"results":[{"id":"a","status":200,"body":{"count":3}}]}`))
		case "/agent/auth/register":
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"client_id":"acd_agent_client_x","access_token":"acd_agent_y","token_type":"Bearer","expires_in":86400,"scope":"read"}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	})

	batch, err := c.Batch(context.Background(), []BatchOperation{{ID: "a", Method: "GET", Path: "/v1/models"}})
	if err != nil {
		t.Fatal(err)
	}
	if batch["count"] != float64(1) {
		t.Fatalf("batch envelope: %+v", batch)
	}

	token, err := c.RegisterAgent(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if token.Scope != "read" || token.AccessToken == "" {
		t.Fatalf("token: %+v", token)
	}
}

func TestAPIKeyIsSentWhenSupplied(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer acd_live_test" {
			t.Errorf("authorization = %q", r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{"id":"u1","credits":42,"plan":"starter"}`))
	}, WithAPIKey("acd_live_test"))

	account, err := c.Me(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if account.Credits != 42 {
		t.Fatalf("account: %+v", account)
	}
}

func TestContextCancellationIsHonoured(t *testing.T) {
	c := serve(t, func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.Write([]byte(`{}`))
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Millisecond)
	defer cancel()
	if _, err := c.Models(ctx, ModelQuery{}); err == nil {
		t.Fatal("expected the cancelled context to surface")
	}
}
