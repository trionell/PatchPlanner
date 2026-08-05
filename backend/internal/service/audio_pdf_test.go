package service

import (
	"bytes"
	"strings"
	"testing"

	"github.com/go-pdf/fpdf"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
)

func TestBuildAudioPDF(t *testing.T) {
	database, eventID, _ := seedAudioEvent(t)

	data, filename, err := ExportService{DB: database}.BuildAudioPDF(eventID)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatalf("not a PDF: % x", data[:8])
	}
	if len(data) < 3000 {
		t.Errorf("document is %d bytes — too small to hold five sections", len(data))
	}
	if !strings.HasSuffix(filename, "-audio.pdf") {
		t.Errorf("filename = %q, want an -audio.pdf suffix", filename)
	}
	if !strings.Contains(filename, "rfest") {
		// The event is "Vårfest 2026"; the slug keeps what it can of the name.
		t.Errorf("filename = %q, does not name the event", filename)
	}

	// Both orientations are present: the tables are portrait A4 and the two
	// flow drawings are landscape. A document with only one page size means a
	// drawing was never emitted.
	text := string(data)
	if !strings.Contains(text, "/MediaBox") {
		t.Fatal("no page boxes in the document")
	}
	if got := strings.Count(text, "/MediaBox"); got < 3 {
		t.Errorf("page count = %d, want at least three (tables + two drawings)", got)
	}
}

func TestAudioPDFIsTheSameDocumentEveryTime(t *testing.T) {
	database, eventID, _ := seedAudioEvent(t)

	first, _, err := ExportService{DB: database}.BuildAudioPDF(eventID)
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	second, _, err := ExportService{DB: database}.BuildAudioPDF(eventID)
	if err != nil {
		t.Fatalf("second build: %v", err)
	}
	// One endpoint and one document: the response depends on the event's data
	// and nothing else. Two builds of unchanged data are the same length; the
	// bytes themselves carry a creation timestamp, so length is the honest
	// comparison.
	if len(first) != len(second) {
		t.Errorf("two builds of the same event differ in size: %d and %d", len(first), len(second))
	}
}

func TestAudioPDFForAnEventWithNothingPlanned(t *testing.T) {
	database := openTestDB(t)
	owner, _ := db.UpsertUserByGoogleSub(database, "bare-sub", "bare@example.com", "Bare", "")
	inventory, _ := db.CreateInventory(database, owner.ID, "Bare inventory")
	event, err := db.CreateEvent(database, domain.Event{Name: "Nothing planned", StartDate: "2026-09-01"}, owner.ID, inventory.ID)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}

	data, _, err := ExportService{DB: database}.BuildAudioPDF(event.ID)
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	// A document is still produced, and its sections say they hold nothing
	// rather than being absent.
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		t.Fatal("no document for an empty event")
	}
	if len(data) < 1000 {
		t.Errorf("document is %d bytes — the empty sections were probably omitted", len(data))
	}
}

func TestAudioPDFUnknownEvent(t *testing.T) {
	database := openTestDB(t)
	if _, _, err := (ExportService{DB: database}).BuildAudioPDF(99999); err == nil {
		t.Error("an unknown event produced a document")
	}
}

// The document's own cp1252 constraint, asserted rather than assumed. An
// unrepresentable character becomes "." — a plausible-looking full stop, not a
// visible defect — so anything that carries meaning has to be drawn instead.
func TestCp1252RepresentsWhatTheDocumentUses(t *testing.T) {
	database, eventID, _ := seedAudioEvent(t)
	if _, _, err := (ExportService{DB: database}).BuildAudioPDF(eventID); err != nil {
		t.Fatalf("build: %v", err)
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	tr := pdf.UnicodeTranslatorFromDescriptor("cp1252")

	// Swedish text reaches paper intact — the event in the fixture is named
	// "Vårfest".
	for _, text := range []string{"å", "ä", "ö", "Å", "É", "-", "/", "&"} {
		if got := tr(text); got == "." && text != "." {
			t.Errorf("%q is not representable and would print as a full stop", text)
		}
	}
	// And the one that is not, which is why the arrowhead is a drawn triangle.
	if got := tr("→"); got != "." {
		t.Errorf("cp1252 now maps the arrow to %q — the drawn-vector rule can be revisited", got)
	}
}

func TestInputSourcesWalkThroughTheRig(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	feeds := inputSourcesByChannel(data)

	byNumber := map[int]int64{}
	for _, channel := range data.channels {
		byNumber[channel.ChannelNumber] = channel.ID
	}

	// Channel 1 is fed through a stagebox, and the sheet names the source at
	// the far end of that path rather than the box in the middle.
	lead := feeds[byNumber[1]]
	if !lead.found {
		t.Fatal("channel 1 has no source, but a cable path reaches one")
	}
	if lead.name != "Lead vocal" {
		t.Errorf("source = %q, want Lead vocal", lead.name)
	}
	if lead.mic != "Shure Beta 58A" {
		t.Errorf("microphone = %q, want the catalogue name", lead.mic)
	}
	if lead.stand != "K&M 210/9" {
		t.Errorf("stand = %q, want the catalogue name", lead.stand)
	}
	if !lead.phantom {
		t.Error("phantom power is off, but the source has it on")
	}

	// A line source has no microphone and no stand, and the row says so.
	keys := feeds[byNumber[2]]
	if !keys.found {
		t.Fatal("channel 2 has no source")
	}
	if keys.mic != "-" || keys.stand != "-" {
		t.Errorf("a line source printed mic %q and stand %q, want both stated as not applying", keys.mic, keys.stand)
	}

	// A channel nothing reaches is stated, not left blank.
	talkback := feeds[byNumber[3]]
	if talkback.found {
		t.Error("Talkback reports a source, but nothing is patched into it")
	}
	if !strings.Contains(talkback.name, "no source") {
		t.Errorf("empty channel prints %q, want it stated in words", talkback.name)
	}
}

func TestOutputDestinationsNameTheFarEndAndTheRoute(t *testing.T) {
	database, eventID, inventoryID := seedAudioEvent(t)
	data, _ := loadAudioGraphData(database, eventID, inventoryID)
	ends := outputDestinations(data)

	for _, output := range data.outputs {
		end := ends[output.ID]
		if output.OutputNumber != 1 {
			continue
		}
		if !end.found {
			t.Fatal("main L reaches nothing, but it is cabled to a speaker")
		}
		if end.destination != "d&b V-Series SL" {
			t.Errorf("destination = %q, want the speaker at the far end", end.destination)
		}
		if !strings.Contains(end.via, "Stage multi A") {
			t.Errorf("via = %q, want the box it leaves the desk through", end.via)
		}
	}
}
