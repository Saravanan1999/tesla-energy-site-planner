package database

import "database/sql"

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS devices (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			type         TEXT    NOT NULL,
			label        TEXT    NOT NULL,
			category     TEXT    NOT NULL CHECK(category IN ('battery','transformer')),
			width_ft     INTEGER NOT NULL DEFAULT 0,
			height_ft    INTEGER NOT NULL DEFAULT 0,
			energy_mwh   REAL    NOT NULL DEFAULT 0,
			cost         INTEGER NOT NULL DEFAULT 0,
			release_year INTEGER NOT NULL DEFAULT 0
		);
	`)
	return err
}
