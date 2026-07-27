package domain

type LightingRig struct {
	ID      int64  `json:"id"`
	EventID int64  `json:"event_id"`
	Name    string `json:"name"`
	Notes   string `json:"notes,omitempty"`
}

// BulkFixtureRequest expands into N ordinary fixtures with shared settings;
// fixture numbers increment from the optional start.
//
// Slice 27 merged the Add Fixture and Bulk Add dialogs into one editor, so this
// request now has to express everything that editor offers: a batch of custom
// fixtures with no catalog model, a name to number the batch from, an address
// the client chose from the DMX map, and a batch that all shares one address —
// which is how twenty pars washing a room are actually rigged.
type BulkFixtureRequest struct {
	// Optional: a batch need not come from the catalog.
	InventoryItemID    *int64 `json:"inventory_item_id,omitempty"`
	Quantity           int    `json:"quantity"`
	FixtureNumberStart *int   `json:"fixture_number_start,omitempty"`
	// NameStem names the batch "<stem> 1" … "<stem> N".
	NameStem        string `json:"name_stem,omitempty"`
	DMXChannelMode  string `json:"dmx_channel_mode,omitempty"`
	DMXChannelCount int    `json:"dmx_channel_count"`
	DMXUniverse     int    `json:"dmx_universe"`
	// DMXStartAddress is picked by the client from the universe's free runs.
	// Absent keeps the old behaviour: append after the highest address in use.
	DMXStartAddress *int `json:"dmx_start_address,omitempty"`
	// ShareAddress puts the whole batch on one address, as one shared group.
	ShareAddress     bool   `json:"share_address,omitempty"`
	PowerConnection  string `json:"power_connection"`
	PowerConnectorIn string `json:"power_connector_in"`
}

// AddressChange is one fixture's new DMX position. The three rig operations —
// auto-assign, optimise and make room — all reduce to a list of these, computed
// in the browser where the DMX map already lives (specs/027 research.md R3).
// The server's job is the guarantee, not the arithmetic: the list lands whole
// or not at all.
type AddressChange struct {
	FixtureID       int64 `json:"fixture_id"`
	DMXUniverse     int   `json:"dmx_universe"`
	DMXStartAddress int   `json:"dmx_start_address"`
}

type LightingFixture struct {
	ID    int64 `json:"id"`
	RigID int64 `json:"rig_id"`
	// FixtureNumber is the console (GrandMA) fixture ID — optional planning
	// data, duplicates allowed (the UI flags them).
	FixtureNumber      *int   `json:"fixture_number,omitempty"`
	InventoryItemID    *int64 `json:"inventory_item_id,omitempty"`
	InventoryItemName  string `json:"inventory_item_name,omitempty"`
	CustomName         string `json:"custom_name,omitempty"`
	PositionIndex      int    `json:"position_index"`
	PowerConnection    string `json:"power_connection"`
	PowerChainParentID *int64 `json:"power_chain_parent_id,omitempty"`
	PowerConnectorIn   string `json:"power_connector_in"`
	PowerConnectorOut  string `json:"power_connector_out,omitempty"`
	DMXUniverse        int    `json:"dmx_universe"`
	DMXStartAddress    *int   `json:"dmx_start_address,omitempty"`
	DMXChannelMode     string `json:"dmx_channel_mode,omitempty"`
	DMXChannelCount    int    `json:"dmx_channel_count"`
	Notes              string `json:"notes,omitempty"`
	// TrussName/TrussOffsetCm are read-only, derived from the stage
	// plot's truss attachment (FR-030): the truss the fixture hangs on,
	// and its position along it when known.
	TrussName     string   `json:"truss_name,omitempty"`
	TrussOffsetCm *float64 `json:"truss_offset_cm,omitempty"`
}
