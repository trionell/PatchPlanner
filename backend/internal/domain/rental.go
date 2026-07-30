package domain

// EventRental is one line of an event's rental order. Quantities are the
// merged totals of everything the plan references plus the manual share,
// which is also broken out separately so it can be edited in place.
type EventRental struct {
	InventoryItemID   int64  `json:"inventory_item_id"`
	InventoryItemName string `json:"inventory_item_name,omitempty"`
	Description       string `json:"description,omitempty"`
	// Category fields (Slice 22) let the PDF and spreadsheet exports group
	// lines without a second query. They are purely additive: the summary's
	// own ORDER BY is unchanged, so the on-screen table and the captured
	// rental baseline keep their existing flat, name-sorted order.
	CategoryID             int64   `json:"category_id,omitempty"`
	CategoryName           string  `json:"category_name,omitempty"`
	CategoryType           string  `json:"category_type,omitempty"`
	QuantityAudio          int     `json:"quantity_audio"`
	QuantityLighting       int     `json:"quantity_lighting"`
	TotalQuantity          int     `json:"total_quantity"`
	ManualQuantityAudio    int     `json:"manual_quantity_audio"`
	ManualQuantityLighting int     `json:"manual_quantity_lighting"`
	ManualNotes            string  `json:"manual_notes,omitempty"`
	PriceExVAT             float64 `json:"price_ex_vat"`
	SubtotalExVAT          float64 `json:"subtotal_ex_vat"`
	QuantityAvailable      int     `json:"quantity_available"`
	IsOverStock            bool    `json:"is_over_stock"`
	IsDiscontinued         bool    `json:"is_discontinued"`
}

type RentalSummary struct {
	Items         []EventRental `json:"items"`
	TotalItems    int           `json:"total_items"`
	TotalQuantity int           `json:"total_quantity"`
	// SubtotalExVAT is the sum of every line's day rate — what it has always
	// been. It was called TotalExVAT until Slice 31, when it stopped being the
	// order's total: the hire's price is Pricing.TotalExVAT, which is this
	// number after the discount and the rent factor.
	//
	// The rename is deliberate rather than cosmetic. Adding a field beside the
	// old one would have left all nine sites that show money compiling, and
	// eight of them wrong — including the Overview number band, which had shown
	// a day rate labelled "RENTAL, EX VAT" since Wave 4.
	SubtotalExVAT float64 `json:"subtotal_ex_vat"`
	HasOverStock  bool    `json:"has_over_stock"`
	// Pricing is how the subtotal becomes a price. A value and not a pointer:
	// every order has one, even when it is x1.00 and 0%.
	Pricing RentalPricing `json:"pricing"`
}

// ManualRentalRequest is the payload for PUT /events/{id}/rentals/manual/{itemID}.
type ManualRentalRequest struct {
	QuantityAudio    int    `json:"quantity_audio"`
	QuantityLighting int    `json:"quantity_lighting"`
	Notes            string `json:"notes,omitempty"`
}

// Unplaced-line reasons for the rental export report.
const (
	UnplacedDiscontinued = "discontinued" // item vanished from the latest price list
	UnplacedRowMismatch  = "row_mismatch" // the item's sheet row now holds different equipment
	UnplacedNoRow        = "no_row"       // item has no recorded sheet position
)

// UnplacedLine is a rental order line that could not be written into the
// price-list file; it is surfaced for manual follow-up instead of being
// silently dropped.
type UnplacedLine struct {
	InventoryItemID   int64  `json:"inventory_item_id"`
	InventoryItemName string `json:"inventory_item_name"`
	QuantityAudio     int    `json:"quantity_audio"`
	QuantityLighting  int    `json:"quantity_lighting"`
	Reason            string `json:"reason"`
}

// RentalExportReport describes the outcome of building an export file.
type RentalExportReport struct {
	Filename      string         `json:"filename"`
	PlacedLines   int            `json:"placed_lines"`
	UnplacedLines []UnplacedLine `json:"unplaced_lines"`
	// PricingPlaced reports whether the price-list file's two typed cells —
	// Rabatt utrustning and Hyresfaktor (Antal dagar) — were found and written.
	// The constitution's Principle IV requires that lines which cannot be
	// represented faithfully are reported rather than silently dropped; from
	// Slice 31 the same is true of the price.
	PricingPlaced bool `json:"pricing_placed"`
	// PricingNotes is empty unless there is something to say. A list, because
	// the two things it can say are independent: the labels were not found, and
	// this event's VAT disagrees with the rate the file computes.
	PricingNotes []string `json:"pricing_notes"`
}
