## 1. Phone menus

- [ ] 1.1 AudioInputsTab phone overflow: replace "Print patch sheet" (`window.print()`) with "Export PDF" that assigns `audioExportPdfUrl(eventId)`, using the `FileDown` icon as SignalFlowTab does; drop the unused `Printer` import
- [ ] 1.2 AudioOutputsTab phone overflow: the same, and update the "Print is M11" comment

## 2. Verify

- [ ] 2.1 `grep -rn "window.print" frontend/src/components/event/Audio*` returns nothing
- [ ] 2.2 Run the Gates (backend and frontend) and golangci-lint if installed
- [ ] 2.3 Check in the running app at phone width that both menus show Export PDF and that it downloads the audio PDF
