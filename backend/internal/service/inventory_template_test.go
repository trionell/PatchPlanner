package service

import (
	"bytes"
	"strings"
	"testing"

	"github.com/trionell/patchplanner/internal/db"
	"github.com/xuri/excelize/v2"
)

// TestTemplateRoundTrip is the drift guard required by FR-014: a template
// the system hands out, filled in and handed back, must import cleanly.
// Without this, changing an accepted header alias would silently ship a
// template the importer rejects, and nobody would find out until a user's
// upload failed.
func TestTemplateRoundTrip(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)

	file, err := BuildInventoryTemplate()
	if err != nil {
		t.Fatalf("build template: %v", err)
	}

	// Fill it in the way a user would: straight onto the Inventory sheet,
	// below the headers the template already wrote.
	filled := [][]any{
		{"Microphones", "audio", "Shure SM58", "Dynamic vocal mic", 12, 120},
		{"Moving heads", "lighting", "Robe Pointe", "20/24ch modes", 8, 900},
		{"Truss", "rigging", "Prolyte H30V 2m", "Triangle truss 2m", 10, 150},
	}
	for i, row := range filled {
		cell, err := excelize.CoordinatesToCellName(1, i+2)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := file.SetSheetRow(genericSheet, cell, &row); err != nil {
			t.Fatalf("fill template row %d: %v", i+2, err)
		}
	}
	buf, err := file.WriteToBuffer()
	if err != nil {
		t.Fatalf("write filled template: %v", err)
	}
	_ = file.Close()

	result, err := svc.ImportFromGenericXLSX(inventoryID, TemplateFilename, bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatalf("a filled-in template must import cleanly, got: %v", err)
	}
	if result.CategoriesImported != 3 || result.ItemsImported != 3 {
		t.Errorf("result = %+v, want 3 categories and 3 items", result)
	}
	if len(result.Warnings) != 0 {
		t.Errorf("unexpected warnings from a clean template: %v", result.Warnings)
	}

	categories, err := db.ListInventoryCategories(svc.DB, inventoryID)
	if err != nil {
		t.Fatalf("list categories: %v", err)
	}
	types := map[string]string{}
	for _, c := range categories {
		types[c.Name] = c.CategoryType
	}
	if types["Moving heads"] != "lighting" || types["Truss"] != "rigging" {
		t.Errorf("category types = %v, want the types written in the template", types)
	}
}

// The template's own headers must be exactly what the parser looks for.
// This fails loudly if either side is renamed without the other.
func TestTemplateHeadersMatchParser(t *testing.T) {
	file, err := BuildInventoryTemplate()
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	defer func() { _ = file.Close() }()

	rows, err := file.GetRows(genericSheet)
	if err != nil {
		t.Fatalf("read template rows: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("template Inventory sheet has no header row")
	}

	_, columns, err := locateGenericColumns(rows)
	if err != nil {
		t.Fatalf("the parser does not recognise its own template's headers: %v", err)
	}
	for _, column := range genericColumns {
		if _, ok := columns[column.field]; !ok {
			t.Errorf("template is missing a column the parser knows: %s", column.label)
		}
	}
}

// A pristine template must not smuggle the worked examples into a real
// catalog. They live on a sheet the importer never reads, so an untouched
// template imports nothing rather than seeding everyone's inventory with a
// Shure SM58.
func TestTemplateExamplesAreNotImportable(t *testing.T) {
	svc, inventoryID := newGenericInventory(t)

	file, err := BuildInventoryTemplate()
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	buf, err := file.WriteToBuffer()
	if err != nil {
		t.Fatalf("write template: %v", err)
	}
	_ = file.Close()

	_, err = svc.ImportFromGenericXLSX(inventoryID, TemplateFilename, bytes.NewReader(buf.Bytes()))
	if err == nil {
		t.Fatal("an empty template imported successfully; the examples must not be reachable")
	}
	if !strings.Contains(err.Error(), "no items") {
		t.Errorf("error = %v, want it to explain the sheet is empty", err)
	}

	items, _ := db.ListInventoryItems(svc.DB, inventoryID, nil, "", "", true)
	if len(items) != 0 {
		t.Errorf("empty template created %d items: %+v", len(items), items)
	}
}

// The Example sheet is what teaches the format, so it must actually carry
// the samples and instructions.
func TestTemplateExampleSheetHasGuidance(t *testing.T) {
	file, err := BuildInventoryTemplate()
	if err != nil {
		t.Fatalf("build template: %v", err)
	}
	defer func() { _ = file.Close() }()

	rows, err := file.GetRows(templateExampleSheet)
	if err != nil {
		t.Fatalf("read example sheet: %v", err)
	}
	flat := strings.Join(func() []string {
		var out []string
		for _, row := range rows {
			out = append(out, strings.Join(row, " "))
		}
		return out
	}(), "\n")

	for _, want := range []string{"Shure SM58", "Robe Pointe", "How to use this template", "audio, lighting, rigging, video, misc"} {
		if !strings.Contains(flat, want) {
			t.Errorf("example sheet does not mention %q", want)
		}
	}
}
