package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/services"
)

type SitePlanHandler struct {
	service *services.SitePlanService
}

func NewSitePlanHandler(service *services.SitePlanService) *SitePlanHandler {
	return &SitePlanHandler{service: service}
}

func (h *SitePlanHandler) GenerateSitePlan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeSitePlanError(w, http.StatusMethodNotAllowed, &models.APIError{
			Code:    models.ErrorMethodNotAllowed,
			Message: "method not allowed",
		})
		return
	}

	var req models.GenerateSitePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeSitePlanError(w, http.StatusBadRequest, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "invalid request body",
		})
		return
	}

	data, apiErr := h.service.Generate(r.Context(), req)
	if apiErr != nil {
		status := http.StatusBadRequest
		if apiErr.Code == models.ErrorInternal {
			status = http.StatusInternalServerError
		}
		writeSitePlanError(w, status, apiErr)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.SitePlanResponse{
		Success: true,
		Data:    data,
	})
}

func writeSitePlanError(w http.ResponseWriter, status int, apiErr *models.APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.SitePlanResponse{
		Success: false,
		Error:   apiErr,
	})
}
