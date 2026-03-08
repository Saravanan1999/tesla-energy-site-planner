package database

import (
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"
)

func TestOpen_InMemory(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM devices`).Scan(&count); err != nil {
		t.Fatalf("query devices: %v", err)
	}
	if count == 0 {
		t.Error("expected seeded devices, got 0")
	}
	if _, err := db.Exec(`SELECT COUNT(*) FROM sessions`); err != nil {
		t.Fatalf("sessions table missing: %v", err)
	}
}

func TestOpen_SeedIdempotent(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	var before int
	db.QueryRow(`SELECT COUNT(*) FROM devices`).Scan(&before)

	if err := seed(db); err != nil {
		t.Fatalf("second seed: %v", err)
	}

	var after int
	db.QueryRow(`SELECT COUNT(*) FROM devices`).Scan(&after)
	if after != before {
		t.Errorf("seed not idempotent: before=%d after=%d", before, after)
	}
}

func TestOpen_MigrateIdempotent(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	if err := migrate(db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

func TestOpen_InvalidPath(t *testing.T) {
	// Non-existent parent directory → sqlite cannot open the file → Open returns error
	_, err := Open("/nonexistent-dir-xyz/db.sqlite")
	if err == nil {
		t.Skip("sqlite created database at non-existent path (platform-specific behaviour)")
	}
}

// --- openFull() error-path tests (injecting stub functions) ---

func TestOpen_PragmaError(t *testing.T) {
	_, err := openFull(":memory:",
		func(*sql.DB) error { return errors.New("pragma failed") },
		migrate, seed)
	if err == nil {
		t.Fatal("expected pragma error, got nil")
	}
}

func TestOpen_MigrateError(t *testing.T) {
	_, err := open(":memory:",
		func(*sql.DB) error { return errors.New("migrate failed") },
		seed)
	if err == nil {
		t.Fatal("expected migrate error, got nil")
	}
}

func TestOpen_SeedError(t *testing.T) {
	_, err := open(":memory:", migrate,
		func(*sql.DB) error { return errors.New("seed failed") })
	if err == nil {
		t.Fatal("expected seed error, got nil")
	}
}

func TestMigrate_ClosedDB(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	db.Close()
	if err := migrate(db); err == nil {
		t.Fatal("expected error for closed DB")
	}
}

func TestSeed_ClosedDB(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	db.Close()
	if err := seed(db); err == nil {
		t.Fatal("expected error for closed DB")
	}
}

// TestSeed_ExecError uses a SQLite trigger to make stmt.Exec fail
// after COUNT and Prepare both succeed — covering the exec error branch.
func TestSeed_ExecError(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer db.Close()

	if err := migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// Trigger raises an error on every INSERT into devices
	_, err = db.Exec(`
		CREATE TRIGGER block_device_insert
		BEFORE INSERT ON devices
		BEGIN
			SELECT RAISE(ABORT, 'insert blocked by test trigger');
		END
	`)
	if err != nil {
		t.Fatalf("create trigger: %v", err)
	}

	if err := seed(db); err == nil {
		t.Fatal("expected exec error from trigger, got nil")
	}
}

func TestOpen_SeededDeviceFields(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	var name string
	var widthFt, heightFt, cost int
	var energyMWh float64
	if err := db.QueryRow(
		`SELECT name, width_ft, height_ft, energy_mwh, cost FROM devices WHERE id = 1`,
	).Scan(&name, &widthFt, &heightFt, &energyMWh, &cost); err != nil {
		t.Fatalf("query device 1: %v", err)
	}
	if name == "" {
		t.Error("expected non-empty name for device 1")
	}
	if widthFt <= 0 || heightFt <= 0 {
		t.Errorf("expected positive dimensions, got %dx%d", widthFt, heightFt)
	}
	if energyMWh <= 0 {
		t.Errorf("expected positive energy, got %v", energyMWh)
	}
	if cost <= 0 {
		t.Errorf("expected positive cost, got %d", cost)
	}
}
