## Why

On the phone, the ⋯ menu on Audio Inputs and Audio Outputs offers **Print patch sheet**,
which opens the browser's print dialog. There has been no print sheet behind it since
Slice 40 made the audio plan a server-written PDF. Every panel is marked `print:hidden`, so
the browser prints only the event header that isn't: the back button and the tab
selector, over two pages. Desktop and the phone's Signal Flow menu already download the
audio PDF. These two phone menus were missed.

## What Changes

- Audio Inputs, phone: the ⋯ item **Print patch sheet** becomes **Export PDF**, which
  downloads the event's audio document.
- Audio Outputs, phone: the same.
- Neither phone surface opens the browser's print dialog any more.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audio-document-export`: adds a requirement that every audio surface, on the phone as on
  the desktop, reaches the export through the generated document and never through the
  browser's print dialog.

## Impact

- `frontend/src/components/event/AudioInputsTab.tsx`: the phone overflow list.
- `frontend/src/components/event/AudioOutputsTab.tsx`: the phone overflow list.
- No backend, API, migration or `design/` change. `design/patterns.md` §7h already asks
  each phone surface to reach the export it has.
