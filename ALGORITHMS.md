# Optimization Algorithms

This document describes the three optimization modes used to generate and optimize Tesla Energy site plans.

---

## Shared Foundation: Layout Engine

Every plan — regardless of optimization mode — is built by the same two-step layout engine.

### Step 1: Optimal Width Search

The engine tries every integer usable width from the minimum that fits the widest single device up to a hard cap of **100 ft**. For each candidate width it simulates the full row packing (without allocating layout items) and computes the resulting bounding site area:

```
site_area = (usableWidth + 2 × perimeterMargin) × (totalHeight + perimeterMargin)
```

The width that produces the smallest area is selected. This is a linear scan over the Pareto tradeoff between width and height — wider rows reduce height but increase width, and the product is minimised at the crossover point.

### Step 2: First Fit Decreasing (FFD) Row Packing

Devices are sorted by width **descending** (widest first). Each device is placed into the first existing row that has enough remaining space. If no row fits, a new row is opened below the last.

This is the standard FFD bin-packing heuristic — placing wider items first ensures narrow items can fill the gaps left at row ends, maximising utilisation.

### Safety Clearances

All layouts apply fixed clearances defined in the service layer:

| Parameter | Value | Where applied |
|-----------|-------|---------------|
| Perimeter margin | 10 ft | All four sides of the site boundary |
| Side clearance | 2 ft | Between adjacent devices in the same row |
| Row aisle | 5 ft | Vertical gap between rows |
| Transformer buffer | 10 ft | Gap between the battery zone and transformer zone |
| Transformer ratio | 1 per 2 batteries | Auto-derived; not user-configurable |

### Energy Tolerance Window

All three algorithms use the same tolerance when matching a target energy:

| Bound | Value | Reason |
|-------|-------|--------|
| Upper | `target + 0.05 MWh` | Absorbs floating-point rounding when calculating integer quantities |
| Lower | `target − 0.05 MWh` | Symmetric with upper; only admits floating-point rounding. The previous `target × 0.99` bound was too wide — for a 483 MWh target it admitted 478 MWh candidates, letting min_cost repeatedly suggest lower-energy plans at lower cost and creating an infinite improvement loop. |

---

## Algorithms 1 & 2 — Minimize Site Area / Minimize Cost (given fixed total power)

**Endpoints:**
- `POST /api/optimize` with `"objective": "min_area"`
- `POST /api/optimize` with `"objective": "min_cost"`

**Input:** A current device configuration with a known total energy (MWh).

**Goal:** Find the battery mix that achieves the same total energy while minimising either the site bounding area or the total equipment cost.

### How it works

Both objectives share the same candidate generation engine: an **unbounded-knapsack DP** over integer MWh energy levels. The DP systematically enumerates every reachable battery mix — including any number of types in any combination — then the best candidate is chosen by running the real layout engine on each feasible one.

**DP table construction**

```
step = 1 MWh  (exact for the current integer-MWh catalog)
K    = 20     (max candidates retained per energy bucket)
nBuckets = ceil((targetEnergy + 0.05 + step) / step) + 1

dp[0] = { empty configuration }

for e = 0 to nBuckets − 1:
  for each battery type t:
    nextE = e + round(energy[t] / step)
    if nextE ≥ nBuckets: skip
    for each candidate c in dp[e]:
      nc = clone(c); nc.count[t]++
      insert nc into dp[nextE]     ← keep top K by (footprint, cost, device count)
                                      objective-aware: min_area sorts by footprint first,
                                      min_cost sorts by cost first
```

Duplicate mixes (same counts, different insertion path) are deduplicated before insertion.

**Candidate evaluation**

Collect all entries whose energy falls in the tolerance window `[target × 0.99, target + 0.05]`:

```
for each feasible candidate c:
  generate full layout → bounding area, total cost
  track candidate with minimum metric (area for min_area, cost for min_cost)
```

**Result selection:**

```
bestPlan = candidate with minimum metric
If bestPlan.metric >= currentPlan.metric → return null (already optimal)
Else → return bestPlan
```

For `min_cost`, transformer count (`ceil(batteryCount / 2)`) contributes `$50,000` per transformer — so choosing fewer, larger batteries also reduces transformer count, which is captured naturally in the total cost comparison.

**Complexity:** `O(nBuckets × n × K)` DP steps + layout evaluations for feasible candidates.
With 4 types, K=20, and a 10 MWh target: roughly **10 × 4 × 20 = 800** DP transitions, plus a small number of full layout calls.

**Why DP over fraction sweeping:** the previous implementation swept 9 fixed energy-split fractions over all type pairs, missing 3+-type combinations and non-obvious splits. The DP visits every reachable mix up to the energy cap, so no valid candidate is ever skipped.

---

## Algorithm 3 — Maximize Power (given a fixed site area)

**Endpoint:** `POST /api/optimize-power`

**Input:** A target site area in square feet.

**Goal:** Find the battery mix that fits within the given area while maximising total energy stored (MWh).

### How it works

Unlike Algorithms 1 & 2, site area depends on packing and is **not additive** — a DP over area is not directly applicable. However the same energy-keyed DP can still be used: it generates all reachable battery mixes as candidates, and the area constraint is checked by running the layout engine on each one.

**Phase 1 — single-type binary search**

For each battery type, find the maximum quantity that fits within the area:

```
hiQty = (targetArea / (widthFt × heightFt)) × 2 + 10   ← conservative upper bound

Binary search on quantity [lo=1 .. hi=hiQty]:
  mid = (lo + hi) / 2
  Generate plan for mid units of this type
  If plan.boundingArea > targetArea → hi = mid − 1
  Else                              → maxFitting = mid; lo = mid + 1
```

This establishes the initial best plan and a tight energy ceiling: `maxE = maxSingleTypeEnergy × 1.2 + 5`.
The 1.2× buffer allows for mixed configurations that fill row-end gaps — but mixed types cannot pack dramatically more energy than the best single type.

**Phase 2 — DP-based mixed-type search**

Build the same unbounded-knapsack DP as Algorithms 1 & 2, but only up to `maxE`:

```
dp[0] = { empty }
for e = 0 to maxE:
  for each type t: extend dp[e] → dp[e + energy[t]]  (top-K pruning per bucket)
```

Then scan the DP from the highest energy level downward, evaluating only multi-type candidates:

```
for e from maxE down to (bestPlan.energy + 1):
  for each candidate c in dp[e]:
    if c.footprint > targetArea: skip  ← definitely can't fit
    if c has only 1 distinct type: skip  ← already covered by Phase 1
    generate full layout
    if area ≤ targetArea and energy > bestPlan.energy: update bestPlan
  if bestPlan found and e × step ≤ bestPlan.energy: break  ← no higher energy possible
```

**Result selection:**

```
Primary:    highest totalEnergyMWh
Tiebreaker: lowest totalCost (when energy difference < 0.01 MWh)
```

**Complexity:**
- Phase 1: `O(n × log(hiQty))` layout calls
- Phase 2 DP build: `O(maxE/step × n × K)` transitions
- Phase 2 scan: limited by how close mixed types get to `maxE` — in practice few calls because the scan stops as soon as the best single-type energy is matched

With 4 types: Phase 1 ≈ **4 × 7 = 28** calls; Phase 2 proportional to how many buckets lie above the single-type energy ceiling.

---

## Comparison Summary

| Mode | Fixed input | Optimised metric | Search strategy |
|------|------------|-----------------|-----------------|
| Min area | Total power (MWh) | Bounding area (sq ft) | Unbounded-knapsack DP, top-K pruning per energy bucket |
| Min cost | Total power (MWh) | Total equipment cost ($) | Unbounded-knapsack DP, top-K pruning per energy bucket |
| Max power | Site area (sq ft) | Total energy (MWh) | Binary search (single-type) + DP scan (multi-type) |
