-- D9: an X32 · M32's rear aux in sockets become their own node on the input
-- canvas, beside the local jack panel, and need a placement of their own.
--
-- NULL means never placed: the server resolves it to just below the local
-- panel, so the node opens beside the jacks it belongs with rather than at a
-- fixed spot that may already hold a stagebox. Output canvas: none — aux
-- sockets are inputs only.

ALTER TABLE event_consoles ADD COLUMN aux_input_position_x REAL;
ALTER TABLE event_consoles ADD COLUMN aux_input_position_y REAL;
