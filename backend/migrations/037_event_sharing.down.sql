DROP INDEX idx_event_memberships_user_id;
DROP TABLE event_memberships;
ALTER TABLE events DROP COLUMN owner_user_id;
