package domain

type EventRental struct {
	ID                int64   `json:"id"`
	EventID           int64   `json:"event_id"`
	InventoryItemID   int64   `json:"inventory_item_id"`
	InventoryItemName string  `json:"inventory_item_name,omitempty"`
	Description       string  `json:"description,omitempty"`
	QuantityAudio     int     `json:"quantity_audio"`
	QuantityLighting  int     `json:"quantity_lighting"`
	TotalQuantity     int     `json:"total_quantity"`
	PriceExVAT        float64 `json:"price_ex_vat"`
	SubtotalExVAT     float64 `json:"subtotal_ex_vat"`
	Notes             string  `json:"notes,omitempty"`
}

type RentalSummary struct {
	Items         []EventRental `json:"items"`
	TotalItems    int           `json:"total_items"`
	TotalQuantity int           `json:"total_quantity"`
	TotalExVAT    float64       `json:"total_ex_vat"`
}
