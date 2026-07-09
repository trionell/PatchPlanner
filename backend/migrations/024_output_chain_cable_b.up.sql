-- Side B's own, independently-picked cable for a stereo hop. A stereo
-- hop's two physical cable runs are not always the same length (e.g. an
-- amplifier on one side of the stage needs a shorter cable to the near
-- speaker than the far one): left unset, cable_item_id keeps doubling for
-- both sides as before; set, each side is counted independently
-- (research.md R3 addendum, spec FR-009a).
ALTER TABLE output_chain_hops ADD COLUMN cable_item_id_b INTEGER REFERENCES inventory_items(id);
