package db

import (
	"database/sql"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestRentalSummaryCountsAllSources verifies FR-003/FR-004: every planning
// surface that references a catalog item contributes to the rental order,
// merged into one line per item with an audio/lighting split.
func TestRentalSummaryCountsAllSources(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	createMicInput(t, database, eventID, 1, &cat.Mic)
	createMicInput(t, database, eventID, 2, &cat.Mic)
	createMicInput(t, database, eventID, 3, &cat.DI)

	if _, err := CreateStagebox(database, domain.Stagebox{EventID: eventID, Name: "SB A", ConnectionType: "analog", InventoryItemID: &cat.Stagebox}); err != nil {
		t.Fatalf("create stagebox: %v", err)
	}
	if _, err := CreateStageMulti(database, domain.StageMulti{EventID: eventID, Name: "Multi 1", Channels: 24, ConnectorType: "xlr", InventoryItemID: &cat.Multi}); err != nil {
		t.Fatalf("create stage multi: %v", err)
	}
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: eventID, OutputNumber: 1, OutputType: "foh",
		Chain: []domain.OutputChainHop{
			{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Amp},
			{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker},
		},
	}); err != nil {
		t.Fatalf("create output: %v", err)
	}
	rig, err := GetOrCreateDefaultLightingRig(database, eventID)
	if err != nil {
		t.Fatalf("create rig: %v", err)
	}
	if _, err := CreateLightingFixture(database, domain.LightingFixture{RigID: rig.ID, InventoryItemID: &cat.Fixture, PowerConnection: "grid", PowerConnectorIn: "schuko", DMXUniverse: 1, DMXChannelCount: 16}); err != nil {
		t.Fatalf("create fixture: %v", err)
	}

	summary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	byItem := summaryByItem(summary)

	expect := []struct {
		name     string
		itemID   int64
		audio    int
		lighting int
	}{
		{"mic", cat.Mic, 2, 0},
		{"di", cat.DI, 1, 0},
		{"stagebox", cat.Stagebox, 1, 0},
		{"multi", cat.Multi, 1, 0},
		{"amp", cat.Amp, 1, 0},
		{"speaker", cat.Speaker, 1, 0},
		{"fixture", cat.Fixture, 0, 1},
	}
	for _, want := range expect {
		line, ok := byItem[want.itemID]
		if !ok {
			t.Errorf("%s: missing from rental summary", want.name)
			continue
		}
		if line.QuantityAudio != want.audio || line.QuantityLighting != want.lighting {
			t.Errorf("%s: got audio=%d lighting=%d, want audio=%d lighting=%d", want.name, line.QuantityAudio, line.QuantityLighting, want.audio, want.lighting)
		}
		if line.TotalQuantity != want.audio+want.lighting {
			t.Errorf("%s: total_quantity=%d, want %d", want.name, line.TotalQuantity, want.audio+want.lighting)
		}
	}
	if summary.TotalItems != 7 {
		t.Errorf("total_items=%d, want 7", summary.TotalItems)
	}
	if summary.TotalQuantity != 8 {
		t.Errorf("total_quantity=%d, want 8", summary.TotalQuantity)
	}
	// 2*150 + 100 + 700 + 300 + 400 + 500 + 250
	if summary.TotalExVAT != 2550 {
		t.Errorf("total_ex_vat=%.2f, want 2550", summary.TotalExVAT)
	}
	if summary.HasOverStock {
		t.Errorf("has_over_stock=true for a plan within stock limits")
	}
}

// TestMicBackfillMigration verifies FR-002: legacy free-text mic names are
// linked by case-insensitive match, and unmatched names are kept as labels
// that contribute nothing to the rental order.
func TestMicBackfillMigration(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	// Legacy rows written the way the pre-feature app did: text only.
	mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, mic_model) VALUES (?, 1, 'shure sm58')`, eventID)
	mustExec(t, database, `INSERT INTO audio_patch_inputs (event_id, channel_number, mic_model) VALUES (?, 2, 'Custom Owned Mic')`, eventID)

	execMigrationFile(t, database, "009_input_mic_backfill.up.sql")

	inputs, err := ListAudioPatchInputs(database, eventID)
	if err != nil {
		t.Fatalf("list inputs: %v", err)
	}
	if len(inputs) != 2 {
		t.Fatalf("got %d inputs, want 2", len(inputs))
	}
	matched, unmatched := inputs[0], inputs[1]
	if matched.MicItemID == nil || *matched.MicItemID != cat.Mic {
		t.Errorf("matched row: mic_item_id=%v, want %d", matched.MicItemID, cat.Mic)
	}
	if unmatched.MicItemID != nil {
		t.Errorf("unmatched row: mic_item_id=%v, want nil", unmatched.MicItemID)
	}
	if unmatched.MicLabel != "Custom Owned Mic" {
		t.Errorf("unmatched row: mic_label=%q, want the legacy text preserved", unmatched.MicLabel)
	}

	summary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	byItem := summaryByItem(summary)
	if line := byItem[cat.Mic]; line.QuantityAudio != 1 {
		t.Errorf("linked mic quantity_audio=%d, want 1", line.QuantityAudio)
	}
	if len(summary.Items) != 1 {
		t.Errorf("summary has %d lines, want 1 (unlinked label must not be counted)", len(summary.Items))
	}
}

// TestManualRentalLines verifies FR-005: upsert semantics keyed on
// (event, item), merge with derived quantities, and zero-quantity removal.
func TestManualRentalLines(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	createMicInput(t, database, eventID, 1, &cat.Mic)

	if err := UpsertManualRental(database, eventID, cat.Mic, domain.ManualRentalRequest{QuantityAudio: 2, Notes: "spares"}); err != nil {
		t.Fatalf("upsert manual rental: %v", err)
	}
	line := rentalLine(t, database, eventID, cat.Mic)
	if line.QuantityAudio != 3 || line.TotalQuantity != 3 {
		t.Errorf("merged quantity_audio=%d total=%d, want 3/3", line.QuantityAudio, line.TotalQuantity)
	}
	if line.ManualQuantityAudio != 2 || line.ManualNotes != "spares" {
		t.Errorf("manual share=%d notes=%q, want 2/%q", line.ManualQuantityAudio, line.ManualNotes, "spares")
	}

	// Upsert again: same line updated, not duplicated.
	if err := UpsertManualRental(database, eventID, cat.Mic, domain.ManualRentalRequest{QuantityAudio: 1}); err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	line = rentalLine(t, database, eventID, cat.Mic)
	if line.QuantityAudio != 2 || line.ManualQuantityAudio != 1 {
		t.Errorf("after update: quantity_audio=%d manual=%d, want 2/1", line.QuantityAudio, line.ManualQuantityAudio)
	}

	// Zero quantities remove the manual share entirely.
	if err := UpsertManualRental(database, eventID, cat.Mic, domain.ManualRentalRequest{}); err != nil {
		t.Fatalf("zero upsert: %v", err)
	}
	line = rentalLine(t, database, eventID, cat.Mic)
	if line.QuantityAudio != 1 || line.ManualQuantityAudio != 0 {
		t.Errorf("after removal: quantity_audio=%d manual=%d, want 1/0", line.QuantityAudio, line.ManualQuantityAudio)
	}

	// Delete is idempotent.
	if err := DeleteManualRental(database, eventID, cat.Mic); err != nil {
		t.Fatalf("delete manual rental: %v", err)
	}
}

// TestStockValidation verifies FR-006: lines exceeding available stock are
// flagged individually and roll up into the summary flag.
func TestStockValidation(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	// Stock for the mic is 4; plan 5.
	for channel := 1; channel <= 5; channel++ {
		createMicInput(t, database, eventID, channel, &cat.Mic)
	}
	line := rentalLine(t, database, eventID, cat.Mic)
	if !line.IsOverStock {
		t.Errorf("is_over_stock=false with 5 planned of 4 available")
	}
	if line.QuantityAvailable != 4 {
		t.Errorf("quantity_available=%d, want 4", line.QuantityAvailable)
	}
	summary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	if !summary.HasOverStock {
		t.Errorf("has_over_stock=false, want true")
	}

	// A zero-stock item planned once is over stock too.
	zeroStock := insertItem(t, database, cat.AudioCategoryID, "Rare Ribbon Mic", 0, 900, 30)
	otherEvent := createTestEvent(t, database)
	if err := UpsertManualRental(database, otherEvent, zeroStock, domain.ManualRentalRequest{QuantityAudio: 1}); err != nil {
		t.Fatalf("manual rental: %v", err)
	}
	if line := rentalLine(t, database, otherEvent, zeroStock); !line.IsOverStock {
		t.Errorf("zero-stock item not flagged")
	}

	// An event fully within stock has no flags.
	calmEvent := createTestEvent(t, database)
	createMicInput(t, database, calmEvent, 1, &cat.Mic)
	calm, err := GetRentalSummary(database, calmEvent)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	if calm.HasOverStock {
		t.Errorf("has_over_stock=true for a plan within stock limits")
	}
}

// TestStereoRentalDoubling verifies FR-005/FR-008: a stereo channel doubles
// its per-side physical equipment (mic/source item, cable, stand, speaker)
// while two-channel devices (DI, amplifier) stay single-counted. The
// stereo-mic case specifically guards against reintroducing the R4 bug,
// where mic_item_id's doubling must exclude DI rows since that column also
// stores the DI box itself on DI-type channels.
func TestStereoRentalDoubling(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)
	cable := insertItem(t, database, cat.AudioCategoryID, "Mikrofonkabel", 10, 20, 40)
	stand := insertItem(t, database, cat.AudioCategoryID, "Mic Stand", 10, 30, 41)
	outputCable := insertItem(t, database, cat.AudioCategoryID, "Speakon Cable", 10, 25, 42)

	// Stereo MIC input: mic, cable, stand all picked — every per-side arm
	// must double, including mic_item_id (non-DI row).
	if _, err := CreateAudioPatchInput(database, domain.AudioPatchInput{
		EventID: eventID, ChannelNumber: 1, SignalType: "mic", Width: "stereo",
		MicItemID: &cat.Mic, CableItemID: &cable, StandItemID: &stand,
	}); err != nil {
		t.Fatalf("create stereo mic input: %v", err)
	}

	// Stereo output: cable, speaker, amplifier all picked — cable and
	// speaker double (plain per-hop items); amplifier stays single because
	// it's declared as a shared device (research.md R3: shared device hops
	// never double, regardless of how many channels reference them).
	ampDevice, err := CreateOutputDevice(database, domain.OutputDevice{EventID: eventID, Name: "FOH Amp", InventoryItemID: &cat.Amp})
	if err != nil {
		t.Fatalf("create shared amp device: %v", err)
	}
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: eventID, OutputNumber: 1, OutputType: "foh", Width: "stereo",
		Chain: []domain.OutputChainHop{
			{HopKind: "device", DeviceSource: "shared", OutputDeviceID: &ampDevice.ID, CableItemID: &outputCable},
			{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker},
		},
	}); err != nil {
		t.Fatalf("create stereo output: %v", err)
	}

	summary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	byItem := summaryByItem(summary)

	expect := []struct {
		name   string
		itemID int64
		want   int
	}{
		{"stereo mic (per-side, doubled)", cat.Mic, 2},
		{"stereo input cable (per-side, doubled)", cable, 2},
		{"stereo stand (per-side, doubled)", stand, 2},
		{"stereo output cable (per-side, doubled)", outputCable, 2},
		{"stereo speaker (per-side, doubled)", cat.Speaker, 2},
		{"stereo amplifier (two-channel device, single)", cat.Amp, 1},
	}
	for _, want := range expect {
		line, ok := byItem[want.itemID]
		if !ok {
			t.Errorf("%s: missing from rental summary", want.name)
			continue
		}
		if line.QuantityAudio != want.want {
			t.Errorf("%s: quantity_audio=%d, want %d", want.name, line.QuantityAudio, want.want)
		}
	}
}

// TestDISourceCableCounting verifies FR-006/FR-007/FR-009: a DI channel's
// source cable is counted (closing the price-list leak), once on a mono DI,
// and once or twice on a stereo DI depending on the two_cables/splitter
// choice — while the DI→preamp cable (cable_item_id) always doubles on a
// stereo row regardless of that choice.
func TestDISourceCableCounting(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	sourceCable := insertItem(t, database, cat.AudioCategoryID, "Linekabel Tele-tele", 10, 15, 43)
	splitterCable := insertItem(t, database, cat.AudioCategoryID, "TRS-2xTS Splitter", 10, 25, 44)

	// Mono DI with a source cable: DI, its XLR (cable_item_id), and the
	// source cable all count once.
	monoEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchInput(database, domain.AudioPatchInput{
		EventID: monoEvent, ChannelNumber: 1, SignalType: "di", Width: "mono", SourceCabling: "two_cables",
		MicItemID: &cat.DI, CableItemID: &cat.Mic, SourceCableItemID: &sourceCable,
	}); err != nil {
		t.Fatalf("create mono DI input: %v", err)
	}
	monoSummary, err := GetRentalSummary(database, monoEvent)
	if err != nil {
		t.Fatalf("get mono rental summary: %v", err)
	}
	monoByItem := summaryByItem(monoSummary)
	if got := monoByItem[cat.DI].QuantityAudio; got != 1 {
		t.Errorf("mono DI: quantity_audio=%d, want 1", got)
	}
	if got := monoByItem[sourceCable].QuantityAudio; got != 1 {
		t.Errorf("mono DI source cable: quantity_audio=%d, want 1", got)
	}

	// Stereo DI with two_cables: DI stays 1 (two-channel device), its own
	// DI→preamp cable doubles (physically two cables to two inputs), the
	// source cable doubles too (two individual cables chosen).
	twoCablesEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchInput(database, domain.AudioPatchInput{
		EventID: twoCablesEvent, ChannelNumber: 1, SignalType: "di", Width: "stereo", SourceCabling: "two_cables",
		MicItemID: &cat.DI, CableItemID: &cat.Mic, SourceCableItemID: &sourceCable,
	}); err != nil {
		t.Fatalf("create stereo DI (two_cables) input: %v", err)
	}
	twoCablesSummary, err := GetRentalSummary(database, twoCablesEvent)
	if err != nil {
		t.Fatalf("get two_cables rental summary: %v", err)
	}
	twoCablesByItem := summaryByItem(twoCablesSummary)
	if got := twoCablesByItem[cat.DI].QuantityAudio; got != 1 {
		t.Errorf("stereo DI (two_cables): DI quantity_audio=%d, want 1", got)
	}
	if got := twoCablesByItem[cat.Mic].QuantityAudio; got != 2 {
		t.Errorf("stereo DI (two_cables): DI->preamp cable quantity_audio=%d, want 2", got)
	}
	if got := twoCablesByItem[sourceCable].QuantityAudio; got != 2 {
		t.Errorf("stereo DI (two_cables): source cable quantity_audio=%d, want 2", got)
	}

	// Stereo DI with a splitter: the source cable (now the splitter item)
	// counts once — one splitter feeds both physical inputs.
	splitterEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchInput(database, domain.AudioPatchInput{
		EventID: splitterEvent, ChannelNumber: 1, SignalType: "di", Width: "stereo", SourceCabling: "splitter",
		MicItemID: &cat.DI, CableItemID: &cat.Mic, SourceCableItemID: &splitterCable,
	}); err != nil {
		t.Fatalf("create stereo DI (splitter) input: %v", err)
	}
	splitterSummary, err := GetRentalSummary(database, splitterEvent)
	if err != nil {
		t.Fatalf("get splitter rental summary: %v", err)
	}
	splitterByItem := summaryByItem(splitterSummary)
	if got := splitterByItem[cat.DI].QuantityAudio; got != 1 {
		t.Errorf("stereo DI (splitter): DI quantity_audio=%d, want 1", got)
	}
	if got := splitterByItem[splitterCable].QuantityAudio; got != 1 {
		t.Errorf("stereo DI (splitter): source cable quantity_audio=%d, want 1", got)
	}
}

// TestOutputChainRentalDoubling verifies research.md R3/R7: a stereo
// output channel doubles a non-shared device hop's item and any hop's
// cable, while a hop referencing a declared shared device stays single —
// exactly the amplifier/speaker split the old flat model had, now
// expressed through the chain model instead of two fixed columns.
func TestOutputChainRentalDoubling(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	speakerCable := insertItem(t, database, cat.AudioCategoryID, "Speakon Cable", 10, 25, 50)

	// Two separate events: one stereo, one mono, each with its own shared
	// device declaration (declarations are event-scoped).
	stereoEvent := createTestEvent(t, database)
	stereoAmp, err := CreateOutputDevice(database, domain.OutputDevice{EventID: stereoEvent, Name: "Amp", InventoryItemID: &cat.Amp})
	if err != nil {
		t.Fatalf("create shared device: %v", err)
	}
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: stereoEvent, OutputNumber: 1, OutputType: "foh", Width: "stereo",
		Chain: []domain.OutputChainHop{
			{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &speakerCable},
			{HopKind: "device", DeviceSource: "shared", OutputDeviceID: &stereoAmp.ID},
		},
	}); err != nil {
		t.Fatalf("create stereo output: %v", err)
	}
	stereoSummary, err := GetRentalSummary(database, stereoEvent)
	if err != nil {
		t.Fatalf("get stereo rental summary: %v", err)
	}
	stereoByItem := summaryByItem(stereoSummary)
	if got := stereoByItem[cat.Speaker].QuantityAudio; got != 2 {
		t.Errorf("stereo non-shared device hop: quantity_audio=%d, want 2", got)
	}
	if got := stereoByItem[speakerCable].QuantityAudio; got != 2 {
		t.Errorf("stereo hop cable: quantity_audio=%d, want 2", got)
	}
	if got := stereoByItem[cat.Amp].QuantityAudio; got != 1 {
		t.Errorf("stereo shared device hop: quantity_audio=%d, want 1 (never doubles)", got)
	}

	monoEvent := createTestEvent(t, database)
	monoAmp, err := CreateOutputDevice(database, domain.OutputDevice{EventID: monoEvent, Name: "Amp", InventoryItemID: &cat.Amp})
	if err != nil {
		t.Fatalf("create shared device: %v", err)
	}
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: monoEvent, OutputNumber: 1, OutputType: "foh", Width: "mono",
		Chain: []domain.OutputChainHop{
			{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &speakerCable},
			{HopKind: "device", DeviceSource: "shared", OutputDeviceID: &monoAmp.ID},
		},
	}); err != nil {
		t.Fatalf("create mono output: %v", err)
	}
	monoSummary, err := GetRentalSummary(database, monoEvent)
	if err != nil {
		t.Fatalf("get mono rental summary: %v", err)
	}
	monoByItem := summaryByItem(monoSummary)
	if got := monoByItem[cat.Speaker].QuantityAudio; got != 1 {
		t.Errorf("mono non-shared device hop: quantity_audio=%d, want 1", got)
	}
	if got := monoByItem[speakerCable].QuantityAudio; got != 1 {
		t.Errorf("mono hop cable: quantity_audio=%d, want 1", got)
	}
	if got := monoByItem[cat.Amp].QuantityAudio; got != 1 {
		t.Errorf("mono shared device hop: quantity_audio=%d, want 1", got)
	}
}

// TestOutputHopIndependentCablePicks verifies the fix for a stereo hop
// whose two physical runs need different cables — e.g. an amplifier on
// one side of the stage needs a shorter cable to the near speaker than
// the far one. Leaving CableItemIDB unset keeps the default "same cable
// both sides" doubling; setting it makes each side an independent, single
// count (even when both sides happen to pick the same catalog item).
func TestOutputHopIndependentCablePicks(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	shortCable := insertItem(t, database, cat.AudioCategoryID, "Speakon 5m", 10, 15, 60)
	longCable := insertItem(t, database, cat.AudioCategoryID, "Speakon 20m", 10, 35, 61)

	// Default: no side-B cable set, still doubles.
	defaultEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: defaultEvent, OutputNumber: 1, OutputType: "foh", Width: "stereo",
		Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &shortCable}},
	}); err != nil {
		t.Fatalf("create default output: %v", err)
	}
	defaultSummary, err := GetRentalSummary(database, defaultEvent)
	if err != nil {
		t.Fatalf("get default rental summary: %v", err)
	}
	if got := summaryByItem(defaultSummary)[shortCable].QuantityAudio; got != 2 {
		t.Errorf("no side-B cable set: quantity_audio=%d, want 2 (default doubling)", got)
	}

	// Independent picks: near speaker gets the short cable, far speaker
	// the long one — each counted once, not doubled.
	independentEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: independentEvent, OutputNumber: 1, OutputType: "foh", Width: "stereo",
		Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &shortCable, CableItemIDB: &longCable}},
	}); err != nil {
		t.Fatalf("create independent-cable output: %v", err)
	}
	independentSummary, err := GetRentalSummary(database, independentEvent)
	if err != nil {
		t.Fatalf("get independent rental summary: %v", err)
	}
	byItem := summaryByItem(independentSummary)
	if got := byItem[shortCable].QuantityAudio; got != 1 {
		t.Errorf("side A cable with side B set: quantity_audio=%d, want 1 (not doubled)", got)
	}
	if got := byItem[longCable].QuantityAudio; got != 1 {
		t.Errorf("side B cable: quantity_audio=%d, want 1", got)
	}

	// Same item picked on both sides explicitly still sums to 2 overall —
	// via two independent ×1 picks, not the ×2 doubling formula.
	sameItemEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: sameItemEvent, OutputNumber: 1, OutputType: "foh", Width: "stereo",
		Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &shortCable, CableItemIDB: &shortCable}},
	}); err != nil {
		t.Fatalf("create same-item-both-sides output: %v", err)
	}
	sameItemSummary, err := GetRentalSummary(database, sameItemEvent)
	if err != nil {
		t.Fatalf("get same-item rental summary: %v", err)
	}
	if got := summaryByItem(sameItemSummary)[shortCable].QuantityAudio; got != 2 {
		t.Errorf("same cable explicitly picked both sides: quantity_audio=%d, want 2", got)
	}

	// Mono channel: CableItemIDB is ignored regardless (inert-not-lost,
	// same pattern as every other side-B field).
	monoEvent := createTestEvent(t, database)
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: monoEvent, OutputNumber: 1, OutputType: "foh", Width: "mono",
		Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "inventory", InventoryItemID: &cat.Speaker, CableItemID: &shortCable, CableItemIDB: &longCable}},
	}); err != nil {
		t.Fatalf("create mono output with stale side-B cable: %v", err)
	}
	monoCableSummary, err := GetRentalSummary(database, monoEvent)
	if err != nil {
		t.Fatalf("get mono cable rental summary: %v", err)
	}
	monoCableByItem := summaryByItem(monoCableSummary)
	if got := monoCableByItem[shortCable].QuantityAudio; got != 1 {
		t.Errorf("mono side A cable: quantity_audio=%d, want 1", got)
	}
	if _, found := monoCableByItem[longCable]; found {
		t.Errorf("mono side-B cable should not count at all, found: %+v", monoCableByItem[longCable])
	}
}

// TestOutputDeviceSharedAcrossChannels verifies FR-007/FR-008/SC-002: a
// shared device referenced by several output channels' chains is counted
// exactly once on the rental order, regardless of how many chains
// reference it.
func TestOutputDeviceSharedAcrossChannels(t *testing.T) {
	database := openTestDB(t)
	cat := seedCatalog(t, database)
	eventID := createTestEvent(t, database)

	headphoneAmp, err := CreateOutputDevice(database, domain.OutputDevice{EventID: eventID, Name: "IEM headphone amp", InventoryItemID: &cat.Amp})
	if err != nil {
		t.Fatalf("create shared device: %v", err)
	}
	for outputNumber := 1; outputNumber <= 3; outputNumber++ {
		if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
			EventID: eventID, OutputNumber: outputNumber, OutputType: "iem",
			Chain: []domain.OutputChainHop{{HopKind: "device", DeviceSource: "shared", OutputDeviceID: &headphoneAmp.ID}},
		}); err != nil {
			t.Fatalf("create output %d: %v", outputNumber, err)
		}
	}

	summary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary: %v", err)
	}
	byItem := summaryByItem(summary)
	if got := byItem[cat.Amp].QuantityAudio; got != 1 {
		t.Errorf("shared device referenced by 3 chains: quantity_audio=%d, want 1", got)
	}

	// Deleting the shared device clears every hop that referenced it
	// instead of being blocked (research.md R4) — the rental line drops
	// to zero (item no longer referenced at all).
	if err := DeleteOutputDevice(database, headphoneAmp.ID); err != nil {
		t.Fatalf("delete shared device: %v", err)
	}
	outputs, err := ListAudioPatchOutputs(database, eventID)
	if err != nil {
		t.Fatalf("list outputs: %v", err)
	}
	for _, output := range outputs {
		for _, hop := range output.Chain {
			if hop.OutputDeviceID != nil || hop.DeviceSource != "" {
				t.Errorf("output %d hop still references deleted device: %+v", output.OutputNumber, hop)
			}
		}
	}
	afterSummary, err := GetRentalSummary(database, eventID)
	if err != nil {
		t.Fatalf("get rental summary after delete: %v", err)
	}
	if _, found := summaryByItem(afterSummary)[cat.Amp]; found {
		t.Errorf("amp still on rental summary after its shared device was deleted")
	}
}

func rentalLine(t *testing.T, database *sql.DB, eventID, itemID int64) domain.EventRental {
	t.Helper()
	line, err := GetRentalLine(database, eventID, itemID)
	if err != nil {
		t.Fatalf("get rental line: %v", err)
	}
	return line
}

func mustExec(t *testing.T, database *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := database.Exec(query, args...); err != nil {
		t.Fatalf("exec %s: %v", query, err)
	}
}
