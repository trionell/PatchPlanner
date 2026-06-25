package domain

type LightingRig struct {
	ID      int64  `json:"id"`
	EventID int64  `json:"event_id"`
	Name    string `json:"name"`
	Notes   string `json:"notes,omitempty"`
}

type TrussSection struct {
	ID        int64   `json:"id"`
	RigID     int64   `json:"rig_id"`
	Name      string  `json:"name"`
	LengthM   float64 `json:"length_m"`
	TrussType string  `json:"truss_type"`
}

type LightingFixture struct {
	ID                 int64  `json:"id"`
	RigID              int64  `json:"rig_id"`
	TrussSectionID     *int64 `json:"truss_section_id,omitempty"`
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
	TrussSectionName   string `json:"truss_section_name,omitempty"`
}
