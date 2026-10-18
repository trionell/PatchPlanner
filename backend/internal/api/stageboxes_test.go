package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// D8: a stagebox PATCH is merged onto the stored row. It used to replace the row
// whole, so any body missing a field — or carrying a stale one — wrote it as zero.
func TestStageboxPatchKeepsWhatItLeavesOut(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	item := seedItem(t, database, "DL154", 1, 300)

	status, raw := doJSON(t, http.MethodPost, fmt.Sprintf("%s/events/%d/stageboxes", server.URL, eventID), map[string]any{
		"name": "SB A", "connection_type": "aes", "input_count": 8, "output_count": 16, "inventory_item_id": item,
		"position_x": 100, "input_position_x": 200,
	})
	if status != http.StatusCreated {
		t.Fatalf("POST stagebox: status %d body %s", status, raw)
	}
	sb := decodeJSON[domain.Stagebox](t, raw)
	url := fmt.Sprintf("%s/events/%d/stageboxes/%d", server.URL, eventID, sb.ID)

	status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"output_count": 18})
	if status != http.StatusOK {
		t.Fatalf("PATCH output_count: status %d body %s", status, raw)
	}
	got := decodeJSON[domain.Stagebox](t, raw)
	if got.OutputCount != 18 || got.InputCount != 8 || got.Name != "SB A" || got.ConnectionType != "aes" ||
		got.PositionX != 100 || got.InputPositionX != 200 || got.InventoryItemID == nil || *got.InventoryItemID != item {
		t.Errorf("after a count-only PATCH: %+v", got)
	}

	// Clearing the catalog item is an explicit null, not an absent field.
	status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"inventory_item_id": nil})
	if status != http.StatusOK {
		t.Fatalf("PATCH null item: status %d body %s", status, raw)
	}
	if got = decodeJSON[domain.Stagebox](t, raw); got.InventoryItemID != nil || got.OutputCount != 18 {
		t.Errorf("after clearing the item: %+v", got)
	}

	if status, raw = doJSON(t, http.MethodPatch, url, map[string]any{"input_count": -1}); status != http.StatusBadRequest {
		t.Errorf("negative count: status %d body %s, want 400", status, raw)
	}
}
