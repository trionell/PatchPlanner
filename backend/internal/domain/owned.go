package domain

// OwnedItem is a piece of equipment the technician owns. It lives in its own
// catalog, completely separate from the renter's inventory, and never
// appears on a rental order or export.
type OwnedItem struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description,omitempty"`
	CategoryType  string `json:"category_type"`
	QuantityOwned int    `json:"quantity_owned"`
	Notes         string `json:"notes,omitempty"`
	// PlannedOnEvents counts how many events currently plan this item, so
	// the UI can warn before a delete cascades those lines away.
	PlannedOnEvents int    `json:"planned_on_events"`
	CreatedAt       string `json:"created_at,omitempty"`
}

// EventOwnedEquipment is one owned-gear line on an event's equipment list.
type EventOwnedEquipment struct {
	OwnedItemID   int64  `json:"owned_item_id"`
	OwnedItemName string `json:"owned_item_name"`
	CategoryType  string `json:"category_type"`
	Quantity      int    `json:"quantity"`
	QuantityOwned int    `json:"quantity_owned"`
	IsOverOwned   bool   `json:"is_over_owned"`
	Notes         string `json:"notes,omitempty"`
}

// OwnedEquipmentRequest is the payload for PUT /events/{id}/owned-equipment/{itemID}.
type OwnedEquipmentRequest struct {
	Quantity int    `json:"quantity"`
	Notes    string `json:"notes,omitempty"`
}
