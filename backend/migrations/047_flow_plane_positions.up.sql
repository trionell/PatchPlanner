-- Slice 37. Until now both audio flow canvases derived their coordinate space from
-- the browser window, and four nodes were pinned to that space's edges rather than
-- drawn at the coordinates they held:
--
--   the Sources rail          x = 24
--   the Channels rail         x = canvasWidth - 200 - 24
--   the desk's bus rail       x = 24
--   source/destination devices x = 24 / canvasWidth - 200 - 24
--
-- A pin is not a clamp. The layout computed the pinned x, drew the node there, and
-- the next drag saved *that* number back — so these columns do not hold placements.
-- They hold a record of which window happened to be open. Inverting `x + 224` over
-- one real event recovers four different canvas widths:
--
--   1086 -> 1310    1296 -> 1520    1338 -> 1562    1978 -> 2202
--
-- The canvases now place every node at its own coordinates, so from here these
-- columns mean what they say. This migration is the one-time cost of that: adopting
-- the stored values as-is would open a graph with its rails and speakers in a ragged
-- diagonal, at whatever widths were last used.
--
-- Only the previously-pinned nodes are touched. Stageboxes, stage multis, processing
-- devices and the desks' local jack panels keep their x: it was clamped into the
-- middle lane, but it was chosen by somebody dragging the node.
--
-- 1400 for the right-hand group and 24 for the left is the approved figure. It puts
-- the outboard already sitting between 264 and ~750 comfortably in the middle.

-- The desks' two rails: the channel rail on the input canvas, the bus rail on the
-- output canvas. Each console's local jack panels are deliberately not in this list.
UPDATE event_consoles SET input_position_x = 1400;
UPDATE event_consoles SET position_x = 24;

-- Devices with no inputs are sources; with no outputs, destinations. Anything with
-- both is processing and keeps where it was put. This is the same partition the
-- canvas draws with (lib/outputGraph.ts `nodeRole`), restated here because a
-- migration cannot call it — if that rule ever changes, this file is already history
-- and does not need to follow.
UPDATE output_devices SET position_x = 24 WHERE input_port_count = 0;
UPDATE output_devices SET position_x = 1400 WHERE input_port_count > 0 AND output_port_count = 0;
