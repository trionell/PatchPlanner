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
	Discontinued bool `json:"discontinued"`
	// IsManual marks items the user typed in rather than ones an import
	// created (Slice 22). Imports own their own rows and may discontinue or
	// overwrite them; manual rows are none of an import's business, so
	// UpsertInventory excludes them from both its discontinue sweep and its
	// name-matching pool. Set by the server on create and immutable after.
	IsManual  bool   `json:"is_manual"`
	CreatedAt string `json:"created_at,omitempty"`
}

// InventoryCategoryRequest creates a category by hand (Slice 22).
type InventoryCategoryRequest struct {
	Name         string `json:"name"`
	CategoryType string `json:"category_type"`
	PickerRole   string `json:"picker_role,omitempty"`
}

// InventoryCategoryPatch is a partial category update; nil fields are left
// untouched, so a rename need not resend the type.
type InventoryCategoryPatch struct {
	Name         *string `json:"name"`
	CategoryType *string `json:"category_type"`
	PickerRole   *string `json:"picker_role"`
}

// InventoryItemRequest creates an item by hand. There is deliberately no
// IsManual field: the server decides that, so a client cannot create an
// item that imports will treat as their own (or vice versa).
type InventoryItemRequest struct {
	CategoryID        int64   `json:"category_id"`
	Name              string  `json:"name"`
	Description       string  `json:"description,omitempty"`
	QuantityAvailable int     `json:"quantity_available"`
	PriceExVAT        float64 `json:"price_ex_vat"`
}

// InventoryItemPatch is a partial item update; nil fields are untouched.
type InventoryItemPatch struct {
	CategoryID        *int64   `json:"category_id"`
	Name              *string  `json:"name"`
	Description       *string  `json:"description"`
	QuantityAvailable *int     `json:"quantity_available"`
	PriceExVAT        *float64 `json:"price_ex_vat"`
}

type InventoryImportResult struct {
	CategoriesImported int `json:"categories_imported"`
	ItemsImported      int `json:"items_imported"`
	// Format is which format the uploaded file was detected as, so the UI
	// can tell the user what the auto-detection decided rather than
	// leaving them to infer it.
	Format string `json:"format,omitempty"`
	// Warnings are non-fatal notes about the imported file (e.g. one
	// category name appearing with two different types). The import
	// succeeded; these are for the user's attention, not errors.
	Warnings []string `json:"warnings,omitempty"`
}

// Inventory source formats (Slice 22). SourceFormatLL is the only value
// that earns the supplier price-list export: fidelity to a supplier's file
// comes from having imported it, never from assumption.
const (
	SourceFormatLL      = "ll"      // imported from an LL price list; source_xlsx holds it
	SourceFormatGeneric = "generic" // imported from the generic spreadsheet; no file retained
)

// Inventory is an owned, independent catalog (Slice 16). The uploaded
// source spreadsheet's bytes live in the DB (source_xlsx) but are never
// serialized to JSON — only its filename is, for display.
type Inventory struct {
	ID             int64  `json:"id"`
	OwnerUserID    int64  `json:"-"`
	Name           string `json:"name"`
	SourceFilename string `json:"sourceFilename,omitempty"`
	// SourceFormat records how the catalog was populated: SourceFormatLL,
	// SourceFormatGeneric, or empty (created empty and/or filled in by
	// hand). It is what gates the price-list export — "has stored bytes"
	// stopped being the same question once a second importer existed.
	SourceFormat string `json:"sourceFormat,omitempty"`
	CreatedAt    string `json:"createdAt"`
	// The three counts the list view is made of (Slice 32). Derived per
	// request by ListInventoriesForOwner and populated by nothing else: an
	// endpoint returning a single inventory has never counted anything and
	// must not start claiming zeroes. `omitempty` follows
	// InventoryCategory.ItemCount, which has carried a derived count this
	// way since Slice 22 — absent and zero mean the same thing, and the
	// page reads both as `?? 0`.
	//
	// EventCount is the same predicate DeleteInventory refuses on, so the
	// number shown and the refusal that follows cannot disagree.
	ItemCount     int `json:"itemCount,omitempty"`
	CategoryCount int `json:"categoryCount,omitempty"`
	EventCount    int `json:"eventCount,omitempty"`
}
