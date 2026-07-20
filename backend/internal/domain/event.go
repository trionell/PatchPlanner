package domain

type Event struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Date        string `json:"date,omitempty"`
	Venue       string `json:"venue,omitempty"`
	Notes       string `json:"notes,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	OwnerUserID *int64 `json:"-"`
	YourRole    string `json:"yourRole,omitempty"`
	InventoryID int64  `json:"inventoryId"`
}
