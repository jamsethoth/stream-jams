export const screenEffectSetsMigration = {
  id: "023-screen-effect-sets",
  sql: `
CREATE TABLE screen_effect_sets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120 AND name = trim(name)),
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX screen_effect_sets_one_active ON screen_effect_sets(active) WHERE active = 1;
INSERT INTO screen_effect_sets (id, name, active) VALUES ('screen-effects-default', 'Default', 1);
CREATE TABLE screen_effect_set_memberships (
  effect_id TEXT PRIMARY KEY NOT NULL REFERENCES screen_effects(id) ON DELETE CASCADE,
  set_id TEXT NOT NULL REFERENCES screen_effect_sets(id) ON DELETE RESTRICT
);
CREATE INDEX screen_effect_memberships_set ON screen_effect_set_memberships(set_id);
INSERT INTO screen_effect_set_memberships (effect_id, set_id)
  SELECT id, 'screen-effects-default' FROM screen_effects;
CREATE TRIGGER screen_effect_assign_set AFTER INSERT ON screen_effects BEGIN
  INSERT INTO screen_effect_set_memberships (effect_id, set_id)
    SELECT NEW.id, id FROM screen_effect_sets WHERE active = 1;
END;
`
} as const;
