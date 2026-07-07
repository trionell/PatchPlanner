package domain

type InventoryCategory struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	CategoryType string `json:"category_type"`
	ItemCount    int    `json:"item_count,omitempty"`
}

type InventoryItem struct {
	ID                int64   `json:"id"`
	CategoryID        int64   `json:"category_id"`
	CategoryName      string  `json:"category_name,omitempty"`
	CategoryType      string  `json:"category_type,omitempty"`
	Name              string  `json:"name"`
	Description       string  `json:"description,omitempty"`
	QuantityAvailable int     `json:"quantity_available"`
	PriceExVAT        float64 `json:"price_ex_vat"`
	XLSXRow           int     `json:"xlsx_row,omitempty"`
	// Discontinued marks items that disappeared from the most recent price
	// list import. They are hidden from planning dropdowns but never
	// deleted, so existing plan references keep resolving.
	Discontinued bool   `json:"discontinued"`
	CreatedAt    string `json:"created_at,omitempty"`
}

type InventoryImportResult struct {
	CategoriesImported int `json:"categories_imported"`
	ItemsImported      int `json:"items_imported"`
}
