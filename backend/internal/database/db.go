package database

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Open is the public entry point. It opens a SQLite database at path,
// runs migrations, and seeds reference data.
func Open(path string) (*sql.DB, error) {
	return open(path, migrate, seed)
}

// open wires together the default PRAGMA setup with injectable migrate/seed
// functions so tests can exercise every error branch without a real filesystem.
func open(path string, migrateFn, seedFn func(*sql.DB) error) (*sql.DB, error) {
	return openFull(path, defaultPragma, migrateFn, seedFn)
}

// defaultPragma enables WAL journal mode and foreign-key enforcement.
func defaultPragma(db *sql.DB) error {
	_, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`)
	return err
}

// openFull is the fully-injectable implementation used directly by tests.
func openFull(path string, pragmaFn, migrateFn, seedFn func(*sql.DB) error) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	if err := pragmaFn(db); err != nil {
		return nil, fmt.Errorf("pragma setup: %w", err)
	}

	if err := migrateFn(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	if err := seedFn(db); err != nil {
		return nil, fmt.Errorf("seed: %w", err)
	}

	return db, nil
}
