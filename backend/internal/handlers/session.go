package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/services"
)

type SessionHandler struct {
	service *services.SessionService
}

func NewSessionHandler(service *services.SessionService) *SessionHandler {
	return &SessionHandler{service: service}
}

func (h *SessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeSessionError(w, http.StatusMethodNotAllowed, &models.APIError{
			Code:    models.ErrorMethodNotAllowed,
			Message: "method not allowed",
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

	data, apiErr := h.service.Create(r.Context(), req)
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

func writeSessionError(w http.ResponseWriter, status int, apiErr *models.APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.SessionResponse{
		Success: false,
		Error:   apiErr,
	})
}
