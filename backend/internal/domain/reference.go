package domain

// Vocabularies is the fixed set of editable planning vocabularies, in
// display order. It is the single source of truth for API path validation,
// the reference-data response shape, and the delete-protection usage map.
// The list is code, not data, because a new vocabulary only matters once
// some schema column consumes it — which is a code change anyway.
var Vocabularies = []string{
	"signal_types",
	"preamp_connectors",
	"signal_cable_types",
	"speaker_cable_types",
	"output_types",
	"mic_stands",
	"power_connectors",
	"truss_types",
	"channel_colors",
}

// ReferenceValue is one choice within a vocabulary, scoped to one event.
// Value is the stable token stored on planning rows; Label is the
// human-facing text and the only editable part after creation.
type ReferenceValue struct {
	ID         int64  `json:"id"`
	EventID    int64  `json:"eventId"`
	Vocabulary string `json:"vocabulary"`
	Value      string `json:"value"`
	Label      string `json:"label"`
	// How many plan rows reference this value, derived per request and never
	// stored (Slice 29). It is counted by the same function that guards the
	// delete, so the number shown and the refusal that follows cannot
	// disagree. Zero on a reference *template*, which no plan can reference —
	// the template response omits it rather than reporting a misleading 0.
	UsageCount int `json:"usageCount"`
	// Whether any planning column stores this vocabulary at all. False on the
	// four vocabularies that outlived their consuming column, where a zero
	// count is not "unused" but "unanswerable" — see db.UsageTracked. Omitted
	// when true so the response only carries the exception.
	UsageUntracked bool `json:"usageUntracked,omitempty"`
}

// ReferenceData maps every vocabulary name to its values, label-sorted.
// All vocabularies are always present, empty ones as empty slices.
type ReferenceData map[string][]ReferenceValue

// ReferenceValueRequest carries POST (value+label) and PATCH (label only;
// value is immutable and ignored if sent) bodies.
type ReferenceValueRequest struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// ReferenceTemplateValue is one choice within a vocabulary, scoped to one
// user's personal template (Slice 17) — the seed copied into a new
// event's own ReferenceValue rows at creation time, never itself
// referenced by any planning row.
type ReferenceTemplateValue struct {
	ID         int64  `json:"id"`
	Vocabulary string `json:"vocabulary"`
	Value      string `json:"value"`
	Label      string `json:"label"`
}

// FixtureMode is a DMX operating mode of one catalog fixture model. Picking
// a mode copies Name and ChannelCount onto the rig fixture — there is no
// live link, so editing or deleting a mode never rewrites patched rigs.
type FixtureMode struct {
	ID              int64  `json:"id"`
	InventoryItemID int64  `json:"inventory_item_id"`
	Name            string `json:"name"`
	ChannelCount    int    `json:"channel_count"`
}

// FixtureModeRequest carries POST/PATCH bodies for fixture modes.
type FixtureModeRequest struct {
	Name         string `json:"name"`
	ChannelCount int    `json:"channel_count"`
}
