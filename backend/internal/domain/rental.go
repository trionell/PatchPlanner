package domain

// EventRental is one line of an event's rental order. Quantities are the
// merged totals of everything the plan references plus the manual share,
// which is also broken out separately so it can be edited in place.
type EventRental struct {
	InventoryItemID        int64   `json:"inventory_item_id"`
	InventoryItemName      string  `json:"inventory_item_name,omitempty"`
	Description            string  `json:"description,omitempty"`
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
	TotalExVAT    float64       `json:"total_ex_vat"`
	HasOverStock  bool          `json:"has_over_stock"`
}

// ManualRentalRequest is the payload for PUT /events/{id}/rentals/manual/{itemID}.
type ManualRentalRequest struct {
	QuantityAudio    int    `json:"quantity_audio"`
	QuantityLighting int    `json:"quantity_lighting"`
	Notes            string `json:"notes,omitempty"`
}
