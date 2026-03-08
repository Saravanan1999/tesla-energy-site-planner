package services

import (
	"context"
	"testing"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/database"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

func newSessionSvc(t *testing.T) *SessionService {
	t.Helper()
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewSessionService(db)
}

func validCreateReq() models.CreateSessionRequest {
	return models.CreateSessionRequest{
		Name:      "Test Site",
		Devices:   []models.SessionDevice{{ID: 4, Quantity: 2}},
		Objective: models.ObjectiveMinArea,
	}
}

// --------------- Create ---------------

func TestCreate_Success(t *testing.T) {
	svc := newSessionSvc(t)
	data, apiErr := svc.Create(context.Background(), validCreateReq())
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if data.SessionID == "" {
		t.Error("expected non-empty session ID")
	}
	if data.Name != "Test Site" {
		t.Errorf("want name 'Test Site', got %q", data.Name)
	}
}

func TestCreate_EmptyName(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.Name = "   "
	_, apiErr := svc.Create(context.Background(), req)
	if apiErr == nil {
		t.Fatal("expected error for empty name")
	}
	if apiErr.Code != models.ErrorInvalidConfig {
		t.Errorf("want INVALID_CONFIG, got %v", apiErr.Code)
	}
}

func TestCreate_NoDevices(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.Devices = nil
	_, apiErr := svc.Create(context.Background(), req)
	if apiErr == nil {
		t.Fatal("expected error for no devices")
	}
}

func TestCreate_ZeroQuantity(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.Devices = []models.SessionDevice{{ID: 4, Quantity: 0}}
	_, apiErr := svc.Create(context.Background(), req)
	if apiErr == nil {
		t.Fatal("expected error for zero quantity")
	}
}

func TestCreate_UnknownDevice(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.Devices = []models.SessionDevice{{ID: 9999, Quantity: 1}}
	_, apiErr := svc.Create(context.Background(), req)
	if apiErr == nil {
		t.Fatal("expected error for unknown device")
	}
}

func TestCreate_DuplicateNameUpdates(t *testing.T) {
	svc := newSessionSvc(t)
	first, _ := svc.Create(context.Background(), validCreateReq())

	// Create again with same name but different devices
	req := validCreateReq()
	req.Devices = []models.SessionDevice{{ID: 1, Quantity: 1}}
	second, apiErr := svc.Create(context.Background(), req)
	if apiErr != nil {
		t.Fatalf("unexpected error on duplicate name: %+v", apiErr)
	}
	// Should be an update — same session ID
	if second.SessionID != first.SessionID {
		t.Errorf("expected same session ID on upsert: got %q != %q", second.SessionID, first.SessionID)
	}
}

func TestCreate_DefaultObjective(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.Objective = ""
	data, apiErr := svc.Create(context.Background(), req)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	// Retrieve it to verify objective defaulted
	record, _ := svc.GetByID(context.Background(), data.SessionID)
	if record.Objective != models.ObjectiveMinArea {
		t.Errorf("want default min_area, got %v", record.Objective)
	}
}

func TestCreate_WithSitePlan(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.SitePlan = &models.SitePlanData{
		Objective: models.ObjectiveMinArea,
	}
	data, apiErr := svc.Create(context.Background(), req)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	record, apiErr := svc.GetByID(context.Background(), data.SessionID)
	if apiErr != nil {
		t.Fatalf("GetByID failed: %+v", apiErr)
	}
	if record.SitePlan == nil {
		t.Error("expected stored site plan, got nil")
	}
}

// --------------- UpdateByID ---------------

func TestUpdateByID_Success(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())

	req := models.CreateSessionRequest{
		Name:      "Updated Site",
		Devices:   []models.SessionDevice{{ID: 1, Quantity: 2}},
		Objective: models.ObjectiveMinCost,
	}
	updated, apiErr := svc.UpdateByID(context.Background(), created.SessionID, req)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if updated.Name != "Updated Site" {
		t.Errorf("want 'Updated Site', got %q", updated.Name)
	}
	if updated.SessionID != created.SessionID {
		t.Errorf("session ID changed after update")
	}
}

func TestUpdateByID_NotFound(t *testing.T) {
	svc := newSessionSvc(t)
	_, apiErr := svc.UpdateByID(context.Background(), "nonexistent-id", validCreateReq())
	if apiErr == nil {
		t.Fatal("expected error for nonexistent session")
	}
	if apiErr.Code != models.ErrorInvalidConfig {
		t.Errorf("want INVALID_CONFIG, got %v", apiErr.Code)
	}
}

func TestUpdateByID_EmptyName(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())
	req := validCreateReq()
	req.Name = ""
	_, apiErr := svc.UpdateByID(context.Background(), created.SessionID, req)
	if apiErr == nil {
		t.Fatal("expected error for empty name")
	}
}

// --------------- GetByID ---------------

func TestGetByID_Success(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())

	record, apiErr := svc.GetByID(context.Background(), created.SessionID)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if record.Meta.SessionID != created.SessionID {
		t.Errorf("session ID mismatch")
	}
	if record.Meta.Name != "Test Site" {
		t.Errorf("want 'Test Site', got %q", record.Meta.Name)
	}
	if len(record.Devices) == 0 {
		t.Error("expected devices")
	}
}

func TestGetByID_NotFound(t *testing.T) {
	svc := newSessionSvc(t)
	_, apiErr := svc.GetByID(context.Background(), "missing-id")
	if apiErr == nil {
		t.Fatal("expected error for missing session")
	}
}

// --------------- List ---------------

func TestList_Empty(t *testing.T) {
	svc := newSessionSvc(t)
	sessions, apiErr := svc.List(context.Background())
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if sessions == nil {
		t.Error("expected non-nil empty slice")
	}
	if len(sessions) != 0 {
		t.Errorf("want 0 sessions, got %d", len(sessions))
	}
}

func TestList_ReturnsSessions(t *testing.T) {
	svc := newSessionSvc(t)
	svc.Create(context.Background(), validCreateReq())

	req2 := validCreateReq()
	req2.Name = "Second Site"
	svc.Create(context.Background(), req2)

	sessions, apiErr := svc.List(context.Background())
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if len(sessions) != 2 {
		t.Errorf("want 2 sessions, got %d", len(sessions))
	}
}

// --------------- DeleteByID ---------------

func TestDeleteByID_Success(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())

	if apiErr := svc.DeleteByID(context.Background(), created.SessionID); apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}

	// Verify it's gone
	_, apiErr := svc.GetByID(context.Background(), created.SessionID)
	if apiErr == nil {
		t.Fatal("expected error after deletion")
	}
}

func TestDeleteByID_NotFound(t *testing.T) {
	svc := newSessionSvc(t)
	apiErr := svc.DeleteByID(context.Background(), "nonexistent-id")
	if apiErr == nil {
		t.Fatal("expected error for nonexistent session")
	}
	if apiErr.Code != models.ErrorInvalidConfig {
		t.Errorf("want INVALID_CONFIG, got %v", apiErr.Code)
	}
}

func TestUpdateByID_WithSitePlan(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())

	req := models.CreateSessionRequest{
		Name:      "Updated With Plan",
		Devices:   []models.SessionDevice{{ID: 4, Quantity: 1}},
		Objective: models.ObjectiveMinArea,
		SitePlan:  &models.SitePlanData{Objective: models.ObjectiveMinArea},
	}
	updated, apiErr := svc.UpdateByID(context.Background(), created.SessionID, req)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if updated.Name != "Updated With Plan" {
		t.Errorf("want 'Updated With Plan', got %q", updated.Name)
	}

	// Verify site plan was persisted
	record, apiErr := svc.GetByID(context.Background(), created.SessionID)
	if apiErr != nil {
		t.Fatalf("GetByID failed: %+v", apiErr)
	}
	if record.SitePlan == nil {
		t.Error("expected stored site plan after update")
	}
}

func TestUpdateByID_DefaultObjective(t *testing.T) {
	svc := newSessionSvc(t)
	created, _ := svc.Create(context.Background(), validCreateReq())

	req := models.CreateSessionRequest{
		Name:    "No Objective",
		Devices: []models.SessionDevice{{ID: 4, Quantity: 1}},
		// Objective intentionally omitted → should default to min_area
	}
	_, apiErr := svc.UpdateByID(context.Background(), created.SessionID, req)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}

	record, _ := svc.GetByID(context.Background(), created.SessionID)
	if record.Objective != models.ObjectiveMinArea {
		t.Errorf("want default min_area, got %v", record.Objective)
	}
}

func TestGetByID_WithStoredSitePlan(t *testing.T) {
	svc := newSessionSvc(t)
	req := validCreateReq()
	req.SitePlan = &models.SitePlanData{
		Objective: models.ObjectiveMinArea,
		Metrics:   models.SiteMetrics{TotalBatteryCount: 2},
	}
	created, _ := svc.Create(context.Background(), req)

	record, apiErr := svc.GetByID(context.Background(), created.SessionID)
	if apiErr != nil {
		t.Fatalf("GetByID failed: %+v", apiErr)
	}
	if record.SitePlan == nil {
		t.Error("expected stored site plan")
	}
	if record.SitePlan.Metrics.TotalBatteryCount != 2 {
		t.Errorf("want 2 batteries in stored plan, got %d", record.SitePlan.Metrics.TotalBatteryCount)
	}
}

func TestDeleteByID_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSessionService(db)
	db.Close() // force ExecContext to fail
	apiErr := svc.DeleteByID(context.Background(), "some-id")
	if apiErr == nil {
		t.Fatal("expected error for closed DB in DeleteByID")
	}
	if apiErr.Code != models.ErrorInternal {
		t.Errorf("want INTERNAL_ERROR, got %v", apiErr.Code)
	}
}

func TestUpdateByID_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSessionService(db)
	db.Close() // force QueryRowContext (session verification) to fail
	_, apiErr := svc.UpdateByID(context.Background(), "some-id", validCreateReq())
	if apiErr == nil {
		t.Fatal("expected error for closed DB in UpdateByID")
	}
	if apiErr.Code != models.ErrorInternal {
		t.Errorf("want INTERNAL_ERROR, got %v", apiErr.Code)
	}
}

func TestInsert_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSessionService(db)
	db.Close() // force INSERT to fail
	_, apiErr := svc.insert(context.Background(), "test-name", "[]", "min_area", "")
	if apiErr == nil {
		t.Fatal("expected error for closed DB in insert")
	}
}

func TestUpdate_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSessionService(db)
	db.Close() // force UPDATE to fail
	_, apiErr := svc.update(context.Background(), "some-id", "Test", "[]", "min_area", "")
	if apiErr == nil {
		t.Fatal("expected error for closed DB in update")
	}
}

func TestList_InvalidTimestamp(t *testing.T) {
	svc := newSessionSvc(t)
	// Insert a session with a non-RFC3339 timestamp directly to trigger timestamp parse error
	_, err := svc.db.Exec(
		`INSERT INTO sessions (session_id, name, devices, saved_at, optimization_objective, site_plan_json)
		 VALUES ('bad-ts', 'Bad TS', '[]', 'not-a-timestamp', 'min_area', '')`,
	)
	if err != nil {
		t.Fatalf("direct insert: %v", err)
	}
	_, apiErr := svc.List(context.Background())
	if apiErr == nil {
		t.Fatal("expected error for invalid timestamp in List")
	}
}

func TestGetByID_InvalidTimestamp(t *testing.T) {
	svc := newSessionSvc(t)
	// Insert a session with a non-RFC3339 timestamp directly to trigger parse error in GetByID
	_, err := svc.db.Exec(
		`INSERT INTO sessions (session_id, name, devices, saved_at, optimization_objective, site_plan_json)
		 VALUES ('bad-ts2', 'Bad TS2', '[{"id":4,"quantity":1}]', 'not-a-timestamp', 'min_area', '')`,
	)
	if err != nil {
		t.Fatalf("direct insert: %v", err)
	}
	_, apiErr := svc.GetByID(context.Background(), "bad-ts2")
	if apiErr == nil {
		t.Fatal("expected error for invalid timestamp in GetByID")
	}
}
