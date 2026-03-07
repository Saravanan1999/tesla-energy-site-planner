package models

import "time"

type SessionDevice struct {
	ID       int `json:"id"`
	Quantity int   `json:"quantity"`
}

type CreateSessionRequest struct {
	Name    string          `json:"name"`
	Devices []SessionDevice `json:"devices"`
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
