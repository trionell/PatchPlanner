-- Event ownership & sharing (Slice 15): every event gets exactly one
-- owner and any number of collaborators (contributor | viewer). Owner is
-- a column, not a membership row, since it can never be demoted/removed
-- (FR-011) and there is always exactly one by construction. Purely
-- additive — no data conversion, no db.go sequencing entry needed;
-- pre-existing rows start with a NULL owner and are claimed on first
-- login after this ships (research.md R3).

ALTER TABLE events ADD COLUMN owner_user_id INTEGER REFERENCES users(id);

CREATE TABLE event_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('contributor', 'viewer')),
  invited_by_user_id INTEGER REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_memberships_user_id ON event_memberships(user_id);
