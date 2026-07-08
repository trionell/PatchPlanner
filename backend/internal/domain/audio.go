package domain

type Stagebox struct {
	ID              int64  `json:"id"`
	EventID         int64  `json:"event_id"`
	Name            string `json:"name"`
	Model           string `json:"model,omitempty"`
	InputCount      int    `json:"input_count"`
	OutputCount     int    `json:"output_count"`
	ConnectionType  string `json:"connection_type"`
	InventoryItemID *int64 `json:"inventory_item_id,omitempty"`
}

type StageMulti struct {
	ID              int64   `json:"id"`
	EventID         int64   `json:"event_id"`
	Name            string  `json:"name"`
	LengthM         float64 `json:"length_m"`
	Channels        int     `json:"channels"`
	ConnectorType   string  `json:"connector_type"`
	InventoryItemID *int64  `json:"inventory_item_id,omitempty"`
}

type AudioPatchInput struct {
	ID                int64  `json:"id"`
	EventID           int64  `json:"event_id"`
	ChannelNumber     int    `json:"channel_number"`
	ChannelName       string `json:"channel_name,omitempty"`
	SignalType        string `json:"signal_type"`
	PreampConnector   string `json:"preamp_connector"`
	StageboxID        *int64 `json:"stagebox_id,omitempty"`
	StageboxChannel   *int   `json:"stagebox_channel,omitempty"`
	StageMultiID      *int64 `json:"stage_multi_id,omitempty"`
	StageMultiChannel *int   `json:"stage_multi_channel,omitempty"`
	MicItemID         *int64 `json:"mic_item_id,omitempty"`
	// MicLabel is the legacy free-text mic name kept for rows whose text
	// matched no inventory item during the 009 backfill. Read-only: the
	// server never writes it from payloads and clears it once MicItemID
	// is set.
	MicLabel    string `json:"mic_label,omitempty"`
	CableItemID *int64 `json:"cable_item_id,omitempty"`
	StandItemID *int64 `json:"stand_item_id,omitempty"`
	// CableType/CableLengthM/MicStand are the legacy pre-019 values, kept
	// for display on rows that have no catalog pick yet. Read-only: the
	// server never writes them from payloads and clears them once the
	// corresponding *ItemID is set.
	CableType    string  `json:"cable_type,omitempty"`
	CableLengthM float64 `json:"cable_length_m,omitempty"`
	MicStand     string  `json:"mic_stand,omitempty"`
	PhantomPower bool    `json:"phantom_power"`
	DCAGroups    string  `json:"dca_groups,omitempty"`
	Notes        string  `json:"notes,omitempty"`
}

type AudioPatchOutput struct {
	ID                int64  `json:"id"`
	EventID           int64  `json:"event_id"`
	OutputNumber      int    `json:"output_number"`
	OutputName        string `json:"output_name,omitempty"`
	OutputType        string `json:"output_type"`
	DestinationType   string `json:"destination_type"`
	StageboxID        *int64 `json:"stagebox_id,omitempty"`
	StageboxChannel   *int   `json:"stagebox_channel,omitempty"`
	StageMultiID      *int64 `json:"stage_multi_id,omitempty"`
	StageMultiChannel *int   `json:"stage_multi_channel,omitempty"`
	AmplifierItemID   *int64 `json:"amplifier_item_id,omitempty"`
	SpeakerItemID     *int64 `json:"speaker_item_id,omitempty"`
	CableItemID       *int64 `json:"cable_item_id,omitempty"`
	// Legacy pre-019 values; same read-only lifecycle as on inputs.
	CableType    string  `json:"cable_type,omitempty"`
	CableLengthM float64 `json:"cable_length_m,omitempty"`
	Notes        string  `json:"notes,omitempty"`
}
