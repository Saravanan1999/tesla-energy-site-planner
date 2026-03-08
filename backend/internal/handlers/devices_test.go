package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/database"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

func newDevicesHandler(t *testing.T) *DevicesHandler {
	t.Helper()
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewDevicesHandler(db)
}

func TestGetDevices_Success(t *testing.T) {
	h := newDevicesHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/devices", nil)
	w := httptest.NewRecorder()
	h.GetDevices(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp models.DevicesResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Success {
		t.Error("want success=true")
	}
	if resp.Data == nil {
		t.Fatal("expected data in response")
	}
	if len(resp.Data.Devices) == 0 {
		t.Error("expected seeded devices, got none")
	}
}

func TestGetDevices_MethodNotAllowed(t *testing.T) {
	h := newDevicesHandler(t)
	r, _ := http.NewRequest(http.MethodPost, "/api/devices", nil)
	w := httptest.NewRecorder()
	h.GetDevices(w, r)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("want 405, got %d", w.Code)
	}
	var resp models.DevicesResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Success {
		t.Error("want success=false")
	}
}

func TestGetDevices_DeviceFields(t *testing.T) {
	h := newDevicesHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/devices", nil)
	w := httptest.NewRecorder()
	h.GetDevices(w, r)

	var resp models.DevicesResponse
	json.NewDecoder(w.Body).Decode(&resp)

	for _, d := range resp.Data.Devices {
		if d.ID == 0 {
			t.Error("device has zero ID")
		}
		if d.Name == "" {
			t.Errorf("device %d has empty name", d.ID)
		}
		if d.WidthFt <= 0 || d.HeightFt <= 0 {
			t.Errorf("device %d has non-positive dimensions", d.ID)
		}
	}
}

func TestGetDevices_ContentTypeJSON(t *testing.T) {
	h := newDevicesHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/devices", nil)
	w := httptest.NewRecorder()
	h.GetDevices(w, r)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("want application/json, got %q", ct)
	}
}

func TestGetDevices_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	h := NewDevicesHandler(db)
	db.Close() // force subsequent queries to fail

	r, _ := http.NewRequest(http.MethodGet, "/api/devices", nil)
	w := httptest.NewRecorder()
	h.GetDevices(w, r)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
	var resp models.DevicesResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Success {
		t.Error("want success=false")
	}
}
