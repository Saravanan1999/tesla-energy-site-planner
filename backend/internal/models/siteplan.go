package models

type DeviceType string

type LayoutZone string

const (
	ZoneBattery     LayoutZone = "battery"
	ZoneTransformer LayoutZone = "transformer"
)

type OptimizationObjective string

const (
	ObjectiveMinArea    OptimizationObjective = "min_area"
	ObjectiveMinCost    OptimizationObjective = "min_cost"
	ObjectiveMaxDensity OptimizationObjective = "max_density"
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

// OptimizationSuggestion is a single heuristic swap suggestion for the chosen objective.
type OptimizationSuggestion struct {
	FromDeviceID   int64   `json:"fromDeviceId"`
	FromLabel      string  `json:"fromLabel"`
	FromQty        int     `json:"fromQty"`
	ToDeviceID     int64   `json:"toDeviceId"`
	ToLabel        string  `json:"toLabel"`
	ToQty          int     `json:"toQty"`
	DeltaAreaSqFt  int     `json:"deltaAreaSqFt"` // negative = saves area
	DeltaCost      int     `json:"deltaCost"`     // negative = saves cost
	DeltaEnergyMWh float64 `json:"deltaEnergyMWh"`
	Reason         string  `json:"reason"`
}

type SitePlanData struct {
	RequestedDevices  []ConfiguredDevice      `json:"requestedDevices"`
	Metrics           SiteMetrics             `json:"metrics"`
	Layout            []LayoutItem            `json:"layout"`
	SafetyAssumptions SafetyAssumptions       `json:"safetyAssumptions"`
	Warnings          []string                `json:"warnings,omitempty"`
	Objective         OptimizationObjective   `json:"objective"`
	Suggestion        *OptimizationSuggestion `json:"suggestion,omitempty"`
}

type SitePlanResponse struct {
	Success bool          `json:"success"`
	Data    *SitePlanData `json:"data,omitempty"`
	Error   *APIError     `json:"error,omitempty"`
}
