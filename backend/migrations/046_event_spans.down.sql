-- Reversing the addition of a column means its values go with it: any event
-- whose load-in, end or load-out was recorded loses that record and reverts to
-- being one day long. Every other value survives untouched.
--
-- This is unavoidable rather than careless — there is nowhere else in the
-- schema for the three dates to go — and it is the reason to rehearse this
-- migration on a copy before running it anywhere real.
ALTER TABLE events DROP COLUMN load_out_date;
ALTER TABLE events DROP COLUMN end_date;
ALTER TABLE events DROP COLUMN load_in_date;
