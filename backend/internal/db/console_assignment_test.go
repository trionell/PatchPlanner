package db

import (
	"testing"

	"github.com/trionell/patchplanner/internal/domain"
)

// TestUpdateInputChannelKeepsDeskWhenOmitted pins the Slice 24 fix for the
// defect the field test found: a PATCH that carries the row's other fields but
// not console_id used to write NULL, so a channel fell off its desk on the first
// save of any field. Nothing in the payload here mentions a console — which is
// exactly what the sheet's row editor used to send.
func TestUpdateInputChannelKeepsDeskWhenOmitted(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	consoles, err := ListConsoles(database, eventID)
	if err != nil {
		t.Fatalf("list consoles: %v", err)
	}
	if len(consoles) != 1 {
		t.Fatalf("consoles = %d, want the one seeded with the event", len(consoles))
	}
	desk := consoles[0]

	channel, err := CreateInputChannel(database, domain.InputChannel{EventID: eventID, ChannelNumber: 1, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if channel.ConsoleID == nil || *channel.ConsoleID != desk.ID {
		t.Fatalf("created channel console = %v, want %d", channel.ConsoleID, desk.ID)
	}

	updated, err := UpdateInputChannel(database, channel.ID, domain.InputChannel{
		ChannelNumber: 1,
		ChannelName:   "Kick In",
		Width:         "mono",
		MixerBehavior: "stereo_channel",
	})
	if err != nil {
		t.Fatalf("update channel: %v", err)
	}
	if updated.ConsoleID == nil || *updated.ConsoleID != desk.ID {
		t.Errorf("console after a rename = %v, want %d — the channel fell off its desk", updated.ConsoleID, desk.ID)
	}
}

// TestUpdateInputChannelRepairsADetachedRow covers the other half of why the
// fallback runs on update and not only on create: a row already detached — every
// row the reporter's own session produced — re-attaches the next time it is
// saved, which is why this slice needed no repair migration.
func TestUpdateInputChannelRepairsADetachedRow(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	consoles, _ := ListConsoles(database, eventID)
	desk := consoles[0]

	channel, err := CreateInputChannel(database, domain.InputChannel{EventID: eventID, ChannelNumber: 2, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if _, err := database.Exec(`UPDATE input_channels SET console_id = NULL WHERE id = ?`, channel.ID); err != nil {
		t.Fatalf("detach channel: %v", err)
	}

	updated, err := UpdateInputChannel(database, channel.ID, domain.InputChannel{ChannelNumber: 2, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("update channel: %v", err)
	}
	if updated.ConsoleID == nil || *updated.ConsoleID != desk.ID {
		t.Errorf("console after save = %v, want the event's only desk %d", updated.ConsoleID, desk.ID)
	}
}

// TestUpdateInputChannelDoesNotGuessBetweenDesks is the limit on the fallback.
// With two desks declared there is no safe answer, and guessing would put a
// monitor send on the FOH desk of a printed patch sheet someone works from.
func TestUpdateInputChannelDoesNotGuessBetweenDesks(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	if _, err := CreateConsole(database, domain.Console{EventID: eventID, Name: "MON", Role: "monitor"}); err != nil {
		t.Fatalf("create second console: %v", err)
	}

	channel, err := CreateInputChannel(database, domain.InputChannel{EventID: eventID, ChannelNumber: 3, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if channel.ConsoleID != nil {
		t.Fatalf("created channel console = %v, want nil with two desks declared", *channel.ConsoleID)
	}

	updated, err := UpdateInputChannel(database, channel.ID, domain.InputChannel{ChannelNumber: 3, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("update channel: %v", err)
	}
	if updated.ConsoleID != nil {
		t.Errorf("console after save = %d, want nil — the desk must be the planner's choice when there is more than one", *updated.ConsoleID)
	}
}

// TestUpdateInputChannelHonoursAnExplicitDesk confirms the fallback never
// overrides a choice that was actually made.
func TestUpdateInputChannelHonoursAnExplicitDesk(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	monitor, err := CreateConsole(database, domain.Console{EventID: eventID, Name: "MON", Role: "monitor"})
	if err != nil {
		t.Fatalf("create second console: %v", err)
	}
	channel, err := CreateInputChannel(database, domain.InputChannel{EventID: eventID, ChannelNumber: 4, Width: "mono", MixerBehavior: "stereo_channel"})
	if err != nil {
		t.Fatalf("create channel: %v", err)
	}

	updated, err := UpdateInputChannel(database, channel.ID, domain.InputChannel{
		ChannelNumber: 4,
		Width:         "mono",
		MixerBehavior: "stereo_channel",
		ConsoleID:     &monitor.ID,
	})
	if err != nil {
		t.Fatalf("update channel: %v", err)
	}
	if updated.ConsoleID == nil || *updated.ConsoleID != monitor.ID {
		t.Errorf("console = %v, want the monitor desk %d", updated.ConsoleID, monitor.ID)
	}
}

// TestUpdateAudioOutputKeepsDeskWhenOmitted is the outputs half of the same
// defect — the outputs sheet had the identical omission.
func TestUpdateAudioOutputKeepsDeskWhenOmitted(t *testing.T) {
	database := openTestDB(t)
	eventID := createTestEvent(t, database)

	consoles, _ := ListConsoles(database, eventID)
	desk := consoles[0]

	output, err := CreateAudioPatchOutput(database, domain.AudioPatchOutput{EventID: eventID, OutputNumber: 1, OutputType: "foh", Width: "mono"})
	if err != nil {
		t.Fatalf("create output: %v", err)
	}
	if output.ConsoleID == nil || *output.ConsoleID != desk.ID {
		t.Fatalf("created output console = %v, want %d", output.ConsoleID, desk.ID)
	}

	updated, err := UpdateAudioPatchOutput(database, output.ID, domain.AudioPatchOutput{
		OutputNumber: 1,
		OutputName:   "FOH L",
		OutputType:   "foh",
		Width:        "mono",
	})
	if err != nil {
		t.Fatalf("update output: %v", err)
	}
	if updated.ConsoleID == nil || *updated.ConsoleID != desk.ID {
		t.Errorf("console after a rename = %v, want %d — the output fell off its desk", updated.ConsoleID, desk.ID)
	}
}
