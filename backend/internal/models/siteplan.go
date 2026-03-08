package models

type DeviceType string

type LayoutZone string

const (
	ZoneBattery     LayoutZone = "battery"
	ZoneTransformer LayoutZone = "transformer"
)

type OptimizationObjective string

const (
	ObjectiveMinArea OptimizationObjective = "min_area"
	ObjectiveMinCost OptimizationObjective = "min_cost"
)

type ConfiguredDevice struct {
	ID       int64 `json:"id"`
	Quantity int   `json:"quantity"`
}

type GenerateSitePlanRequest struct {
	Devices   []ConfiguredDevice    `json:"devices"`
	Objective OptimizationObjective `json:"objective,omitempty"`
}

type SafetyAssumptions struct {
	PerimeterMarginFt   int    `json:"perimeterMarginFt"`
	SideClearanceFt     int    `json:"sideClearanceFt"`
	RowAisleFt          int    `json:"rowAisleFt"`
	TransformerBufferFt int    `json:"transformerBufferFt"`
	MaxUsableWidthFt    int    `json:"maxUsableWidthFt"`
	Version             string `json:"version,omitempty"`
}

type SiteMetrics struct {
	TotalBatteryCount      int     `json:"totalBatteryCount"`
	RequiredTransformers   int     `json:"requiredTransformers"`
	TotalCost              int     `json:"totalCost"`
	TransformerCostEach    int     `json:"transformerCostEach"`
	TotalEnergyMWh         float64 `json:"totalEnergyMWh"`
	EquipmentFootprintSqFt int     `json:"equipmentFootprintSqFt"`
	SiteWidthFt            int     `json:"siteWidthFt"`
	SiteHeightFt           int     `json:"siteHeightFt"`
	BoundingAreaSqFt       int     `json:"boundingAreaSqFt"`
}

type LayoutItem struct {
	ID        string     `json:"id"`
	DeviceID  int64      `json:"deviceId"`
	Type      DeviceType `json:"type"`
	Label     string     `json:"label"`
	Zone      LayoutZone `json:"zone"`
	XFt       int        `json:"xFt"`
	YFt       int        `json:"yFt"`
	WidthFt   int        `json:"widthFt"`
	HeightFt  int        `json:"heightFt"`
	EnergyMWh float64    `json:"energyMWh"`
	Cost      int        `json:"cost"`
}

type SitePlanData struct {
	RequestedDevices  []ConfiguredDevice    `json:"requestedDevices"`
	Metrics           SiteMetrics          `json:"metrics"`
	Layout            []LayoutItem         `json:"layout"`
	SafetyAssumptions SafetyAssumptions    `json:"safetyAssumptions"`
	Warnings          []string             `json:"warnings,omitempty"`
	Objective         OptimizationObjective `json:"objective"`
}

type SitePlanResponse struct {
	Success bool          `json:"success"`
	Data    *SitePlanData `json:"data,omitempty"`
	Error   *APIError     `json:"error,omitempty"`
}
