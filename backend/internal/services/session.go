package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

type SessionService struct {
	db  *sql.DB
	log *slog.Logger
}

func NewSessionService(db *sql.DB) *SessionService {
	return &SessionService{db: db, log: slog.Default()}
}

// SessionRecord is the raw session as loaded from the DB, with devices
// deserialized into ConfiguredDevice so they can be passed to SitePlanService.
type SessionRecord struct {
	Meta      models.SessionData
	Devices   []models.ConfiguredDevice
	Objective models.OptimizationObjective
	SitePlan  *models.SitePlanData // nil if no layout was stored (fall back to regeneration)
}

func (s *SessionService) Create(ctx context.Context, req models.CreateSessionRequest) (*models.SessionData, *models.APIError) {
	// Normalize name
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "Session config is invalid.",
			Details: []string{"Name is required."},
		}
	}

	// Normalize objective
	objective := string(req.Objective)
	if objective == "" {
		objective = string(models.ObjectiveMinArea)
	}

	// Validate device quantities
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

	// Validate each device exists and is a battery
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

	// Serialize config
	devicesJSON, err := json.Marshal(req.Devices)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to serialize devices."}
	}

	var sitePlanJSON string
	if req.SitePlan != nil {
		b, err := json.Marshal(req.SitePlan)
		if err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to serialize site plan."}
		}
		sitePlanJSON = string(b)
	}

	// Check if a session with this name already exists
	var existingSessionID string
	err = s.db.QueryRowContext(ctx,
		`SELECT session_id FROM sessions WHERE name = ?`, name,
	).Scan(&existingSessionID)

	if err == sql.ErrNoRows {
		return s.insert(ctx, name, string(devicesJSON), objective, sitePlanJSON)
	}
	if err != nil {
		s.log.Error("failed to check existing session", "name", name, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to check existing session."}
	}
	return s.update(ctx, existingSessionID, name, string(devicesJSON), objective, sitePlanJSON)
}

func (s *SessionService) insert(ctx context.Context, name, devicesJSON, objective, sitePlanJSON string) (*models.SessionData, *models.APIError) {
	sessionID := uuid.New().String()
	savedAt := time.Now().UTC()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (session_id, name, devices, saved_at, optimization_objective, site_plan_json) VALUES (?, ?, ?, ?, ?, ?)`,
		sessionID, name, devicesJSON, savedAt.Format(time.RFC3339), objective, sitePlanJSON,
	)
	if err != nil {
		s.log.Error("failed to insert session", "name", name, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to save session."}
	}

	s.log.Info("session created", "session_id", sessionID, "name", name)
	return &models.SessionData{SessionID: sessionID, Name: name, SavedAt: savedAt}, nil
}

// UpdateByID updates an existing session's name, devices, and objective by its ID.
func (s *SessionService) UpdateByID(ctx context.Context, sessionID string, req models.CreateSessionRequest) (*models.SessionData, *models.APIError) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "Session config is invalid.",
			Details: []string{"Name is required."},
		}
	}

	objective := string(req.Objective)
	if objective == "" {
		objective = string(models.ObjectiveMinArea)
	}

	// Verify session exists
	var existing string
	err := s.db.QueryRowContext(ctx, `SELECT session_id FROM sessions WHERE session_id = ?`, sessionID).Scan(&existing)
	if err == sql.ErrNoRows {
		return nil, &models.APIError{Code: models.ErrorInvalidConfig, Message: "Session not found."}
	}
	if err != nil {
		s.log.Error("failed to verify session", "session_id", sessionID, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to verify session."}
	}

	devicesJSON, err := json.Marshal(req.Devices)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to serialize devices."}
	}

	var sitePlanJSON string
	if req.SitePlan != nil {
		b, err := json.Marshal(req.SitePlan)
		if err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to serialize site plan."}
		}
		sitePlanJSON = string(b)
	}

	return s.update(ctx, sessionID, name, string(devicesJSON), objective, sitePlanJSON)
}

func (s *SessionService) update(ctx context.Context, sessionID, name, devicesJSON, objective, sitePlanJSON string) (*models.SessionData, *models.APIError) {
	savedAt := time.Now().UTC()

	_, err := s.db.ExecContext(ctx,
		`UPDATE sessions SET name = ?, devices = ?, saved_at = ?, optimization_objective = ?, site_plan_json = ? WHERE session_id = ?`,
		name, devicesJSON, savedAt.Format(time.RFC3339), objective, sitePlanJSON, sessionID,
	)
	if err != nil {
		s.log.Error("failed to update session", "session_id", sessionID, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to update session."}
	}

	s.log.Info("session updated", "session_id", sessionID, "name", name)
	return &models.SessionData{SessionID: sessionID, Name: name, SavedAt: savedAt}, nil
}

func (s *SessionService) List(ctx context.Context) ([]models.SessionData, *models.APIError) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT session_id, name, saved_at FROM sessions ORDER BY saved_at DESC`,
	)
	if err != nil {
		s.log.Error("failed to query sessions", "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to list sessions."}
	}
	defer rows.Close()

	var sessions []models.SessionData
	for rows.Next() {
		var savedAtStr string
		var row models.SessionData
		if err := rows.Scan(&row.SessionID, &row.Name, &savedAtStr); err != nil {
			s.log.Error("failed to scan session row", "err", err)
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to read sessions."}
		}
		row.SavedAt, err = time.Parse(time.RFC3339, savedAtStr)
		if err != nil {
			s.log.Error("failed to parse session timestamp", "saved_at", savedAtStr, "err", err)
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to parse session timestamp."}
		}
		sessions = append(sessions, row)
	}
	if err := rows.Err(); err != nil {
		s.log.Error("failed to iterate sessions", "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to iterate sessions."}
	}

	if sessions == nil {
		sessions = []models.SessionData{}
	}
	return sessions, nil
}

func (s *SessionService) DeleteByID(ctx context.Context, sessionID string) *models.APIError {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE session_id = ?`, sessionID)
	if err != nil {
		s.log.Error("failed to delete session", "session_id", sessionID, "err", err)
		return &models.APIError{Code: models.ErrorInternal, Message: "Failed to delete session."}
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return &models.APIError{Code: models.ErrorInvalidConfig, Message: "Session not found."}
	}
	s.log.Info("session deleted", "session_id", sessionID)
	return nil
}

func (s *SessionService) GetByID(ctx context.Context, sessionID string) (*SessionRecord, *models.APIError) {
	var name, devicesJSON, savedAtStr, objectiveStr string
	var sitePlanJSONPtr *string
	err := s.db.QueryRowContext(ctx,
		`SELECT name, devices, saved_at, optimization_objective, site_plan_json FROM sessions WHERE session_id = ?`, sessionID,
	).Scan(&name, &devicesJSON, &savedAtStr, &objectiveStr, &sitePlanJSONPtr)
	if err == sql.ErrNoRows {
		return nil, &models.APIError{Code: models.ErrorInvalidConfig, Message: "Session not found."}
	}
	if err != nil {
		s.log.Error("failed to load session", "session_id", sessionID, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to load session."}
	}

	savedAt, err := time.Parse(time.RFC3339, savedAtStr)
	if err != nil {
		s.log.Error("failed to parse session timestamp", "session_id", sessionID, "saved_at", savedAtStr, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to parse session timestamp."}
	}

	var devices []models.ConfiguredDevice
	if err := json.Unmarshal([]byte(devicesJSON), &devices); err != nil {
		s.log.Error("failed to deserialize session devices", "session_id", sessionID, "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "Failed to deserialize session devices."}
	}

	objective := models.OptimizationObjective(objectiveStr)
	if objective == "" {
		objective = models.ObjectiveMinArea
	}

	var sitePlan *models.SitePlanData
	if sitePlanJSONPtr != nil && *sitePlanJSONPtr != "" {
		var sp models.SitePlanData
		if err := json.Unmarshal([]byte(*sitePlanJSONPtr), &sp); err == nil {
			sitePlan = &sp
		}
	}

	return &SessionRecord{
		Meta:      models.SessionData{SessionID: sessionID, Name: name, SavedAt: savedAt},
		Devices:   devices,
		Objective: objective,
		SitePlan:  sitePlan,
	}, nil
}
