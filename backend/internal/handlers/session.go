package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/services"
)

type SessionHandler struct {
	sessionSvc  *services.SessionService
	sitePlanSvc *services.SitePlanService
}

func NewSessionHandler(sessionSvc *services.SessionService, sitePlanSvc *services.SitePlanService) *SessionHandler {
	return &SessionHandler{sessionSvc: sessionSvc, sitePlanSvc: sitePlanSvc}
}

func (h *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	sessions, apiErr := h.sessionSvc.List(r.Context())
	if apiErr != nil {
		writeSessionSitePlanError(w, http.StatusInternalServerError, apiErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SessionListResponse{
		Success: true,
		Data:    &models.SessionListData{Sessions: sessions},
	})
}

func (h *SessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeSessionError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "invalid request body",
		})
		return
	}

	data, apiErr := h.sessionSvc.Create(r.Context(), req)
	if apiErr != nil {
		status := http.StatusBadRequest
		if apiErr.Code == models.ErrorInternal {
			status = http.StatusInternalServerError
		}
		writeSessionError(w, status, apiErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SessionResponse{
		Success: true,
		Data:    data,
	})
}

func (h *SessionHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		writeSessionError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "sessionId is required",
		})
		return
	}

	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeSessionError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "invalid request body",
		})
		return
	}

	data, apiErr := h.sessionSvc.UpdateByID(r.Context(), sessionID, req)
	if apiErr != nil {
		status := http.StatusBadRequest
		if apiErr.Code == models.ErrorInternal {
			status = http.StatusInternalServerError
		}
		writeSessionError(w, status, apiErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SessionResponse{
		Success: true,
		Data:    data,
	})
}

func (h *SessionHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		writeSessionError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "sessionId is required",
		})
		return
	}

	if apiErr := h.sessionSvc.DeleteByID(r.Context(), sessionID); apiErr != nil {
		status := http.StatusBadRequest
		if apiErr.Code == models.ErrorInternal {
			status = http.StatusInternalServerError
		}
		writeSessionError(w, status, apiErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SessionResponse{Success: true})
}

func (h *SessionHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		writeSessionSitePlanError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "sessionId is required",
		})
		return
	}

	record, apiErr := h.sessionSvc.GetByID(r.Context(), sessionID)
	if apiErr != nil {
		status := http.StatusBadRequest
		if apiErr.Code == models.ErrorInternal {
			status = http.StatusInternalServerError
		}
		writeSessionSitePlanError(w, status, apiErr)
		return
	}

	// Use the stored layout if available; otherwise regenerate (backwards-compat for old sessions)
	plan := record.SitePlan
	if plan == nil {
		var apiErr *models.APIError
		plan, apiErr = h.sitePlanSvc.Generate(r.Context(), models.GenerateSitePlanRequest{
			Devices:   record.Devices,
			Objective: record.Objective,
		})
		if apiErr != nil {
			writeSessionSitePlanError(w, http.StatusUnprocessableEntity, apiErr)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SessionSitePlanResponse{
		Success: true,
		Data: &models.SessionSitePlanData{
			SessionID:    record.Meta.SessionID,
			Name:         record.Meta.Name,
			SavedAt:      record.Meta.SavedAt,
			SitePlanData: plan,
		},
	})
}

func writeSessionError(w http.ResponseWriter, status int, apiErr *models.APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.SessionResponse{
		Success: false,
		Error:   apiErr,
	})
}

func writeSessionSitePlanError(w http.ResponseWriter, status int, apiErr *models.APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.SessionSitePlanResponse{
		Success: false,
		Error:   apiErr,
	})
}
