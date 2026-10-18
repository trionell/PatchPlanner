package domain

import (
	"strings"
	"testing"
)

// Every (engine, source, destination) pair the spec names, both ways.
func TestRouteAllowed(t *testing.T) {
	x32, lv1, generic := model(t, "m32"), model(t, "lv1_64"), model(t, DeskModelGeneric)
	cases := []struct {
		m        DeskModel
		src      string
		srcSlot  int
		dst      string
		dstSlot  int
		allowed  bool
		describe string
	}{
		{x32, RouteFromChannel, 0, MixMain, 1, true, "channel → LR"},
		{x32, RouteFromChannel, 0, MixMonitor, 3, true, "channel → monitor"},
		{x32, RouteFromChannel, 0, MixMatrix, 1, false, "no channel into an X32 matrix"},
		{lv1, RouteFromChannel, 0, MixMatrix, 1, true, "LV1 matrix takes channels"},
		{generic, RouteFromChannel, 0, MixMatrix, 1, true, "Generic matrix takes channels"},
		{x32, MixSubgroup, 1, MixSubgroup, 2, false, "no X32 bus → bus"},
		{lv1, MixSubgroup, 5, MixSubgroup, 6, true, "LV1 group 5 → 6"},
		{lv1, MixSubgroup, 5, MixSubgroup, 5, false, "LV1 group never feeds itself"},
		{lv1, MixSubgroup, 5, MixSubgroup, 3, false, "LV1 feed-forward only"},
		{generic, MixSubgroup, 1, MixSubgroup, 2, true, "Generic follows LV1's rule"},
		{x32, MixMonitor, 3, MixMain, 1, true, "X32 any bus → LR"},
		{lv1, MixMonitor, 3, MixMain, 1, false, "LV1 Mon does not feed a main"},
		{lv1, MixSubgroup, 2, MixMain, 1, true, "LV1 group → main"},
		{x32, MixMain, 1, MixMatrix, 1, true, "LR → matrix"},
		{x32, MixFX, 1, MixMatrix, 1, true, "X32 FX bus → matrix"},
		{lv1, MixFX, 1, MixMatrix, 1, false, "LV1 FX aux does not feed a matrix"},
		{lv1, MixMonitor, 1, MixMatrix, 1, true, "LV1 Mon → matrix"},
		{x32, MixMatrix, 1, MixMute, 1, true, "mixes in mute groups"},
		{lv1, MixMain, 1, MixMute, 1, true, "a main in a mute group"},
		{x32, MixSubgroup, 1, MixDCA, 1, false, "a DCA holds channels"},
		{x32, RouteFromChannel, 0, MixDCA, 1, true, "channel → DCA"},
	}
	for _, c := range cases {
		err := c.m.RouteAllowed(c.src, c.srcSlot, c.dst, c.dstSlot)
		if (err == nil) != c.allowed {
			t.Errorf("%s: allowed=%v, got %v", c.describe, c.allowed, err)
		}
	}
}

func TestMixSlots(t *testing.T) {
	x32 := model(t, "x32")
	// Buses 1–4 and 6 taken: a stereo monitor takes 7–8.
	taken := []DeskMix{{ID: 1, Kind: MixSubgroup, Slot: 1}, {ID: 2, Kind: MixSubgroup, Slot: 2}, {ID: 3, Kind: MixMonitor, Slot: 3}, {ID: 4, Kind: MixFX, Slot: 4}, {ID: 5, Kind: MixMonitor, Slot: 6}}
	if slot, ok := x32.FirstFreeMixSlot(MixMonitor, "stereo", taken); !ok || slot != 7 {
		t.Errorf("stereo monitor on %d, want 7", slot)
	}
	if slot, _ := x32.FirstFreeMixSlot(MixMonitor, "mono", taken); slot != 5 {
		t.Errorf("mono monitor on %d, want 5", slot)
	}
	// The shared pool, full: the refusal says how it is spent.
	var full []DeskMix
	for i := 1; i <= 16; i++ {
		kind := MixSubgroup
		if i > 8 {
			kind = MixMonitor
		}
		if i > 14 {
			kind = MixFX
		}
		full = append(full, DeskMix{ID: int64(i), Kind: kind, Slot: i})
	}
	if _, ok := x32.FirstFreeMixSlot(MixMonitor, "mono", full); ok {
		t.Fatal("a full bus pool has no slot")
	}
	if got := x32.FullPoolRefusal("FOH", MixMonitor, full); !strings.Contains(got, "8 subgroups · 6 monitors · 2 FX") {
		t.Errorf("refusal %q", got)
	}
	lv116 := model(t, "lv1_16")
	if got := lv116.FullPoolRefusal("FOH", MixSubgroup, nil); got != "LV1 16 has no groups." {
		t.Errorf("LV1 16 groups: %q", got)
	}
	// LV1: a group is one stereo slot; a stereo Mon takes two of either parity.
	lv1 := model(t, "lv1_64")
	if lv1.MixSlotWidth(MixSubgroup, "stereo") != 1 || lv1.MixSlotWidth(MixMonitor, "stereo") != 2 {
		t.Error("LV1 slot widths")
	}
	if !lv1.MixSlotFits(MixMonitor, "stereo", 2, nil, 0) {
		t.Error("LV1 stereo Mon on 2–3 is legal")
	}
	if x32.MixSlotFits(MixMonitor, "stereo", 2, nil, 0) {
		t.Error("X32 stereo bus on 2–3 is not")
	}
}

func TestMainSlots(t *testing.T) {
	if got := len(model(t, "m32").MainSlots()); got != 2 {
		t.Errorf("M32 mains %d, want LR and M/C", got)
	}
	if got := model(t, "lv1_16").MainSlots(); len(got) != 1 || got[0].Name != "L/R" {
		t.Errorf("LV1 16 mains %+v", got)
	}
	if got := len(model(t, "lv1_64").MainSlots()); got != 3 {
		t.Errorf("LV1 64 mains %d, want L/R, C, Mono", got)
	}
}
