package services

import (
	"context"
	"database/sql"
	"fmt"
	"sort"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

const (
	perimeterMarginFt      = 10
	sideClearanceFt        = 2
	rowAisleFt             = 5
	transformerBufferFt    = 10
	maxSiteWidthFt         = 120
	safetyVersion          = "1.0"
	batteriesPerTransformer = 2

	// Default transformer physical specs (derived, not user-configured)
	transformerWidthFt  = 10
	transformerHeightFt = 10
	transformerCost     = 50000
)

type deviceSpec struct {
	id        int64
	name      string
	widthFt   int
	heightFt  int
	energyMWh float64
	cost      int
}

type SitePlanService struct {
	db *sql.DB
}

func NewSitePlanService(db *sql.DB) *SitePlanService {
	return &SitePlanService{db: db}
}

func (s *SitePlanService) Generate(ctx context.Context, req models.GenerateSitePlanRequest) (*models.SitePlanData, *models.APIError) {
	if len(req.Devices) == 0 {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "at least one device must be configured",
		}
	}

	// Step 1: Expand battery instances from DB
	var batteries []deviceSpec
	var totalCost int
	var totalEnergy float64
	var equipmentFootprint int
	var details []string

	for _, cd := range req.Devices {
		if cd.Quantity <= 0 {
			details = append(details, fmt.Sprintf("device id %d has invalid quantity %d", cd.ID, cd.Quantity))
			continue
		}

		spec, err := s.lookupDevice(ctx, cd.ID)
		if err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to look up device"}
		}
		if spec == nil {
			details = append(details, fmt.Sprintf("device id %d not found", cd.ID))
			continue
		}

		spec.id = cd.ID
		for i := 0; i < cd.Quantity; i++ {
			batteries = append(batteries, *spec)
			totalCost += spec.cost
			totalEnergy += spec.energyMWh
			equipmentFootprint += spec.widthFt * spec.heightFt
		}
	}

	if len(details) > 0 {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: "one or more devices could not be resolved",
			Details: details,
		}
	}

	if len(batteries) == 0 {
		return nil, &models.APIError{Code: models.ErrorInvalidConfig, Message: "no valid devices configured"}
	}

	// Step 2: Derive transformer count and build transformer instances
	totalBatteryCount := len(batteries)
	requiredTransformers := (totalBatteryCount + batteriesPerTransformer - 1) / batteriesPerTransformer

	transformers := make([]deviceSpec, requiredTransformers)
	for i := range transformers {
		transformers[i] = deviceSpec{
			name:      "Transformer",
			widthFt:   transformerWidthFt,
			heightFt:  transformerHeightFt,
			cost:      transformerCost,
			energyMWh: 0,
		}
		totalCost += transformerCost
		equipmentFootprint += transformerWidthFt * transformerHeightFt
	}

	usableWidthFt := maxSiteWidthFt - 2*perimeterMarginFt

	// Step 3: Pack battery rows
	batteryLayout, batteryEndY, apiErr := packRows(batteries, models.ZoneBattery, perimeterMarginFt, perimeterMarginFt, usableWidthFt, "battery")
	if apiErr != nil {
		return nil, apiErr
	}

	// Step 4 & 5: Pack transformer rows after buffer
	transformerStartY := batteryEndY + transformerBufferFt
	transformerLayout, transformerEndY, apiErr := packRows(transformers, models.ZoneTransformer, perimeterMarginFt, transformerStartY, usableWidthFt, "transformer")
	if apiErr != nil {
		return nil, apiErr
	}

	layout := append(batteryLayout, transformerLayout...)

	// Step 6: Compute final site dimensions
	maxOccupiedX := 0
	maxOccupiedY := transformerEndY
	for _, item := range layout {
		if right := item.XFt + item.WidthFt; right > maxOccupiedX {
			maxOccupiedX = right
		}
	}

	siteWidthFt := maxOccupiedX + perimeterMarginFt
	siteHeightFt := maxOccupiedY + perimeterMarginFt

	if siteWidthFt > maxSiteWidthFt {
		return nil, &models.APIError{
			Code:    models.ErrorLayoutNotFeasible,
			Message: fmt.Sprintf("configuration cannot be arranged safely within the %d ft width limit", maxSiteWidthFt),
		}
	}

	return &models.SitePlanData{
		RequestedDevices: req.Devices,
		Metrics: models.SiteMetrics{
			TotalBatteryCount:      totalBatteryCount,
			RequiredTransformers:   requiredTransformers,
			TotalCost:              totalCost,
			TotalEnergyMWh:         totalEnergy,
			EquipmentFootprintSqFt: equipmentFootprint,
			SiteWidthFt:            siteWidthFt,
			SiteHeightFt:           siteHeightFt,
			BoundingAreaSqFt:       siteWidthFt * siteHeightFt,
		},
		Layout: layout,
		SafetyAssumptions: models.SafetyAssumptions{
			PerimeterMarginFt:   perimeterMarginFt,
			SideClearanceFt:     sideClearanceFt,
			RowAisleFt:          rowAisleFt,
			TransformerBufferFt: transformerBufferFt,
			MaxSiteWidthFt:      maxSiteWidthFt,
			Version:             safetyVersion,
		},
	}, nil
}

// packRows places devices into rows using First Fit Decreasing (FFD):
// sort by width descending, then place each device into the first row it fits,
// opening a new row only when necessary. This maximises row utilisation.
func packRows(devices []deviceSpec, zone models.LayoutZone, startX, startY, usableWidthFt int, prefix string) ([]models.LayoutItem, int, *models.APIError) {
	// Validate and sort a working copy by width descending
	sorted := make([]deviceSpec, len(devices))
	copy(sorted, devices)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].widthFt > sorted[j].widthFt
	})

	type rowState struct {
		y     int
		maxH  int
		nextX int // next available X position in this row
		items []models.LayoutItem
	}

	var rows []rowState
	limit := startX + usableWidthFt
	// instanceIndex tracks per-device instance count so IDs are stable across layout changes
	instanceIndex := make(map[int64]int)

	for _, d := range sorted {
		if d.widthFt > usableWidthFt {
			return nil, 0, &models.APIError{
				Code:    models.ErrorLayoutNotFeasible,
				Message: fmt.Sprintf("device %q (width %d ft) exceeds usable site width of %d ft", d.name, d.widthFt, usableWidthFt),
			}
		}

		idx := instanceIndex[d.id]
		instanceIndex[d.id]++

		item := models.LayoutItem{
			ID:        fmt.Sprintf("%s-%d-%d", prefix, d.id, idx),
			DeviceID:  d.id,
			Type:      models.DeviceType(d.name),
			Label:     d.name,
			Zone:      zone,
			WidthFt:   d.widthFt,
			HeightFt:  d.heightFt,
			EnergyMWh: d.energyMWh,
			Cost:      d.cost,
		}

		// Try to fit into an existing row (first fit)
		placed := false
		for ri := range rows {
			if rows[ri].nextX+d.widthFt <= limit {
				item.XFt = rows[ri].nextX
				item.YFt = rows[ri].y
				rows[ri].items = append(rows[ri].items, item)
				rows[ri].nextX += d.widthFt + sideClearanceFt
				if d.heightFt > rows[ri].maxH {
					rows[ri].maxH = d.heightFt
				}
				placed = true
				break
			}
		}

		if !placed {
			// Open a new row beneath all existing rows
			newY := startY
			if len(rows) > 0 {
				last := rows[len(rows)-1]
				newY = last.y + last.maxH + rowAisleFt
			}
			item.XFt = startX
			item.YFt = newY
			rows = append(rows, rowState{
				y:     newY,
				maxH:  d.heightFt,
				nextX: startX + d.widthFt + sideClearanceFt,
				items: []models.LayoutItem{item},
			})
		}
	}

	// Flatten items and compute endY
	var allItems []models.LayoutItem
	endY := startY
	for _, r := range rows {
		allItems = append(allItems, r.items...)
		if bottom := r.y + r.maxH; bottom > endY {
			endY = bottom
		}
	}

	return allItems, endY, nil
}

func (s *SitePlanService) lookupDevice(ctx context.Context, id int64) (*deviceSpec, error) {
	var spec deviceSpec
	err := s.db.QueryRowContext(ctx,
		`SELECT name, width_ft, height_ft, energy_mwh, cost FROM devices WHERE id = ?`, id,
	).Scan(&spec.name, &spec.widthFt, &spec.heightFt, &spec.energyMWh, &spec.cost)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &spec, nil
}
