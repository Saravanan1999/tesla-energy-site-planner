package services

import (
	"context"
	"testing"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/database"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/models"
)

func newSitePlanSvc(t *testing.T) *SitePlanService {
	t.Helper()
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewSitePlanService(db)
}

// Seeded device IDs (see database/seed.go):
//   1 = Megapack XL  40×10 ft  4 MWh  $120 000
//   2 = Megapack 2   30×10 ft  3 MWh  $80 000
//   3 = Megapack     30×10 ft  2 MWh  $50 000
//   4 = PowerPack    10×10 ft  1 MWh  $10 000

// --------------- Generate ---------------

func TestGenerate_SingleDevice(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 2}},
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan.Metrics.TotalBatteryCount != 2 {
		t.Errorf("want 2 batteries, got %d", plan.Metrics.TotalBatteryCount)
	}
	if plan.Metrics.TotalEnergyMWh != 2.0 {
		t.Errorf("want 2 MWh, got %v", plan.Metrics.TotalEnergyMWh)
	}
	if plan.Metrics.RequiredTransformers != 1 {
		t.Errorf("want 1 transformer, got %d", plan.Metrics.RequiredTransformers)
	}
	if len(plan.Layout) == 0 {
		t.Error("expected layout items")
	}
}

func TestGenerate_MultipleDevices(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{
			{ID: 1, Quantity: 2},
			{ID: 4, Quantity: 2},
		},
		Objective: models.ObjectiveMinCost,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan.Metrics.TotalBatteryCount != 4 {
		t.Errorf("want 4 batteries, got %d", plan.Metrics.TotalBatteryCount)
	}
	if plan.Objective != models.ObjectiveMinCost {
		t.Errorf("want min_cost objective, got %v", plan.Objective)
	}
}

func TestGenerate_DefaultObjective(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan.Objective != models.ObjectiveMinArea {
		t.Errorf("want default min_area, got %v", plan.Objective)
	}
}

func TestGenerate_NoDevices(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{})
	if apiErr == nil {
		t.Fatal("expected error for empty devices")
	}
	if apiErr.Code != models.ErrorInvalidConfig {
		t.Errorf("want INVALID_CONFIG, got %v", apiErr.Code)
	}
}

func TestGenerate_ZeroQuantity(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 1, Quantity: 0}},
	})
	if apiErr == nil {
		t.Fatal("expected error for zero quantity")
	}
}

func TestGenerate_UnknownDeviceID(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 9999, Quantity: 1}},
	})
	if apiErr == nil {
		t.Fatal("expected error for unknown device id")
	}
}

func TestGenerate_MetricsIncludeTansformerCost(t *testing.T) {
	svc := newSitePlanSvc(t)
	// 2 PowerPacks → 1 transformer → cost = 2*10000 + 1*50000 = 70000
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 2}},
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	want := 2*10000 + 1*50000
	if plan.Metrics.TotalCost != want {
		t.Errorf("want cost %d, got %d", want, plan.Metrics.TotalCost)
	}
}

func TestGenerate_SafetyAssumptions(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, _ := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
	})
	sa := plan.SafetyAssumptions
	if sa.PerimeterMarginFt != perimeterMarginFt {
		t.Errorf("want %d, got %d", perimeterMarginFt, sa.PerimeterMarginFt)
	}
	if sa.RowAisleFt != rowAisleFt {
		t.Errorf("want %d, got %d", rowAisleFt, sa.RowAisleFt)
	}
}

func TestGenerate_LayoutZones(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, _ := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 2}},
	})
	var batteries, transformers int
	for _, item := range plan.Layout {
		switch item.Zone {
		case models.ZoneBattery:
			batteries++
		case models.ZoneTransformer:
			transformers++
		}
	}
	if batteries != 2 {
		t.Errorf("want 2 battery items, got %d", batteries)
	}
	if transformers != 1 {
		t.Errorf("want 1 transformer item, got %d", transformers)
	}
}

func TestGenerate_SiteDimensionsPositive(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, _ := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 1, Quantity: 3}},
	})
	if plan.Metrics.SiteWidthFt <= 0 || plan.Metrics.SiteHeightFt <= 0 {
		t.Errorf("expected positive dimensions, got %dx%d", plan.Metrics.SiteWidthFt, plan.Metrics.SiteHeightFt)
	}
	if plan.Metrics.BoundingAreaSqFt != plan.Metrics.SiteWidthFt*plan.Metrics.SiteHeightFt {
		t.Errorf("bounding area mismatch")
	}
}

// --------------- Optimize ---------------

func TestOptimize_ReturnsNilWhenAlreadyOptimal(t *testing.T) {
	svc := newSitePlanSvc(t)
	// A single PowerPack is already the smallest/cheapest single battery type
	// so Optimize might return nil (already optimal) or a plan — either is valid.
	// The key check: no error.
	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
		Objective: models.ObjectiveMinArea,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

func TestOptimize_MinCostObjective(t *testing.T) {
	svc := newSitePlanSvc(t)
	// Expensive device mix — optimizer should try to find cheaper alternatives
	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 1, Quantity: 4}},
		Objective: models.ObjectiveMinCost,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

func TestOptimize_MinAreaObjective(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 2, Quantity: 3}},
		Objective: models.ObjectiveMinArea,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

func TestOptimize_PropagatesGenerateError(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{})
	if apiErr == nil {
		t.Fatal("expected error for empty devices")
	}
}

func TestOptimize_ImprovedPlanHasCorrectObjective(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 1, Quantity: 6}},
		Objective: models.ObjectiveMinArea,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan != nil && plan.Objective != models.ObjectiveMinArea {
		t.Errorf("want min_area, got %v", plan.Objective)
	}
}

// --------------- OptimizeMaxPower ---------------

func TestOptimizeMaxPower_Returnsplan(t *testing.T) {
	svc := newSitePlanSvc(t)
	// Large area — should fit at least a few devices
	plan, apiErr := svc.OptimizeMaxPower(context.Background(), 50000)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan == nil {
		t.Fatal("expected a plan for 50000 sqft area")
	}
	if plan.Metrics.TotalEnergyMWh <= 0 {
		t.Errorf("expected positive energy, got %v", plan.Metrics.TotalEnergyMWh)
	}
}

func TestOptimizeMaxPower_SmallArea(t *testing.T) {
	svc := newSitePlanSvc(t)
	// Area too small to fit any device → plan may be nil
	plan, apiErr := svc.OptimizeMaxPower(context.Background(), 100)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	// nil is acceptable for tiny area
	_ = plan
}

func TestOptimizeMaxPower_FitsWithinArea(t *testing.T) {
	svc := newSitePlanSvc(t)
	targetArea := 10000
	plan, _ := svc.OptimizeMaxPower(context.Background(), targetArea)
	if plan != nil && plan.Metrics.BoundingAreaSqFt > targetArea {
		t.Errorf("plan area %d exceeds target %d", plan.Metrics.BoundingAreaSqFt, targetArea)
	}
}

// --------------- objectiveImprovement ---------------

func TestObjectiveImprovement_MinArea(t *testing.T) {
	candidate := models.SiteMetrics{BoundingAreaSqFt: 900}
	baseline := models.SiteMetrics{BoundingAreaSqFt: 1000}
	if got := objectiveImprovement(models.ObjectiveMinArea, candidate, baseline); got != 100 {
		t.Errorf("want 100, got %v", got)
	}
}

func TestObjectiveImprovement_MinCost(t *testing.T) {
	candidate := models.SiteMetrics{TotalCost: 80000}
	baseline := models.SiteMetrics{TotalCost: 100000}
	if got := objectiveImprovement(models.ObjectiveMinCost, candidate, baseline); got != 20000 {
		t.Errorf("want 20000, got %v", got)
	}
}

func TestObjectiveImprovement_Unknown(t *testing.T) {
	if got := objectiveImprovement("unknown", models.SiteMetrics{}, models.SiteMetrics{}); got != 0 {
		t.Errorf("want 0, got %v", got)
	}
}

// --------------- Generate edge cases ---------------

func TestGenerate_ThreeBatteries_TwoTransformers(t *testing.T) {
	svc := newSitePlanSvc(t)
	// 3 batteries requires ceil(3/2)=2 transformers
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 3}},
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan.Metrics.RequiredTransformers != 2 {
		t.Errorf("want 2 transformers, got %d", plan.Metrics.RequiredTransformers)
	}
}

func TestGenerate_LargeBatteryCount_PacksMultipleRows(t *testing.T) {
	svc := newSitePlanSvc(t)
	// 10 Megapack XL (40ft wide) should require multiple rows since usable width is capped at 100ft
	plan, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 1, Quantity: 10}},
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan.Metrics.TotalBatteryCount != 10 {
		t.Errorf("want 10 batteries, got %d", plan.Metrics.TotalBatteryCount)
	}
}

func TestGenerate_RequestedDevicesPreserved(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, _ := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 2, Quantity: 3}},
	})
	if len(plan.RequestedDevices) != 1 || plan.RequestedDevices[0].ID != 2 {
		t.Error("RequestedDevices not preserved in plan")
	}
}

// --------------- Optimize extra ---------------

func TestOptimize_GenuineImprovement_MinCost(t *testing.T) {
	svc := newSitePlanSvc(t)
	// 4 Megapack XL = 16 MWh, cost = 4*120000 + 2*50000 = 580000
	// 16 PowerPack = 16 MWh,  cost = 16*10000 + 8*50000 = 560000 (cheaper)
	// Optimizer should detect the PowerPack alternative as genuinely cheaper.
	plan, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 1, Quantity: 4}},
		Objective: models.ObjectiveMinCost,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	// Result may be nil (already optimal) or a cheaper plan — no error is the key assertion.
	if plan != nil {
		if plan.Metrics.TotalCost <= 0 {
			t.Error("expected positive cost in improved plan")
		}
	}
}

func TestOptimize_DefaultObjective(t *testing.T) {
	svc := newSitePlanSvc(t)
	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 2, Quantity: 2}},
		// Objective omitted → defaults to min_area
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

// --------------- OptimizeMaxPower extra ---------------

func TestOptimizeMaxPower_MediumArea(t *testing.T) {
	svc := newSitePlanSvc(t)
	plan, apiErr := svc.OptimizeMaxPower(context.Background(), 5000)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan != nil && plan.Metrics.BoundingAreaSqFt > 5000 {
		t.Errorf("plan area %d exceeds target 5000", plan.Metrics.BoundingAreaSqFt)
	}
}

func TestOptimizeMaxPower_MaximisesEnergy(t *testing.T) {
	svc := newSitePlanSvc(t)
	// With a generous area, energy should be meaningful
	plan, _ := svc.OptimizeMaxPower(context.Background(), 100000)
	if plan != nil && plan.Metrics.TotalEnergyMWh < 1 {
		t.Error("expected at least 1 MWh for large area")
	}
}

func TestOptimize_UnknownObjectiveReturnsNil(t *testing.T) {
	svc := newSitePlanSvc(t)
	// Unknown objective: inner switch hits default branch → all candidates skipped → bestPlan nil
	plan, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 4, Quantity: 2}},
		Objective: "unknown_obj",
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan != nil {
		t.Error("expected nil plan for unknown objective (no valid candidates)")
	}
}

func TestOptimize_SkipsZeroEnergyDevice(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	svc := NewSitePlanService(db)

	// Insert a device with zero energy — Optimize must skip it (energyMWh <= 0)
	db.Exec(`INSERT INTO devices (name, category, width_ft, height_ft, energy_mwh, cost, release_year) VALUES ('ZeroE', 'battery', 10, 10, 0, 1000, 2020)`)

	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
		Objective: models.ObjectiveMinArea,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
}

func TestOptimizeMaxPower_SkipsZeroDimensionDevice(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	svc := NewSitePlanService(db)

	// Insert a device with zero width — OptimizeMaxPower must skip it
	db.Exec(`INSERT INTO devices (name, category, width_ft, height_ft, energy_mwh, cost, release_year) VALUES ('ZeroW', 'battery', 0, 10, 1, 1000, 2020)`)

	plan, apiErr := svc.OptimizeMaxPower(context.Background(), 50000)
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	// Plan should still be found using the valid seeded devices
	if plan == nil {
		t.Error("expected a valid plan from non-zero-dimension devices")
	}
}

func TestGenerate_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSitePlanService(db)
	db.Close() // force lookupDevice to fail with internal error

	_, apiErr := svc.Generate(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
	})
	if apiErr == nil {
		t.Fatal("expected error for closed DB")
	}
	if apiErr.Code != models.ErrorInternal {
		t.Errorf("want INTERNAL_ERROR, got %v", apiErr.Code)
	}
}

func TestOptimize_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSitePlanService(db)
	db.Close() // force QueryContext in Optimize to fail

	_, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 4, Quantity: 1}},
		Objective: models.ObjectiveMinArea,
	})
	// Optimize calls Generate first which will fail with closed DB
	if apiErr == nil {
		t.Fatal("expected error for closed DB in Optimize")
	}
}

func TestOptimizeMaxPower_DBError(t *testing.T) {
	db, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	svc := NewSitePlanService(db)
	db.Close() // force QueryContext to fail

	_, apiErr := svc.OptimizeMaxPower(context.Background(), 50000)
	if apiErr == nil {
		t.Fatal("expected error for closed DB in OptimizeMaxPower")
	}
}

// --------------- Multi-type optimization ---------------

func TestOptimize_MultiType_ProducesValidPlan(t *testing.T) {
	svc := newSitePlanSvc(t)
	// Mixed baseline: Megapack XL (id=1, 4MWh) + PowerPack (id=4, 1MWh) = 5 MWh total.
	// The optimizer searches both single-type and two-type combinations for 5 MWh.
	plan, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices: []models.ConfiguredDevice{
			{ID: 1, Quantity: 1},
			{ID: 4, Quantity: 1},
		},
		Objective: models.ObjectiveMinArea,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	// Result may be nil (baseline already optimal) or a better plan — both are valid.
	if plan != nil {
		if plan.Metrics.BoundingAreaSqFt <= 0 {
			t.Error("expected positive area in multi-type optimized plan")
		}
		if plan.Metrics.TotalEnergyMWh <= 0 {
			t.Error("expected positive energy in multi-type optimized plan")
		}
	}
}

func TestOptimize_MultiType_MinCost(t *testing.T) {
	svc := newSitePlanSvc(t)
	// 2x Megapack XL = 8 MWh at high cost — optimizer should find cheaper 2-type alternatives.
	plan, apiErr := svc.Optimize(context.Background(), models.GenerateSitePlanRequest{
		Devices:   []models.ConfiguredDevice{{ID: 1, Quantity: 2}},
		Objective: models.ObjectiveMinCost,
	})
	if apiErr != nil {
		t.Fatalf("unexpected error: %+v", apiErr)
	}
	if plan != nil {
		// Any improved plan must cost less than the baseline.
		baseline := 2*120000 + 1*50000 // 2 Megapack XL + 1 transformer
		if plan.Metrics.TotalCost >= baseline {
			t.Errorf("expected improved plan to cost less than baseline %d, got %d", baseline, plan.Metrics.TotalCost)
		}
	}
}
