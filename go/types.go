package aicontentdrop

// Model is one generation model in the catalogue.
type Model struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Credits is flat per generation, not per second. It is the whole price.
	Credits int `json:"credits"`
}

// Catalogue is the answer from Models.
type Catalogue struct {
	Type   string  `json:"type"`
	Count  int     `json:"count"`
	Note   string  `json:"note,omitempty"`
	Models []Model `json:"models"`
}

// Cost is a quote for one model, returned by Cost.
type Cost struct {
	ModelID      string `json:"model_id"`
	Name         string `json:"name"`
	CreditsEach  int    `json:"credits_each"`
	Quantity     int    `json:"quantity"`
	CreditsTotal int    `json:"credits_total"`
	Type         string `json:"type"`
}

// FreeTier describes the no-card tier, as data rather than as marketing copy.
type FreeTier struct {
	Available    bool    `json:"available"`
	Credits      int     `json:"credits"`
	PriceUSD     float64 `json:"price_usd"`
	CardRequired bool    `json:"card_required"`
	// Allocation is "one_time": the grant is issued once, when the address is
	// confirmed, and stamped so it cannot be replayed. Not monthly, whatever a
	// marketing feature list says.
	Allocation                string `json:"allocation"`
	Renews                    bool   `json:"renews"`
	EmailConfirmationRequired bool   `json:"email_confirmation_required"`
	SignupURL                 string `json:"signup_url"`
	AgentSignup               string `json:"agent_signup"`
}

// Plan is one paid subscription tier.
type Plan struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	PriceUSDPerMonth float64 `json:"price_usd_per_month"`
	// PriceUSDPerMonthBilledAnnually is a MONTHLY rate, not a yearly total.
	// Nil when the plan has no annual option.
	PriceUSDPerMonthBilledAnnually *float64 `json:"price_usd_per_month_billed_annually"`
	CreditsPerMonth                int      `json:"credits_per_month"`
	MaxQuality                     string   `json:"max_quality"`
	Popular                        bool     `json:"popular"`
	Features                       []string `json:"features"`
	CheckoutURL                    string   `json:"checkout_url"`
}

// CreditPack is a one-time top-up.
type CreditPack struct {
	ID           string  `json:"id"`
	Credits      int     `json:"credits"`
	PriceUSD     float64 `json:"price_usd"`
	USDPerCredit float64 `json:"usd_per_credit"`
	OneTime      bool    `json:"one_time"`
}

// Plans is the answer from Plans.
type Plans struct {
	Object        string       `json:"object"`
	Currency      string       `json:"currency"`
	BillingModel  string       `json:"billing_model"`
	FreeTier      FreeTier     `json:"free_tier"`
	Plans         []Plan       `json:"plans"`
	CreditPacks   []CreditPack `json:"credit_packs"`
	PerModelCosts string       `json:"per_model_costs"`
	Documentation string       `json:"documentation"`
}

// Video is one generation, in flight or finished.
type Video struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	// Status is one of "generating", "processing", "pending", "completed",
	// "failed", or "timeout".
	Status      string `json:"status"`
	AIModel     string `json:"aiModel"`
	CreditsUsed int    `json:"creditsUsed"`
	VideoURL    string `json:"videoUrl,omitempty"`
	ImageURL    string `json:"imageUrl,omitempty"`
	Error       string `json:"error,omitempty"`
	Note        string `json:"note,omitempty"`
}

// Done reports whether the job has stopped moving, successfully or not.
func (v Video) Done() bool {
	switch v.Status {
	case "generating", "processing", "pending", "":
		return false
	default:
		return true
	}
}

// Succeeded reports whether the job finished with an asset.
func (v Video) Succeeded() bool { return v.Status == "completed" }

// Submission is the answer from GenerateVideo and GenerateImage.
type Submission struct {
	// Sandbox is true when the request carried X-Sandbox: true. Nothing was
	// generated and nothing was charged.
	Sandbox bool  `json:"sandbox,omitempty"`
	Video   Video `json:"video"`
}

// VideoRequest is a generation to submit.
type VideoRequest struct {
	Prompt string `json:"prompt"`
	// Model is a catalogue ID such as "kling_3_0". Underscores are canonical;
	// dashed forms are accepted and normalized server-side.
	Model string `json:"model,omitempty"`
	// ImageURL turns this into image-to-video.
	ImageURL    string `json:"image_url,omitempty"`
	AspectRatio string `json:"aspect_ratio,omitempty"`
	Duration    int    `json:"duration,omitempty"`
	// IdempotencyKey makes a retry safe: the same key returns the original
	// submission instead of charging twice. Generated when left empty.
	IdempotencyKey string `json:"-"`
}

// ImageRequest is an image generation to submit.
type ImageRequest struct {
	Prompt         string `json:"prompt"`
	Model          string `json:"model,omitempty"`
	AspectRatio    string `json:"aspect_ratio,omitempty"`
	IdempotencyKey string `json:"-"`
}

// Account is the answer from Me.
type Account struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Credits  int    `json:"credits"`
	Plan     string `json:"plan"`
}

// AgentToken is an anonymous read-scoped token from RegisterAgent.
//
// It authorizes the public read surface at a higher rate limit. It cannot
// generate: that needs an acd_live_ key a human created.
type AgentToken struct {
	ClientID    string `json:"client_id"`
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
	ClaimURI    string `json:"claim_uri,omitempty"`
}

// VideoList is one page of generations.
type VideoList struct {
	Videos     []Video `json:"videos"`
	NextCursor string  `json:"next_cursor,omitempty"`
	HasMore    bool    `json:"has_more,omitempty"`
}
