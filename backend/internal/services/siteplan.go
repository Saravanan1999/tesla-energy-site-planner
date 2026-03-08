package services

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

const (
	perimeterMarginFt       = 10
	sideClearanceFt         = 2
	rowAisleFt              = 5
	transformerBufferFt     = 10
	maxUsableWidthFt        = 100
	safetyVersion           = "1.0"
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

	// Normalize objective
	objective := req.Objective
	if objective == "" {
		objective = models.ObjectiveMinArea
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

	// Step 3: Find the usable width that minimises total site area
	usableWidthFt := findOptimalUsableWidth(batteries, transformers)

	// Step 4: Pack battery rows
	batteryLayout, batteryEndY, apiErr := packRows(batteries, models.ZoneBattery, perimeterMarginFt, perimeterMarginFt, usableWidthFt, "battery")
	if apiErr != nil {
		return nil, apiErr
	}

	// Step 5: Pack transformer rows after buffer
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

	return &models.SitePlanData{
		RequestedDevices: req.Devices,
		Metrics: models.SiteMetrics{
			TotalBatteryCount:      totalBatteryCount,
			RequiredTransformers:   requiredTransformers,
			TotalCost:              totalCost,
			TransformerCostEach:    transformerCost,
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
			MaxUsableWidthFt:    maxUsableWidthFt,
			Version:             safetyVersion,
		},
		Objective: objective,
	}, nil
}


// findOptimalUsableWidth searches all integer widths from the minimum that fits
// any single device up to the width that fits all devices in one row, and returns
// the width that minimises total site area = (W + 2×margin) × (H + margin).
func findOptimalUsableWidth(batteries []deviceSpec, transformers []deviceSpec) int {
	// Minimum: must fit the widest single device
	minW := 0
	for _, d := range batteries {
		if d.widthFt > minW {
			minW = d.widthFt
		}
	}
	for _, d := range transformers {
		if d.widthFt > minW {
			minW = d.widthFt
		}
	}
	if minW == 0 {
		return 2 * perimeterMarginFt
	}

	// Maximum: all devices in one row (no benefit going wider)
	maxW := 0
	for _, d := range batteries {
		maxW += d.widthFt + sideClearanceFt
	}
	for _, d := range transformers {
		maxW += d.widthFt + sideClearanceFt
	}
	if maxW < minW {
		maxW = minW
	}

	if maxW > maxUsableWidthFt {
		maxW = maxUsableWidthFt
	}

	bestW := minW
	bestArea := 1 << 62

	for w := minW; w <= maxW; w++ {
		battEndY, ok := packHeightOnly(batteries, perimeterMarginFt, perimeterMarginFt, w)
		if !ok {
			continue
		}
		transEndY, ok := packHeightOnly(transformers, perimeterMarginFt, battEndY+transformerBufferFt, w)
		if !ok {
			continue
		}
		siteW := w + 2*perimeterMarginFt
		siteH := transEndY + perimeterMarginFt
		if area := siteW * siteH; area < bestArea {
			bestArea = area
			bestW = w
		}
	}

	return bestW
}

// packHeightOnly simulates FFD row packing and returns (endY, fits).
// It mirrors packRows exactly but skips building LayoutItem values.
func packHeightOnly(devices []deviceSpec, startX, startY, usableWidthFt int) (int, bool) {
	if len(devices) == 0 {
		return startY, true
	}

	sorted := make([]deviceSpec, len(devices))
	copy(sorted, devices)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].widthFt > sorted[j].widthFt
	})

	if sorted[0].widthFt > usableWidthFt {
		return 0, false
	}

	type row struct{ y, maxH, nextX int }
	var rows []row
	limit := startX + usableWidthFt

	for _, d := range sorted {
		placed := false
		for i := range rows {
			if rows[i].nextX+d.widthFt <= limit {
				rows[i].nextX += d.widthFt + sideClearanceFt
				if d.heightFt > rows[i].maxH {
					rows[i].maxH = d.heightFt
				}
				placed = true
				break
			}
		}
		if !placed {
			y := startY
			if len(rows) > 0 {
				last := rows[len(rows)-1]
				y = last.y + last.maxH + rowAisleFt
			}
			rows = append(rows, row{y: y, maxH: d.heightFt, nextX: startX + d.widthFt + sideClearanceFt})
		}
	}

	endY := startY
	for _, r := range rows {
		if b := r.y + r.maxH; b > endY {
			endY = b
		}
	}
	return endY, true
}

// packRows places devices into rows using First Fit Decreasing (FFD):
// sort by width descending, then place each device into the first row it fits,
// opening a new row only when necessary. This maximises row utilisation.
func packRows(devices []deviceSpec, zone models.LayoutZone, startX, startY, usableWidthFt int, prefix string) ([]models.LayoutItem, int, *models.APIError) {
	// Validate and sort a working copy by width descending
	sorted := make([]deviceSpec, len(devices))
	copy(sorted, devices)
	sort.SliceStable(sorted, func(i, j int) bool {
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

// fetchBatteryCatalog returns all battery device specs from the DB.
func (s *SitePlanService) fetchBatteryCatalog(ctx context.Context) ([]deviceSpec, *models.APIError) {
	dbRows, err := s.db.QueryContext(ctx,
		`SELECT id, name, width_ft, height_ft, energy_mwh, cost FROM devices WHERE category = 'battery'`,
	)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to fetch devices"}
	}
	defer dbRows.Close()

	var catalog []deviceSpec
	for dbRows.Next() {
		var d deviceSpec
		if err := dbRows.Scan(&d.id, &d.name, &d.widthFt, &d.heightFt, &d.energyMWh, &d.cost); err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to read devices"}
		}
		catalog = append(catalog, d)
	}
	if err := dbRows.Err(); err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to iterate devices"}
	}
	return catalog, nil
}

// bestPlanForEnergy searches single-type and two-type combinations to find the plan that
// best achieves targetEnergy for the given objective. Returns nil if no candidate fits
// within the energy tolerance window.
func (s *SitePlanService) bestPlanForEnergy(ctx context.Context, targetEnergy float64, objective models.OptimizationObjective, catalog []deviceSpec) *models.SitePlanData {
	var bestPlan *models.SitePlanData
	bestMetric := math.MaxFloat64

	tryPlan := func(devices []models.ConfiguredDevice, totalEnergy float64) {
		// Energy must not exceed target (0.05 MWh float tolerance) and can drop at most 1%.
		if totalEnergy > targetEnergy+0.05 || totalEnergy < targetEnergy*0.99 {
			return
		}
		plan, err := s.Generate(ctx, models.GenerateSitePlanRequest{Devices: devices, Objective: objective})
		if err != nil {
			return
		}
		var metric float64
		switch objective {
		case models.ObjectiveMinArea:
			metric = float64(plan.Metrics.BoundingAreaSqFt)
		case models.ObjectiveMinCost:
			metric = float64(plan.Metrics.TotalCost)
		default:
			return
		}
		if bestPlan == nil || metric < bestMetric {
			bestPlan = plan
			bestMetric = metric
		}
	}

	// Phase 1: single-type candidates — floor/ceil quantity matching.
	for _, d := range catalog {
		if d.energyMWh <= 0 {
			continue
		}
		qFloor := int(math.Floor(targetEnergy / d.energyMWh))
		qCeil := qFloor + 1
		qty := qFloor
		if qFloor > 0 {
			eFloor := float64(qFloor) * d.energyMWh
			eCeil := float64(qCeil) * d.energyMWh
			if math.Abs(eCeil-targetEnergy) < math.Abs(eFloor-targetEnergy) {
				qty = qCeil
			}
		} else {
			qty = qCeil
		}
		if qty <= 0 {
			continue
		}
		tryPlan(
			[]models.ConfiguredDevice{{ID: d.id, Quantity: qty}},
			float64(qty)*d.energyMWh,
		)
	}

	// Phase 2: two-type mixed candidates — sweep 9 energy splits (10%…90%) for
	// every pair of distinct battery types.
	for i := 0; i < len(catalog); i++ {
		for j := i + 1; j < len(catalog); j++ {
			a, b := catalog[i], catalog[j]
			if a.energyMWh <= 0 || b.energyMWh <= 0 {
				continue
			}
			for split := 1; split <= 9; split++ {
				fracA := float64(split) / 10.0
				qA := int(math.Round(fracA * targetEnergy / a.energyMWh))
				qB := int(math.Round((1-fracA) * targetEnergy / b.energyMWh))
				if qA <= 0 {
					qA = 1
				}
				if qB <= 0 {
					qB = 1
				}
				tryPlan(
					[]models.ConfiguredDevice{{ID: a.id, Quantity: qA}, {ID: b.id, Quantity: qB}},
					float64(qA)*a.energyMWh+float64(qB)*b.energyMWh,
				)
			}
		}
	}

	return bestPlan
}

// Optimize finds the best replacement plan for the given objective by searching both
// single-type homogeneous configurations and two-type mixed configurations.
// Returns nil if the current plan is already optimal.
func (s *SitePlanService) Optimize(ctx context.Context, req models.GenerateSitePlanRequest) (*models.SitePlanData, *models.APIError) {
	objective := req.Objective
	if objective == "" {
		objective = models.ObjectiveMinArea
	}

	currentPlan, apiErr := s.Generate(ctx, req)
	if apiErr != nil {
		return nil, apiErr
	}

	targetEnergy := currentPlan.Metrics.TotalEnergyMWh
	if targetEnergy <= 0 {
		return nil, nil
	}

	catalog, apiErr := s.fetchBatteryCatalog(ctx)
	if apiErr != nil {
		return nil, apiErr
	}

	bestPlan := s.bestPlanForEnergy(ctx, targetEnergy, objective, catalog)
	if bestPlan == nil {
		return nil, nil
	}
	// Return nil when the current plan is already at or better than the global optimum.
	if objectiveImprovement(objective, bestPlan.Metrics, currentPlan.Metrics) <= 0 {
		return nil, nil
	}
	return bestPlan, nil
}

// PlanForEnergy finds the best plan that achieves targetMWh for the given objective
// by searching single-type and two-type combinations across the full device catalog.
// Returns nil (no error) when no combination can reach the target within tolerance.
func (s *SitePlanService) PlanForEnergy(ctx context.Context, targetMWh float64, objective models.OptimizationObjective) (*models.SitePlanData, *models.APIError) {
	if targetMWh <= 0 {
		return nil, &models.APIError{Code: models.ErrorInvalidConfig, Message: "targetMWh must be positive"}
	}
	if objective == "" {
		objective = models.ObjectiveMinArea
	}

	catalog, apiErr := s.fetchBatteryCatalog(ctx)
	if apiErr != nil {
		return nil, apiErr
	}

	return s.bestPlanForEnergy(ctx, targetMWh, objective, catalog), nil
}

// OptimizeMaxPower finds the device type and quantity that maximises total energy within
// the given site area. Among plans with equal (or near-equal) energy, the cheapest is preferred.
func (s *SitePlanService) OptimizeMaxPower(ctx context.Context, targetAreaSqFt int) (*models.SitePlanData, *models.APIError) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, width_ft, height_ft, energy_mwh, cost FROM devices WHERE category = 'battery'`,
	)
	if err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to fetch devices"}
	}
	defer rows.Close()

	var catalog []deviceSpec
	for rows.Next() {
		var d deviceSpec
		if err := rows.Scan(&d.id, &d.name, &d.widthFt, &d.heightFt, &d.energyMWh, &d.cost); err != nil {
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to read devices"}
		}
		catalog = append(catalog, d)
	}
	if err := rows.Err(); err != nil {
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to iterate devices"}
	}

	var bestPlan *models.SitePlanData

	for _, d := range catalog {
		if d.widthFt <= 0 || d.heightFt <= 0 || d.energyMWh <= 0 {
			continue
		}
		// Upper bound: fill target area twice over (ignoring margins) — gives a safe binary-search ceiling.
		hiQty := targetAreaSqFt/(d.widthFt*d.heightFt)*2 + 10
		if hiQty <= 0 {
			continue
		}

		// Binary search: find the maximum quantity of this device type that still fits.
		lo, hi, maxFitting := 1, hiQty, 0
		for lo <= hi {
			mid := (lo + hi) / 2
			plan, apiErr := s.Generate(ctx, models.GenerateSitePlanRequest{
				Devices:   []models.ConfiguredDevice{{ID: d.id, Quantity: mid}},
				Objective: models.ObjectiveMinArea, // pack as tight as possible
			})
			if apiErr != nil || plan.Metrics.BoundingAreaSqFt > targetAreaSqFt {
				hi = mid - 1
			} else {
				maxFitting = mid
				lo = mid + 1
			}
		}
		if maxFitting <= 0 {
			continue
		}

		plan, apiErr := s.Generate(ctx, models.GenerateSitePlanRequest{
			Devices:   []models.ConfiguredDevice{{ID: d.id, Quantity: maxFitting}},
			Objective: models.ObjectiveMinArea,
		})
		if apiErr != nil {
			continue
		}

		// Primary: maximise energy. Tiebreaker: minimise cost.
		if bestPlan == nil ||
			plan.Metrics.TotalEnergyMWh > bestPlan.Metrics.TotalEnergyMWh ||
			(math.Abs(plan.Metrics.TotalEnergyMWh-bestPlan.Metrics.TotalEnergyMWh) < 0.01 &&
				plan.Metrics.TotalCost < bestPlan.Metrics.TotalCost) {
			bestPlan = plan
		}
	}

	return bestPlan, nil
}

func objectiveImprovement(obj models.OptimizationObjective, candidate, baseline models.SiteMetrics) float64 {
	switch obj {
	case models.ObjectiveMinArea:
		return float64(baseline.BoundingAreaSqFt - candidate.BoundingAreaSqFt)
	case models.ObjectiveMinCost:
		return float64(baseline.TotalCost - candidate.TotalCost)
	default:
		return 0
	}
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
