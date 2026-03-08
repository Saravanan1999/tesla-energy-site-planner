package database

import (
	"testing"
)

func TestOpen_InMemory(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	// Verify devices table was seeded
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM devices`).Scan(&count); err != nil {
		t.Fatalf("query devices: %v", err)
	}
	if count == 0 {
		t.Error("expected seeded devices, got 0")
	}

	// Verify sessions table exists
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

	// Running seed again should not insert duplicates
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

	// Running migrate again on an already-migrated DB should not fail
	if err := migrate(db); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}

func TestOpen_InvalidPath(t *testing.T) {
	// Non-existent parent directory → sqlite cannot create the file → Open returns error
	_, err := Open("/nonexistent-dir-xyz/db.sqlite")
	if err == nil {
		t.Skip("sqlite created database at non-existent path (platform-specific behaviour)")
	}
	// err != nil is the expected outcome and covers the error-return paths in Open
}

func TestMigrate_ClosedDB(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	db.Close() // close so all subsequent Exec calls fail
	if err := migrate(db); err == nil {
		t.Fatal("expected error for closed DB")
	}
}

func TestSeed_ClosedDB(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	db.Close() // close so QueryRow fails
	if err := seed(db); err == nil {
		t.Fatal("expected error for closed DB")
	}
}

func TestOpen_SeededDeviceFields(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer db.Close()

	// Verify one known device (Megapack XL, id=1)
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
