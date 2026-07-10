package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestOutputDeviceLifecycle covers the shared-device CRUD contract end to
// end through the real HTTP API: mutual-exclusivity on item refs,
// port-count/connector-type consistency, reuse across several output
// channels' cables counting as one line on the rental order (SC-002), and
// delete-clears-cables-without-blocking behavior on every cable that
// pointed at the deleted device (research.md carries forward Slice 10's
// R4).
func TestOutputDeviceLifecycle(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	ampItem := seedItem(t, database, "Lab.Gruppen FP2400", 1, 400)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)
	cablesURL := fmt.Sprintf("%s/events/%d/output-cables", server.URL, eventID)

	// Mutual exclusivity: neither inventory_item_id nor owned_item_id set.
	if status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack", "input_port_count": 1, "input_connector_type": "xlr"}); status != http.StatusBadRequest {
		t.Errorf("neither item ref set: status %d body %s, want 400", status, raw)
	}

	// Port validation: no ports on either side.
	if status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack", "inventory_item_id": ampItem}); status != http.StatusBadRequest {
		t.Errorf("zero ports both sides: status %d body %s, want 400", status, raw)
	}

	// Port validation: a port count set without its connector type.
	if status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack", "inventory_item_id": ampItem, "input_port_count": 1}); status != http.StatusBadRequest {
		t.Errorf("input port count without connector type: status %d body %s, want 400", status, raw)
	}

	status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack", "inventory_item_id": ampItem, "input_port_count": 1, "input_connector_type": "xlr"})
	if status != http.StatusCreated {
		t.Fatalf("POST device: status %d body %s", status, raw)
	}
	device := decodeJSON[domain.OutputDevice](t, raw)
	if device.Name != "Amp rack" || device.InventoryItemID == nil || *device.InventoryItemID != ampItem || device.InputPortCount != 1 {
		t.Errorf("created device = %+v, want name/item/ports round-tripped", device)
	}

	// Listed via the shared audio-patch response.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	patch := decodeJSON[struct {
		OutputDevices []domain.OutputDevice `json:"output_devices"`
	}](t, raw)
	if len(patch.OutputDevices) != 1 {
		t.Fatalf("audio-patch output_devices = %+v, want 1", patch.OutputDevices)
	}

	// Rename round-trips.
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", devicesURL, device.ID), map[string]any{"name": "FOH amp rack", "inventory_item_id": ampItem, "input_port_count": 3, "input_connector_type": "xlr"})
	if status != http.StatusOK {
		t.Fatalf("PATCH device: status %d body %s", status, raw)
	}
	if renamed := decodeJSON[domain.OutputDevice](t, raw); renamed.Name != "FOH amp rack" || renamed.InputPortCount != 3 {
		t.Errorf("renamed device = %+v, want name/ports updated", renamed)
	}

	// Three separate output channels each cable into their own port of the
	// same declared device.
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	for outputNumber := 1; outputNumber <= 3; outputNumber++ {
		status, raw := doJSON(t, http.MethodPost, outputsURL, map[string]any{
			"output_number": outputNumber, "output_type": "iem", "width": "mono",
		})
		if status != http.StatusCreated {
			t.Fatalf("POST output %d: status %d body %s", outputNumber, status, raw)
		}
		outputID := decodeJSON[domain.AudioPatchOutput](t, raw).ID

		status, raw = doJSON(t, http.MethodPost, cablesURL, map[string]any{
			"from_kind": "mixer", "from_id": outputID, "from_port": 0,
			"to_kind": "device", "to_id": device.ID, "to_port": outputNumber - 1,
		})
		if status != http.StatusCreated {
			t.Fatalf("POST cable for output %d: status %d body %s", outputNumber, status, raw)
		}
	}

	// SC-002: counted exactly once regardless of reference count.
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/rentals", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET rentals: status %d body %s", status, raw)
	}
	summary := decodeJSON[domain.RentalSummary](t, raw)
	var ampLine *domain.EventRental
	for i := range summary.Items {
		if summary.Items[i].InventoryItemID == ampItem {
			ampLine = &summary.Items[i]
		}
	}
	if ampLine == nil || ampLine.QuantityAudio != 1 {
		t.Fatalf("amp rental line = %+v, want quantity_audio 1 despite 3 references", ampLine)
	}

	// Deleting the device succeeds (never blocked) and clears every
	// referencing cable rather than orphaning the FK.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", devicesURL, device.ID), nil); status != http.StatusNoContent {
		t.Fatalf("DELETE device: status %d body %s, want 204 (never blocked)", status, raw)
	}
	status, raw = doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
	if status != http.StatusOK {
		t.Fatalf("GET patch: status %d body %s", status, raw)
	}
	afterPatch := decodeJSON[struct {
		Outputs      []domain.AudioPatchOutput `json:"outputs"`
		OutputCables []domain.OutputCable      `json:"output_cables"`
	}](t, raw)
	if len(afterPatch.Outputs) != 3 {
		t.Errorf("outputs missing from audio-patch after device delete: %+v", afterPatch.Outputs)
	}
	for _, cable := range afterPatch.OutputCables {
		if cable.ToKind == "device" && cable.ToID == device.ID {
			t.Errorf("cable still references the deleted device: %+v", cable)
		}
	}
	if len(afterPatch.OutputCables) != 0 {
		t.Errorf("cables remain after their only device was deleted: %+v", afterPatch.OutputCables)
	}
}
