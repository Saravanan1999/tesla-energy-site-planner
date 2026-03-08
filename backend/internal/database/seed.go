package database

import "database/sql"

func seed(db *sql.DB) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM devices`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	devices := []struct {
		name, category    string
		widthFt, heightFt int
		energyMWh         float64
		cost, releaseYear int
	}{
		{"Megapack XL", "battery", 40, 10, 4, 120000, 2022},
		{"Megapack 2", "battery", 30, 10, 3, 80000, 2021},
		{"Megapack", "battery", 30, 10, 2, 50000, 2005},
		{"PowerPack", "battery", 10, 10, 1, 10000, 2000},
	}

	stmt, err := db.Prepare(`
		INSERT INTO devices (name, category, width_ft, height_ft, energy_mwh, cost, release_year)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, d := range devices {
		if _, err := stmt.Exec(d.name, d.category, d.widthFt, d.heightFt, d.energyMWh, d.cost, d.releaseYear); err != nil {
			return err
		}
	}

	return nil
}
