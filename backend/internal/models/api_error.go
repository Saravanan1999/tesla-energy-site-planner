package models

type ErrorCode string

const (
	ErrorInvalidConfig     ErrorCode = "INVALID_CONFIG"
	ErrorLayoutNotFeasible ErrorCode = "LAYOUT_NOT_FEASIBLE"
	ErrorInternal          ErrorCode = "INTERNAL_ERROR"
	ErrorMethodNotAllowed  ErrorCode = "METHOD_NOT_ALLOWED"
	ErrorDBError           ErrorCode = "DB_ERROR"
	ErrorScanError         ErrorCode = "SCAN_ERROR"
	ErrorRowsError         ErrorCode = "ROWS_ERROR"
)

type APIError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details []string  `json:"details,omitempty"`
}
