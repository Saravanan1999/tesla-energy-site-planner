package models

import "time"

type SessionDevice struct {
	ID       int `json:"id"`
	Quantity int `json:"quantity"`
}

type CreateSessionRequest struct {
	Name      string                `json:"name"`
	Devices   []SessionDevice       `json:"devices"`
	Objective OptimizationObjective `json:"objective,omitempty"`
}

type SessionData struct {
	SessionID string    `json:"sessionId"`
	Name      string    `json:"name"`
	SavedAt   time.Time `json:"savedAt"`
}

type SessionResponse struct {
	Success bool         `json:"success"`
	Data    *SessionData `json:"data,omitempty"`
	Error   *APIError    `json:"error,omitempty"`
}

// SessionSitePlanData is the response for GET /api/sessions/:sessionId —
// session metadata inlined with the full site plan.
type SessionSitePlanData struct {
	SessionID string    `json:"sessionId"`
	Name      string    `json:"name"`
	SavedAt   time.Time `json:"savedAt"`
	*SitePlanData
}

type SessionSitePlanResponse struct {
	Success bool                 `json:"success"`
	Data    *SessionSitePlanData `json:"data,omitempty"`
	Error   *APIError            `json:"error,omitempty"`
}

type SessionListData struct {
	Sessions []SessionData `json:"sessions"`
}

type SessionListResponse struct {
	Success bool             `json:"success"`
	Data    *SessionListData `json:"data,omitempty"`
	Error   *APIError        `json:"error,omitempty"`
}
