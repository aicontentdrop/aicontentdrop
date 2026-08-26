package aicontentdrop

import (
	"fmt"
	"time"
)

// Error is a failed API call.
//
// Branch on Code, never on Message. The API answers failures with
// {"error": {"code", "message"}}: the code is a contract, the message is
// written for a human and is expected to change.
type Error struct {
	// Status is the HTTP status code.
	Status int
	// Code is the stable machine-readable identifier, e.g. "unknown_model",
	// "insufficient_credits", "rate_limited".
	Code string
	// Message is the human-readable explanation. Log it; do not parse it.
	Message string
	// RetryAfter is how long the server asked us to wait, from the Retry-After
	// header. Zero when the server did not say.
	RetryAfter time.Duration
	// Body is the decoded response, for the fields this type does not name.
	Body map[string]any
}

func (e *Error) Error() string {
	return fmt.Sprintf("aicontentdrop: [%s] %s (HTTP %d)", e.Code, e.Message, e.Status)
}

// Retryable reports whether retrying this exact request could succeed.
//
// Nothing was charged in any of these cases — billing is post-deduct — so a
// retry costs only time. On a 429, wait RetryAfter: retrying sooner extends the
// window rather than shortening it.
func (e *Error) Retryable() bool {
	switch e.Status {
	case 429, 500, 502, 503, 504:
		return true
	default:
		return false
	}
}
