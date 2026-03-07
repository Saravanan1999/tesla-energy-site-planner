package models

type DeviceCategory string

const (
	DeviceCategoryBattery     DeviceCategory = "battery"
	DeviceCategoryTransformer DeviceCategory = "transformer"
)

type Device struct {
	Type        string         `json:"type"`
	Label       string         `json:"label"`
	Category    DeviceCategory `json:"category"`
	WidthFt     int            `json:"widthFt"`
	HeightFt    int            `json:"heightFt"`
	EnergyMWh   float64        `json:"energyMWh"`
	Cost        int            `json:"cost"`
	ReleaseYear int            `json:"releaseYear"`
}

type DevicesData struct {
	Devices []Device `json:"devices"`
}

type DevicesResponse struct {
	Success bool         `json:"success"`
	Data    *DevicesData `json:"data,omitempty"`
	Error   *APIError    `json:"error,omitempty"`
}
