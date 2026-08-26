// Package aicontentdrop is the official Go client for the AI Content Drop API.
//
// # No dependencies
//
// Everything here is standard library. An SDK is imported into environments its
// author does not control, and a transitive dependency tree is the part most
// likely to conflict with something the caller already pinned.
//
// # Most of the API needs no credential
//
// The catalogue, prices, cost quotes, article search, and the batch endpoint
// answer an anonymous caller. Construct a client with no options and they work:
//
//	c := aicontentdrop.New()
//	catalogue, err := c.Models(ctx, aicontentdrop.ModelQuery{Type: "video", MaxCredits: 12})
//
// Generating spends credits and therefore needs a key, created by a signed-in
// human at https://aicontentdrop.com/settings/integrations:
//
//	c := aicontentdrop.New(aicontentdrop.WithAPIKey(os.Getenv("ACD_API_KEY")))
//	job, err := c.GenerateVideo(ctx, aicontentdrop.VideoRequest{
//	        Prompt: "a red balloon over a city",
//	        Model:  "kling_3_0",
//	})
//
// # Rehearse before you spend
//
// WithSandbox sends X-Sandbox: true on every request. Generation calls then run
// full validation, reach no model, charge nothing, and return the same shape as
// a real submission — so an integration can be exercised end to end before it
// costs anything.
//
//	c := aicontentdrop.New(aicontentdrop.WithSandbox(true))
//
// # Billing is post-deduct
//
// Credits move only when a generation succeeds. A refused prompt, a provider
// failure, and a timeout all cost nothing, which is why there is no refund call
// in this package: there is nothing to refund.
package aicontentdrop
