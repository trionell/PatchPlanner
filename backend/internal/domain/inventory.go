package domain

type InventoryCategory struct {
	ID           int64  `json:"id"`
	InventoryID  int64  `json:"inventoryId"`
	Name         string `json:"name"`
	CategoryType string `json:"category_type"`
	// PickerRole marks the category as a source for planning pickers:
	// 'cable' or 'stand' (empty = not a picker source). Set by the 019
	// seed and editable via PATCH; the xlsx import never touches it.
	PickerRole string `json:"picker_role,omitempty"`
	ItemCount  int    `json:"item_count,omitempty"`
}

type InventoryItem struct {
	ID                int64   `json:"id"`
	InventoryID       int64   `json:"inventoryId"`
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

// Inventory is an owned, independent catalog (Slice 16). The uploaded
// source spreadsheet's bytes live in the DB (source_xlsx) but are never
// serialized to JSON — only its filename is, for display.
type Inventory struct {
	ID             int64  `json:"id"`
	OwnerUserID    int64  `json:"-"`
	Name           string `json:"name"`
	SourceFilename string `json:"sourceFilename,omitempty"`
	CreatedAt      string `json:"createdAt"`
}
