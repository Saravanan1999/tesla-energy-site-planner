package services

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"math"
	"sort"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

const (
	perimeterMarginFt       = 10
	sideClearanceFt         = 2
	rowAisleFt              = 5
	transformerBufferFt     = 10
	maxUsableWidthFt        = 80 // total site width cap is 100 ft; 80 ft usable = 100 − 2×10 ft perimeter
	safetyVersion           = "1.0"
	batteriesPerTransformer = 2

	// Default transformer physical specs (derived, not user-configured)
	transformerWidthFt  = 10
	transformerHeightFt = 10
	transformerCost     = 50000

	// Input caps — prevent runaway DP table sizes and binary search ranges.
	maxPlanMWh      = 500.0    // max energy target accepted by plan-for-energy and optimize
	maxPlanAreaSqFt = 100000   // max area target accepted by optimize-power (≈ 2.3 acres)
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
	db  *sql.DB
	log *slog.Logger
}

func NewSitePlanService(db *sql.DB) *SitePlanService {
	return &SitePlanService{db: db, log: slog.Default()}
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
			s.log.Error("failed to look up device", "device_id", cd.ID, "err", err)
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
		s.log.Error("failed to fetch device catalog", "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to fetch devices"}
	}
	defer dbRows.Close()

	var catalog []deviceSpec
	for dbRows.Next() {
		var d deviceSpec
		if err := dbRows.Scan(&d.id, &d.name, &d.widthFt, &d.heightFt, &d.energyMWh, &d.cost); err != nil {
			s.log.Error("failed to scan device row", "err", err)
			return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to read devices"}
		}
		catalog = append(catalog, d)
	}
	if err := dbRows.Err(); err != nil {
		s.log.Error("failed to iterate device catalog", "err", err)
		return nil, &models.APIError{Code: models.ErrorInternal, Message: "failed to iterate devices"}
	}
	return catalog, nil
}

// dpEnergyStep is the MWh resolution used for DP bucket indexing.
// All current catalog devices have integer MWh values, so 1 MWh steps are exact.
const dpEnergyStep = 1.0

// dpK is the maximum number of candidates kept per energy bucket during DP pruning.
const dpK = 20

// dpCandidate tracks one partial battery mix in the DP table.
type dpCandidate struct {
	counts    []int // count of each catalog battery type (indexed by catalog position)
	cost      int
	footprint int // sum of widthFt × heightFt over all batteries (layout-agnostic proxy)
}

func cloneDPCandidate(c dpCandidate) dpCandidate {
	nc := dpCandidate{counts: make([]int, len(c.counts)), cost: c.cost, footprint: c.footprint}
	copy(nc.counts, c.counts)
	return nc
}

func dpCountsEqual(a, b []int) bool {
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func dpTotalDevices(counts []int) int {
	n := 0
	for _, c := range counts {
		n += c
	}
	return n
}

// dpCandidateWorse returns true if a is a worse partial candidate than b for the given objective.
func dpCandidateWorse(a, b dpCandidate, obj models.OptimizationObjective) bool {
	switch obj {
	case models.ObjectiveMinCost:
		if a.cost != b.cost {
			return a.cost > b.cost
		}
		if a.footprint != b.footprint {
			return a.footprint > b.footprint
		}
	default: // min_area: footprint is the primary proxy
		if a.footprint != b.footprint {
			return a.footprint > b.footprint
		}
		if a.cost != b.cost {
			return a.cost > b.cost
		}
	}
	return dpTotalDevices(a.counts) > dpTotalDevices(b.counts)
}

// dpInsert adds nc to bucket, deduplicating by counts and evicting the worst when over K.
func dpInsert(bucket *[]dpCandidate, nc dpCandidate, K int, obj models.OptimizationObjective) {
	for _, c := range *bucket {
		if dpCountsEqual(c.counts, nc.counts) {
			return
		}
	}
	*bucket = append(*bucket, nc)
	if len(*bucket) <= K {
		return
	}
	worstIdx := 0
	for i := 1; i < len(*bucket); i++ {
		if dpCandidateWorse((*bucket)[i], (*bucket)[worstIdx], obj) {
			worstIdx = i
		}
	}
	(*bucket)[worstIdx] = (*bucket)[len(*bucket)-1]
	*bucket = (*bucket)[:len(*bucket)-1]
}

// bestPlanForEnergy uses an unbounded-knapsack DP over energy levels to generate all
// feasible battery mixes within the tolerance window, then evaluates each with the layout
// engine and returns the best result for the given objective.
// Returns nil if no candidate fits within the energy tolerance window.
func (s *SitePlanService) bestPlanForEnergy(ctx context.Context, targetEnergy float64, objective models.OptimizationObjective, catalog []deviceSpec) *models.SitePlanData {
	// Build the DP table. Each bucket e holds the top-K candidate mixes whose total
	// energy equals e × dpEnergyStep MWh.
	upperBound := targetEnergy + 0.05 + dpEnergyStep
	nBuckets := int(math.Ceil(upperBound/dpEnergyStep)) + 1

	dp := make([][]dpCandidate, nBuckets)
	dp[0] = []dpCandidate{{counts: make([]int, len(catalog))}}

	for e := 0; e < nBuckets; e++ {
		if len(dp[e]) == 0 {
			continue
		}
		for ti, t := range catalog {
			if t.energyMWh <= 0 {
				continue
			}
			tBuckets := int(math.Round(t.energyMWh / dpEnergyStep))
			nextE := e + tBuckets
			if nextE >= nBuckets {
				continue
			}
			for _, c := range dp[e] {
				nc := cloneDPCandidate(c)
				nc.counts[ti]++
				nc.cost += t.cost
				nc.footprint += t.widthFt * t.heightFt
				dpInsert(&dp[nextE], nc, dpK, objective)
			}
		}
	}

	// Collect all candidates whose energy lands in the tolerance window [target-0.05, target+0.05].
	// A symmetric ±0.05 MWh window covers only floating-point rounding; it intentionally does NOT
	// allow under-delivery of whole battery units. The previous 1% lower bound was too wide —
	// for a 483 MWh target it allowed 478 MWh candidates, causing min_cost to repeatedly suggest
	// plans with less energy at lower cost, creating an infinite improvement loop.
	loBucket := int(math.Floor((targetEnergy - 0.05) / dpEnergyStep))
	hiBucket := int(math.Ceil((targetEnergy + 0.05) / dpEnergyStep))
	if loBucket < 0 {
		loBucket = 0
	}
	if hiBucket >= nBuckets {
		hiBucket = nBuckets - 1
	}

	var bestPlan *models.SitePlanData
	bestMetric := math.MaxFloat64

	for ei := loBucket; ei <= hiBucket; ei++ {
		for _, c := range dp[ei] {
			var devs []models.ConfiguredDevice
			totalE := 0.0
			for ti, cnt := range c.counts {
				if cnt > 0 {
					devs = append(devs, models.ConfiguredDevice{ID: catalog[ti].id, Quantity: cnt})
					totalE += float64(cnt) * catalog[ti].energyMWh
				}
			}
			if len(devs) == 0 {
				continue
			}
			// Guard: recheck exact energy (floating-point accumulation may drift slightly).
			if totalE > targetEnergy+0.05 || totalE < targetEnergy-0.05 {
				continue
			}
			plan, err := s.Generate(ctx, models.GenerateSitePlanRequest{Devices: devs, Objective: objective})
			if err != nil {
				continue
			}
			var metric float64
			switch objective {
			case models.ObjectiveMinArea:
				metric = float64(plan.Metrics.BoundingAreaSqFt)
			case models.ObjectiveMinCost:
				metric = float64(plan.Metrics.TotalCost)
			default:
				continue
			}
			if bestPlan == nil || metric < bestMetric {
				bestPlan = plan
				bestMetric = metric
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

	s.log.Info("optimize", "objective", objective, "target_energy_mwh", targetEnergy)

	catalog, apiErr := s.fetchBatteryCatalog(ctx)
	if apiErr != nil {
		return nil, apiErr
	}

	bestPlan := s.bestPlanForEnergy(ctx, targetEnergy, objective, catalog)
	if bestPlan == nil {
		s.log.Info("optimize result: no improvement found", "objective", objective)
		return nil, nil
	}
	// Return nil when the current plan is already at or better than the global optimum.
	if objectiveImprovement(objective, bestPlan.Metrics, currentPlan.Metrics) <= 0 {
		s.log.Info("optimize result: already optimal", "objective", objective)
		return nil, nil
	}
	s.log.Info("optimize result: improved",
		"objective", objective,
		"area_sqft", bestPlan.Metrics.BoundingAreaSqFt,
		"cost", bestPlan.Metrics.TotalCost,
		"energy_mwh", bestPlan.Metrics.TotalEnergyMWh,
	)
	return bestPlan, nil
}

// PlanForEnergy finds the best plan that achieves targetMWh for the given objective
// by searching single-type and two-type combinations across the full device catalog.
// Returns nil (no error) when no combination can reach the target within tolerance.
func (s *SitePlanService) PlanForEnergy(ctx context.Context, targetMWh float64, objective models.OptimizationObjective) (*models.SitePlanData, *models.APIError) {
	if targetMWh <= 0 {
		return nil, &models.APIError{Code: models.ErrorInvalidConfig, Message: "targetMWh must be positive"}
	}
	if targetMWh > maxPlanMWh {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: fmt.Sprintf("targetMWh %.0f exceeds the maximum supported value of %.0f MWh", targetMWh, maxPlanMWh),
		}
	}
	if objective == "" {
		objective = models.ObjectiveMinArea
	}

	s.log.Info("plan-for-energy", "target_mwh", targetMWh, "objective", objective)

	catalog, apiErr := s.fetchBatteryCatalog(ctx)
	if apiErr != nil {
		return nil, apiErr
	}

	plan := s.bestPlanForEnergy(ctx, targetMWh, objective, catalog)
	if plan != nil {
		s.log.Info("plan-for-energy result", "energy_mwh", plan.Metrics.TotalEnergyMWh, "area_sqft", plan.Metrics.BoundingAreaSqFt)
	} else {
		s.log.Info("plan-for-energy result: no plan found", "target_mwh", targetMWh)
	}
	return plan, nil
}

// isBetterMaxPowerPlan returns true if candidate beats current best (more energy, or same energy at lower cost).
func isBetterMaxPowerPlan(candidate, best *models.SitePlanData) bool {
	if best == nil {
		return true
	}
	if candidate.Metrics.TotalEnergyMWh > best.Metrics.TotalEnergyMWh {
		return true
	}
	return math.Abs(candidate.Metrics.TotalEnergyMWh-best.Metrics.TotalEnergyMWh) < 0.01 &&
		candidate.Metrics.TotalCost < best.Metrics.TotalCost
}

// OptimizeMaxPower finds the battery mix that maximises total energy within the given site area.
//
// Phase 1 — single-type binary search: for each device type, find the maximum quantity
// that fits within targetAreaSqFt. This establishes the initial best plan and a tight
// energy ceiling for the DP.
//
// Phase 2 — DP-based mixed-type search: an unbounded-knapsack DP is built up to
// maxSingleTypeEnergy × 1.2 (mixed types can fill row-end gaps but cannot significantly
// exceed single-type packing density). The DP table is then scanned from highest energy
// downward; only multi-type candidates with footprint ≤ targetAreaSqFt are evaluated.
// The scan stops as soon as no higher-energy plan is possible.
//
// Among plans with equal (within 0.01 MWh) energy, the cheapest is preferred.
func (s *SitePlanService) OptimizeMaxPower(ctx context.Context, targetAreaSqFt int) (*models.SitePlanData, *models.APIError) {
	if targetAreaSqFt > maxPlanAreaSqFt {
		return nil, &models.APIError{
			Code:    models.ErrorInvalidConfig,
			Message: fmt.Sprintf("targetAreaSqFt %d exceeds the maximum supported value of %d sq ft", targetAreaSqFt, maxPlanAreaSqFt),
		}
	}

	s.log.Info("optimize-max-power", "target_area_sqft", targetAreaSqFt)

	catalog, apiErr := s.fetchBatteryCatalog(ctx)
	if apiErr != nil {
		return nil, apiErr
	}

	var bestPlan *models.SitePlanData
	maxSingleEnergy := 0.0

	// Phase 1: single-type binary search.
	for _, d := range catalog {
		if d.widthFt <= 0 || d.heightFt <= 0 || d.energyMWh <= 0 {
			continue
		}
		hiQty := targetAreaSqFt/(d.widthFt*d.heightFt)*2 + 10
		lo, hi, maxFit := 1, hiQty, 0
		for lo <= hi {
			mid := (lo + hi) / 2
			plan, err := s.Generate(ctx, models.GenerateSitePlanRequest{
				Devices:   []models.ConfiguredDevice{{ID: d.id, Quantity: mid}},
				Objective: models.ObjectiveMinArea,
			})
			if err != nil || plan.Metrics.BoundingAreaSqFt > targetAreaSqFt {
				hi = mid - 1
			} else {
				maxFit = mid
				lo = mid + 1
			}
		}
		if maxFit <= 0 {
			continue
		}
		plan, err := s.Generate(ctx, models.GenerateSitePlanRequest{
			Devices:   []models.ConfiguredDevice{{ID: d.id, Quantity: maxFit}},
			Objective: models.ObjectiveMinArea,
		})
		if err != nil {
			continue
		}
		if plan.Metrics.TotalEnergyMWh > maxSingleEnergy {
			maxSingleEnergy = plan.Metrics.TotalEnergyMWh
		}
		if isBetterMaxPowerPlan(plan, bestPlan) {
			bestPlan = plan
		}
	}

	// Phase 2: DP-based mixed-type search.
	// Mixed types cannot pack significantly more energy than single-type; the 1.2× buffer
	// covers the case where filling row-end gaps with smaller devices gains a few extra units.
	maxE := int(math.Ceil(maxSingleEnergy*1.2)) + 5
	if maxE <= 0 {
		return bestPlan, nil
	}
	nBuckets := int(math.Ceil(float64(maxE)/dpEnergyStep)) + 2

	dp := make([][]dpCandidate, nBuckets)
	dp[0] = []dpCandidate{{counts: make([]int, len(catalog))}}
	for e := 0; e < nBuckets; e++ {
		if len(dp[e]) == 0 {
			continue
		}
		for ti, t := range catalog {
			if t.energyMWh <= 0 {
				continue
			}
			tBuckets := int(math.Round(t.energyMWh / dpEnergyStep))
			nextE := e + tBuckets
			if nextE >= nBuckets {
				continue
			}
			for _, c := range dp[e] {
				nc := cloneDPCandidate(c)
				nc.counts[ti]++
				nc.cost += t.cost
				nc.footprint += t.widthFt * t.heightFt
				dpInsert(&dp[nextE], nc, dpK, models.ObjectiveMinArea)
			}
		}
	}

	// Scan from highest energy downward. Skip:
	//  - single-type candidates (Phase 1 already found their optimal quantities)
	//  - candidates with footprint > targetAreaSqFt (definitely won't fit)
	// Stop once the current energy bucket can't beat the best plan.
	minEBucket := 0
	if bestPlan != nil {
		minEBucket = int(math.Floor(bestPlan.Metrics.TotalEnergyMWh/dpEnergyStep)) + 1
	}
	for e := nBuckets - 1; e >= minEBucket; e-- {
		if len(dp[e]) == 0 {
			continue
		}
		for _, c := range dp[e] {
			if c.footprint > targetAreaSqFt {
				continue
			}
			// Count distinct types; single-type mixes are already covered by Phase 1.
			distinctTypes := 0
			for _, cnt := range c.counts {
				if cnt > 0 {
					distinctTypes++
				}
			}
			if distinctTypes <= 1 {
				continue
			}
			var devs []models.ConfiguredDevice
			for ti, cnt := range c.counts {
				if cnt > 0 {
					devs = append(devs, models.ConfiguredDevice{ID: catalog[ti].id, Quantity: cnt})
				}
			}
			plan, err := s.Generate(ctx, models.GenerateSitePlanRequest{
				Devices:   devs,
				Objective: models.ObjectiveMinArea,
			})
			if err != nil || plan.Metrics.BoundingAreaSqFt > targetAreaSqFt {
				continue
			}
			if isBetterMaxPowerPlan(plan, bestPlan) {
				bestPlan = plan
			}
		}
		// Update energy floor: once the bucket energy can't beat current best, stop.
		if bestPlan != nil && float64(e)*dpEnergyStep <= bestPlan.Metrics.TotalEnergyMWh {
			break
		}
	}

	if bestPlan != nil {
		s.log.Info("optimize-max-power result",
			"energy_mwh", bestPlan.Metrics.TotalEnergyMWh,
			"area_sqft", bestPlan.Metrics.BoundingAreaSqFt,
			"cost", bestPlan.Metrics.TotalCost,
		)
	} else {
		s.log.Info("optimize-max-power result: no plan found", "target_area_sqft", targetAreaSqFt)
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
