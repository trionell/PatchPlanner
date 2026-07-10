package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestOutputDeviceLifecycle covers slice-10 US2 end to end through the real
// HTTP API: shared-device CRUD (including the mutual-exclusivity rule),
// reuse across several output channels' chains counting as one line on the
// rental order (SC-002), and delete-clears-references-without-blocking
// behavior on every hop that pointed at the deleted device (research.md R4).
func TestOutputDeviceLifecycle(t *testing.T) {
	server, database := newTestServer(t)
	eventID := seedEvent(t, server.URL)
	ampItem := seedItem(t, database, "Lab.Gruppen FP2400", 1, 400)
	devicesURL := fmt.Sprintf("%s/events/%d/output-devices", server.URL, eventID)

	// Mutual exclusivity: neither inventory_item_id nor owned_item_id set.
	if status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack"}); status != http.StatusBadRequest {
		t.Errorf("neither item ref set: status %d body %s, want 400", status, raw)
	}

	status, raw := doJSON(t, http.MethodPost, devicesURL, map[string]any{"name": "Amp rack", "inventory_item_id": ampItem})
	if status != http.StatusCreated {
		t.Fatalf("POST device: status %d body %s", status, raw)
	}
	device := decodeJSON[domain.OutputDevice](t, raw)
	if device.Name != "Amp rack" || device.InventoryItemID == nil || *device.InventoryItemID != ampItem {
		t.Errorf("created device = %+v, want name/item round-tripped", device)
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
	status, raw = doJSON(t, http.MethodPatch, fmt.Sprintf("%s/%d", devicesURL, device.ID), map[string]any{"name": "FOH amp rack", "inventory_item_id": ampItem})
	if status != http.StatusOK {
		t.Fatalf("PATCH device: status %d body %s", status, raw)
	}
	if renamed := decodeJSON[domain.OutputDevice](t, raw); renamed.Name != "FOH amp rack" {
		t.Errorf("renamed device = %+v, want name updated", renamed)
	}

	// Three separate output channels reference the same declared device.
	outputsURL := fmt.Sprintf("%s/events/%d/audio-outputs", server.URL, eventID)
	var outputIDs []int64
	for outputNumber := 1; outputNumber <= 3; outputNumber++ {
		status, raw := doJSON(t, http.MethodPost, outputsURL, map[string]any{
			"output_number": outputNumber, "output_type": "iem",
			"chain": []map[string]any{{"hop_kind": "device", "device_source": "shared", "output_device_id": device.ID}},
		})
		if status != http.StatusCreated {
			t.Fatalf("POST output %d: status %d body %s", outputNumber, status, raw)
		}
		outputIDs = append(outputIDs, decodeJSON[domain.AudioPatchOutput](t, raw).ID)
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
	// referencing hop rather than orphaning the FK.
	if status, raw := doJSON(t, http.MethodDelete, fmt.Sprintf("%s/%d", devicesURL, device.ID), nil); status != http.StatusNoContent {
		t.Fatalf("DELETE device: status %d body %s, want 204 (never blocked)", status, raw)
	}
	for _, outputID := range outputIDs {
		status, raw := doJSON(t, http.MethodGet, fmt.Sprintf("%s/events/%d/audio-patch", server.URL, eventID), nil)
		if status != http.StatusOK {
			t.Fatalf("GET patch: status %d body %s", status, raw)
		}
		afterPatch := decodeJSON[struct {
			Outputs []domain.AudioPatchOutput `json:"outputs"`
		}](t, raw)
		var found bool
		for _, output := range afterPatch.Outputs {
			if output.ID != outputID {
				continue
			}
			found = true
			if len(output.Chain) != 1 {
				t.Fatalf("output %d chain = %+v, want 1 hop", outputID, output.Chain)
			}
			hop := output.Chain[0]
			if hop.OutputDeviceID != nil || hop.DeviceSource != "" {
				t.Errorf("output %d hop still references the deleted device: %+v", outputID, hop)
			}
		}
		if !found {
			t.Errorf("output %d missing from audio-patch after device delete", outputID)
		}
	}
}
