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
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{EventID: eventID, OutputNumber: 1, OutputType: "foh", DestinationType: "local", AmplifierItemID: &cat.Amp, SpeakerItemID: &cat.Speaker}); err != nil {
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
	// speaker double, amplifier (two-channel device) stays single.
	if _, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{
		EventID: eventID, OutputNumber: 1, OutputType: "foh", DestinationType: "local", Width: "stereo",
		AmplifierItemID: &cat.Amp, SpeakerItemID: &cat.Speaker, CableItemID: &outputCable,
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
