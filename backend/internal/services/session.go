package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

type SessionService struct {
	db *sql.DB
}

func NewSessionService(db *sql.DB) *SessionService {
	return &SessionService{db: db}
}

func (s *SessionService) Create(ctx context.Context, req models.CreateSessionRequest) (*models.SessionData, *models.APIError) {
	// Validate name
	if req.Name == "" {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "Session config is invalid.",
			Details: []string{"Name is required."},
		}
	}

	// Validate devices
	var details []string
	totalQuantity := 0
	for _, d := range req.Devices {
		if d.Quantity > 0 {
			totalQuantity += d.Quantity
		}
	}
	if len(req.Devices) == 0 || totalQuantity == 0 {
		details = append(details, "At least one battery must be selected.")
	}

	// Validate device IDs exist and are batteries
	for _, d := range req.Devices {
		if d.Quantity <= 0 {
			continue
		}
		var category string
		err := s.db.QueryRowContext(ctx,
			`SELECT category FROM devices WHERE id = ?`, d.ID,
		).Scan(&category)
		if err == sql.ErrNoRows {
			details = append(details, fmt.Sprintf("Device id %d not found.", d.ID))
			continue
		}
		if err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to validate devices."}
		}
		if category != "battery" {
			details = append(details, fmt.Sprintf("Device id %d is not a battery.", d.ID))
		}
	}

	if len(details) > 0 {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "Session config is invalid.",
			Details: details,
		}
	}

	// Serialize devices to JSON for storage
	devicesJSON, err := json.Marshal(req.Devices)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to serialize devices."}
	}

	sessionID := uuid.New().String()
	savedAt := time.Now().UTC()

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO sessions (session_id, name, devices, saved_at) VALUES (?, ?, ?, ?)`,
		sessionID, req.Name, string(devicesJSON), savedAt.Format(time.RFC3339),
	)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to save session."}
	}

	return &models.SessionData{
		SessionID: sessionID,
		Name:      req.Name,
		SavedAt:   savedAt,
	}, nil
}
