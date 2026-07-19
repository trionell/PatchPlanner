package domain

type LightingRig struct {
	ID      int64  `json:"id"`
	EventID int64  `json:"event_id"`
	Name    string `json:"name"`
	Notes   string `json:"notes,omitempty"`
}

// BulkFixtureRequest expands into N ordinary fixtures of one catalog model
// with shared settings; fixture numbers increment from the optional start.
type BulkFixtureRequest struct {
	InventoryItemID    int64  `json:"inventory_item_id"`
	Quantity           int    `json:"quantity"`
	FixtureNumberStart *int   `json:"fixture_number_start,omitempty"`
	DMXChannelMode     string `json:"dmx_channel_mode,omitempty"`
	DMXChannelCount    int    `json:"dmx_channel_count"`
	DMXUniverse        int    `json:"dmx_universe"`
	PowerConnection    string `json:"power_connection"`
	PowerConnectorIn   string `json:"power_connector_in"`
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
	DMXChainParentID   *int64 `json:"dmx_chain_parent_id,omitempty"`
	Notes              string `json:"notes,omitempty"`
	// TrussName/TrussOffsetCm are read-only, derived from the stage
	// plot's truss attachment (FR-030): the truss the fixture hangs on,
	// and its position along it when known.
	TrussName     string   `json:"truss_name,omitempty"`
	TrussOffsetCm *float64 `json:"truss_offset_cm,omitempty"`
}
