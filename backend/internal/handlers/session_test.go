package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/database"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/services"
)

func newSessionHandler(t *testing.T) *SessionHandler {
	t.Helper()
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	sessionSvc := services.NewSessionService(db)
	sitePlanSvc := services.NewSitePlanService(db)
	return NewSessionHandler(sessionSvc, sitePlanSvc)
}

func jsonBody(t *testing.T, v interface{}) *bytes.Reader {
	t.Helper()
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}

func validSessionBody() map[string]interface{} {
	return map[string]interface{}{
		"name":      "My Site",
		"devices":   []map[string]interface{}{{"id": 4, "quantity": 2}},
		"objective": "min_area",
	}
}

// createSession is a helper that POSTs a session and returns the session ID.
func createSessionViaHandler(t *testing.T, h *SessionHandler) string {
	t.Helper()
	r, _ := http.NewRequest(http.MethodPost, "/api/sessions", jsonBody(t, validSessionBody()))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.CreateSession(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("create session failed: %d %s", w.Code, w.Body.String())
	}
	var resp models.SessionResponse
	json.NewDecoder(w.Body).Decode(&resp)
	return resp.Data.SessionID
}

// --------------- ListSessions ---------------

func TestListSessions_Empty(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()
	h.ListSessions(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d", w.Code)
	}
	var resp models.SessionListResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
	if len(resp.Data.Sessions) != 0 {
		t.Errorf("want 0 sessions, got %d", len(resp.Data.Sessions))
	}
}

func TestListSessions_WithData(t *testing.T) {
	h := newSessionHandler(t)
	createSessionViaHandler(t, h)

	r, _ := http.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()
	h.ListSessions(w, r)

	var resp models.SessionListResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp.Data.Sessions) != 1 {
		t.Errorf("want 1 session, got %d", len(resp.Data.Sessions))
	}
}

// --------------- CreateSession ---------------

func TestCreateSession_Success(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodPost, "/api/sessions", jsonBody(t, validSessionBody()))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.CreateSession(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp models.SessionResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
	if resp.Data == nil || resp.Data.SessionID == "" {
		t.Error("expected session ID in response")
	}
}

func TestCreateSession_InvalidBody(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodPost, "/api/sessions", bytes.NewBufferString("bad"))
	w := httptest.NewRecorder()
	h.CreateSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestCreateSession_ValidationError(t *testing.T) {
	h := newSessionHandler(t)
	body := map[string]interface{}{"name": "", "devices": []interface{}{}}
	r, _ := http.NewRequest(http.MethodPost, "/api/sessions", jsonBody(t, body))
	w := httptest.NewRecorder()
	h.CreateSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

// --------------- UpdateSession ---------------

func TestUpdateSession_Success(t *testing.T) {
	h := newSessionHandler(t)
	sessionID := createSessionViaHandler(t, h)

	body := map[string]interface{}{
		"name":      "Updated",
		"devices":   []map[string]interface{}{{"id": 1, "quantity": 1}},
		"objective": "min_cost",
	}
	r, _ := http.NewRequest(http.MethodPut, "/api/sessions/"+sessionID, jsonBody(t, body))
	r.SetPathValue("sessionId", sessionID)
	w := httptest.NewRecorder()
	h.UpdateSession(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp models.SessionResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
}

func TestUpdateSession_MissingSessionID(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodPut, "/api/sessions/", jsonBody(t, validSessionBody()))
	// Do not set path value → sessionId is empty
	w := httptest.NewRecorder()
	h.UpdateSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestUpdateSession_InvalidBody(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodPut, "/", bytes.NewBufferString("bad"))
	r.SetPathValue("sessionId", "some-id")
	w := httptest.NewRecorder()
	h.UpdateSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestUpdateSession_NotFound(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodPut, "/", jsonBody(t, validSessionBody()))
	r.SetPathValue("sessionId", "nonexistent")
	w := httptest.NewRecorder()
	h.UpdateSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

// --------------- DeleteSession ---------------

func TestDeleteSession_Success(t *testing.T) {
	h := newSessionHandler(t)
	sessionID := createSessionViaHandler(t, h)

	r, _ := http.NewRequest(http.MethodDelete, "/api/sessions/"+sessionID, nil)
	r.SetPathValue("sessionId", sessionID)
	w := httptest.NewRecorder()
	h.DeleteSession(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp models.SessionResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
}

func TestDeleteSession_MissingSessionID(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodDelete, "/api/sessions/", nil)
	w := httptest.NewRecorder()
	h.DeleteSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestDeleteSession_NotFound(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodDelete, "/", nil)
	r.SetPathValue("sessionId", "nonexistent")
	w := httptest.NewRecorder()
	h.DeleteSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

// --------------- GetSession ---------------

func TestGetSession_Success_WithStoredPlan(t *testing.T) {
	h := newSessionHandler(t)

	// Create session with a site plan
	body := map[string]interface{}{
		"name":    "Stored Plan Site",
		"devices": []map[string]interface{}{{"id": 4, "quantity": 2}},
		"sitePlan": map[string]interface{}{
			"objective": "min_area",
			"metrics":   map[string]interface{}{},
			"layout":    []interface{}{},
		},
	}
	r, _ := http.NewRequest(http.MethodPost, "/api/sessions", jsonBody(t, body))
	w := httptest.NewRecorder()
	h.CreateSession(w, r)
	var createResp models.SessionResponse
	json.NewDecoder(w.Body).Decode(&createResp)
	sessionID := createResp.Data.SessionID

	r2, _ := http.NewRequest(http.MethodGet, "/api/sessions/"+sessionID, nil)
	r2.SetPathValue("sessionId", sessionID)
	w2 := httptest.NewRecorder()
	h.GetSession(w2, r2)

	if w2.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w2.Code, w2.Body.String())
	}
	var resp models.SessionSitePlanResponse
	json.NewDecoder(w2.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
	if resp.Data == nil {
		t.Fatal("expected data in response")
	}
	if resp.Data.SessionID != sessionID {
		t.Errorf("session ID mismatch")
	}
}

func TestGetSession_Success_Regenerated(t *testing.T) {
	h := newSessionHandler(t)
	// Create without site plan → server will regenerate on GET
	sessionID := createSessionViaHandler(t, h)

	r, _ := http.NewRequest(http.MethodGet, "/api/sessions/"+sessionID, nil)
	r.SetPathValue("sessionId", sessionID)
	w := httptest.NewRecorder()
	h.GetSession(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp models.SessionSitePlanResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Success {
		t.Error("want success=true")
	}
	if resp.Data.SitePlanData == nil {
		t.Error("expected site plan data")
	}
}

func TestGetSession_MissingSessionID(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/sessions/", nil)
	w := httptest.NewRecorder()
	h.GetSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

func TestGetSession_NotFound(t *testing.T) {
	h := newSessionHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/", nil)
	r.SetPathValue("sessionId", "nonexistent")
	w := httptest.NewRecorder()
	h.GetSession(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", w.Code)
	}
}

// --------------- DB-failure error paths ---------------

func newBrokenSessionHandler(t *testing.T) *SessionHandler {
	t.Helper()
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	sessionSvc := services.NewSessionService(db)
	sitePlanSvc := services.NewSitePlanService(db)
	h := NewSessionHandler(sessionSvc, sitePlanSvc)
	db.Close() // close DB so subsequent queries fail
	return h
}

func TestListSessions_DBError(t *testing.T) {
	h := newBrokenSessionHandler(t)
	r, _ := http.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()
	h.ListSessions(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", w.Code)
	}
}
