package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

type DevicesHandler struct {
	db *sql.DB
}

func NewDevicesHandler(db *sql.DB) *DevicesHandler {
	return &DevicesHandler{db: db}
}

func (h *DevicesHandler) GetDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeDevicesError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, category, width_ft, height_ft, energy_mwh, cost, release_year
		FROM devices
		ORDER BY id ASC
	`)
	if err != nil {
		writeDevicesError(w, http.StatusInternalServerError, "DB_ERROR", "failed to query devices")
		return
	}
	defer rows.Close()

	devices := []models.Device{}
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(&d.ID, &d.Name, &d.Category, &d.WidthFt, &d.HeightFt, &d.EnergyMWh, &d.Cost, &d.ReleaseYear); err != nil {
			writeDevicesError(w, http.StatusInternalServerError, "SCAN_ERROR", "failed to read devices")
			return
		}
		devices = append(devices, d)
	}

	if err := rows.Err(); err != nil {
		writeDevicesError(w, http.StatusInternalServerError, "ROWS_ERROR", "error iterating devices")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.DevicesResponse{
		Success: true,
		Data:    &models.DevicesData{Devices: devices},
	})
}

func writeDevicesError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.DevicesResponse{
		Success: false,
		Error:   &models.APIError{Code: code, Message: message},
	})
}
