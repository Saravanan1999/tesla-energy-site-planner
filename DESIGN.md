# Tesla Energy Site Planner — Design Document

> A technical reference for the full system: how it works, how it's built, and why key decisions were made.

---

## Table of Contents

1. [What the App Does](#1-what-the-app-does)
2. [System Architecture](#2-system-architecture)
3. [Database](#3-database)
4. [REST API](#4-rest-api)
5. [Data Models](#5-data-models)
6. [Layout Engine](#6-layout-engine)
7. [Optimization Algorithms](#7-optimization-algorithms)
8. [Frontend](#8-frontend)

---

## 1. What the App Does

Tesla Energy Site Planner helps engineers design physical layouts for large-scale battery energy storage sites.

The user picks battery types and quantities from a catalog (PowerPack, Megapack, etc.). The backend automatically:

- Determines how many transformers are needed
- Packs everything into rows, respecting safety clearances
- Optionally finds the site dimensions that minimize the total footprint
- Optionally runs optimization to find a cheaper or more compact battery mix

The result is an interactive canvas showing the exact placement of every device, with exportable PNG/PDF plans.

---

## 2. System Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────────────────────┐
│          Browser             │        │                 Backend (Go)               │
│                              │        │                                            │
│  React + TypeScript + Vite   │◀──────▶│  net/http server · port 8080              │
│  Tailwind CSS                │  JSON  │                                            │
│                              │        │  Handlers  →  Services  →  SQLite (WAL)   │
└──────────────────────────────┘        └────────────────────────────────────────────┘
```

**Backend:** Pure Go 1.21+ standard library — no web framework. Structured logging via `log/slog`. All HTTP responses follow a consistent `{ success, data, error }` envelope.

**Database:** SQLite via `modernc.org/sqlite` (pure Go, no CGO). WAL journal mode enabled for better concurrent read performance.

**Frontend:** React 18 with TypeScript, bundled by Vite, styled with Tailwind CSS v4.

### Environment configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | Backend listen port |
| `VITE_APP_ENV` | `local` | `local` → `http://localhost:8080` · `prod` → deployed URL |
| `VITE_API_URL` | _(unset)_ | Direct URL override, takes precedence over `VITE_APP_ENV` |

---

## 3. Database

The database has two tables. It is created automatically on first startup; no migration tool is needed.

### `devices` — the hardware catalog

```sql
CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    category     TEXT    NOT NULL CHECK(category IN ('battery', 'transformer')),
    width_ft     INTEGER NOT NULL DEFAULT 0,
    height_ft    INTEGER NOT NULL DEFAULT 0,
    energy_mwh   REAL    NOT NULL DEFAULT 0,
    cost         INTEGER NOT NULL DEFAULT 0,
    release_year INTEGER NOT NULL DEFAULT 0
);
```

Four batteries are seeded on first run. Transformers are not stored — they are sized and placed automatically by the layout engine (1 transformer per 2 batteries).

| Name | Width | Height | Energy | Cost | Year |
|------|-------|--------|--------|------|------|
| Megapack XL | 40 ft | 10 ft | 4 MWh | $120,000 | 2022 |
| Megapack 2 | 30 ft | 10 ft | 3 MWh | $80,000 | 2021 |
| Megapack | 30 ft | 10 ft | 2 MWh | $50,000 | 2005 |
| PowerPack | 10 ft | 10 ft | 1 MWh | $10,000 | 2000 |

### `sessions` — saved planning sessions

```sql
CREATE TABLE IF NOT EXISTS sessions (
    session_id             TEXT PRIMARY KEY,
    name                   TEXT NOT NULL UNIQUE,   -- unique; saving same name = update
    devices                TEXT NOT NULL,           -- JSON array of { id, quantity }
    saved_at               TEXT NOT NULL,           -- RFC 3339 timestamp
    optimization_objective TEXT NOT NULL DEFAULT 'min_area',
    site_plan_json         TEXT                     -- full SitePlanData JSON (nullable)
);
```

**Key design decisions:**

- **Name uniqueness:** Saving with an existing name updates that session instead of creating a duplicate. This lets the app auto-save without accumulating clutter.
- **`site_plan_json`:** The full computed layout is stored alongside the device list. On resume, the exact layout is restored without recomputation. If this column is null (legacy sessions), the server regenerates the plan from the device list.
- **Sessions are ordered newest-first** on list (`ORDER BY saved_at DESC`).

---

## 4. REST API

### Response envelope

Every endpoint returns JSON in this shape:

```jsonc
// Success
{ "success": true, "data": { ... } }

// Failure
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable text", "details": ["..."] } }
```

### Error codes

| Code | Meaning |
|------|---------|
| `INVALID_CONFIG` | Bad request payload or validation failure (e.g. unknown device ID) |
| `LAYOUT_NOT_FEASIBLE` | A device is wider than the maximum usable site width |
| `INTERNAL_ERROR` | Unexpected server-side failure |
| `METHOD_NOT_ALLOWED` | Wrong HTTP method for this route |

---

### Device catalog

#### `GET /api/devices`

Returns all devices in the catalog.

```jsonc
// Response
{
  "success": true,
  "data": {
    "devices": [
      { "id": 1, "name": "Megapack XL", "category": "battery",
        "widthFt": 40, "heightFt": 10, "energyMWh": 4, "cost": 120000, "releaseYear": 2022 },
      ...
    ]
  }
}
```

---

### Site plan generation

#### `POST /api/site-plan`

Generates a layout for exactly the devices you requested — no substitution.

```jsonc
// Request
{
  "devices": [{ "id": 1, "quantity": 3 }, { "id": 4, "quantity": 10 }],
  "objective": "min_area"   // stored as metadata; does not affect the layout here
}
```

Returns a full `SitePlanData` object (see §5).

---

#### `POST /api/optimize`

Given the current device configuration, finds a different battery mix that achieves the **same total energy** at a lower area or lower cost.

```jsonc
// Request
{
  "devices": [{ "id": 1, "quantity": 3 }, { "id": 4, "quantity": 10 }],
  "objective": "min_area"  // or "min_cost"
}
```

Returns either an improved `SitePlanData`, or `{ "success": true, "data": null }` when the current plan is already optimal.

---

#### `POST /api/plan-for-energy`

Finds the best battery mix to achieve a specific energy target.

```jsonc
// Request
{ "targetMWh": 50.0, "objective": "min_area" }  // targetMWh: 0 < x ≤ 500
```

Returns `SitePlanData`, or `null` data if the target is unreachable.

---

#### `POST /api/optimize-power`

Finds the battery mix that stores the **most energy** while fitting within a site area budget.

```jsonc
// Request
{ "targetAreaSqFt": 50000 }  // 0 < x ≤ 100,000
```

Returns the highest-energy `SitePlanData` that fits in the given area.

---

### Session management

#### `GET /api/sessions`

Lists all sessions, newest first.

```jsonc
// Response
{ "success": true, "data": { "sessions": [{ "sessionId": "...", "name": "Site A", "savedAt": "..." }] } }
```

#### `POST /api/sessions`

Creates or updates a session. If a session with the same `name` already exists it is overwritten.

```jsonc
// Request
{
  "name": "Site A",
  "devices": [{ "id": 1, "quantity": 3 }],
  "objective": "min_area",
  "sitePlan": { ... }   // optional — verbatim SitePlanData to store
}
// Response → SessionData: { sessionId, name, savedAt }
```

#### `GET /api/sessions/{sessionId}`

Returns a session with its full site plan inlined. If no plan was stored, the server regenerates it.

```jsonc
// Response
{ "success": true, "data": { "sessionId": "...", "name": "...", "savedAt": "...", /* SitePlanData fields */ } }
```

#### `PUT /api/sessions/{sessionId}`

Updates an existing session by ID. Same request body as `POST /api/sessions`.

#### `DELETE /api/sessions/{sessionId}`

Permanently deletes a session.

---

## 5. Data Models

These TypeScript types (in `frontend/src/types/api.ts`) mirror the Go backend structs exactly.

### `SitePlanData` — the core layout response

```typescript
interface SitePlanData {
  requestedDevices: ConfiguredDevice[]   // what was asked for
  metrics: SiteMetrics                   // totals and site dimensions
  layout: LayoutItem[]                   // every placed device with coordinates
  safetyAssumptions: SafetyAssumptions   // clearance constants used
  warnings?: string[]                    // non-fatal notes (e.g. width at cap)
  objective: 'min_area' | 'min_cost' | 'user_plan'
}
```

### `SiteMetrics`

```typescript
interface SiteMetrics {
  totalBatteryCount: number
  requiredTransformers: number
  totalCost: number              // batteries + transformers, USD
  transformerCostEach: number    // always $50,000
  totalEnergyMWh: number
  equipmentFootprintSqFt: number // raw device area (no clearances)
  siteWidthFt: number            // total width including perimeter margins
  siteHeightFt: number           // total height including perimeter margins
  boundingAreaSqFt: number       // siteWidthFt × siteHeightFt
}
```

### `LayoutItem` — a single placed device

```typescript
interface LayoutItem {
  id: string        // stable: "{prefix}-{deviceId}-{instanceIndex}"
  deviceId: number
  label: string     // e.g. "Megapack XL", "Transformer"
  zone: 'battery' | 'transformer'
  xFt: number       // left edge from site origin (already offset by perimeter margin)
  yFt: number       // top edge
  widthFt: number
  heightFt: number
  energyMWh: number // 0 for transformers
  cost: number      // 0 for transformers (counted in metrics separately)
}
```

The `id` format (e.g. `battery-4-3`) is designed to be stable across re-layouts of the same device set. This lets the frontend animate position changes with FLIP instead of fully unmounting and remounting elements.

### `SafetyAssumptions` — clearance constants

```typescript
interface SafetyAssumptions {
  perimeterMarginFt: number    // 10 ft
  sideClearanceFt: number      // 2 ft
  rowAisleFt: number           // 5 ft
  transformerBufferFt: number  // 10 ft
  maxUsableWidthFt: number     // 80 ft  → total site max = 100 ft
  version: string              // "1.0"
}
```

These are returned with every plan (rather than being hardcoded in the frontend) so the canvas can render clearance zones correctly even if the server-side constants change.

---

## 6. Layout Engine

The layout engine is the shared foundation used by every plan-generation and optimization endpoint. It lives in `backend/internal/services/siteplan.go`.

### Site width limits

The total site width is capped at **100 ft**. With 10 ft perimeter margins on each side, that leaves **80 ft of usable equipment area** (`maxUsableWidthFt = 80`).

### Step 1 — find the optimal width

The engine doesn't just use the maximum width. It tries every integer usable width from the minimum that fits the widest single device up to 80 ft, simulates the full row packing at each width, and picks the one that produces the smallest bounding area:

```
site_area = (usableWidth + 2 × 10) × (totalHeight + 10)
```

**Why not always use the maximum width?** Wider rows reduce height, but also increase width. The product (area) is minimised at a crossover point that depends on the specific device mix. For example, 10 identical 30 ft batteries pack best at 60 ft wide (2 per row) rather than 80 ft wide (where the second row would be mostly empty).

### Step 2 — First Fit Decreasing (FFD) row packing

Devices are sorted **widest-first**, then placed one by one. Each device goes into the first existing row that has enough horizontal space. If no row fits, a new row opens below the last.

Batteries are packed first (starting at `y = 10 ft` for the top perimeter). Then a transformer buffer gap is added, and transformer rows follow beneath.

**Why FFD?** Placing wide items first ensures narrow items can fill the gaps at row ends, maximising row utilisation. It's a well-known bin-packing heuristic that performs well in practice with a small, structured catalog like this one.

### Safety clearances

| Clearance | Value | Applied between |
|-----------|-------|-----------------|
| Perimeter margin | 10 ft | Site boundary and all content |
| Side clearance | 2 ft | Adjacent devices in the same row |
| Row aisle | 5 ft | Consecutive battery rows |
| Transformer buffer | 10 ft | Battery zone and transformer zone |
| Transformer ratio | 1 per 2 batteries | Auto-computed from battery count |

---

## 7. Optimization Algorithms

### Energy tolerance window

Whenever an algorithm needs to match a target energy, it uses a symmetric ±0.05 MWh window:

```
accepted range = [target − 0.05, target + 0.05]
```

This is intentionally tight. An earlier implementation used `target × 0.99` as the lower bound. For a 483 MWh target that admitted 478 MWh candidates — meaning `min_cost` could legitimately suggest a cheaper 479 MWh plan. Applying that suggestion made 479 the new target, which admitted 474 MWh, and so on — an infinite refinement loop. The symmetric ±0.05 window only admits floating-point rounding, nothing more.

---

### Algorithm 1 & 2 — Minimize Area or Cost (same energy)

> **When to use:** You have a working plan and want to know if a different battery mix achieves the same storage at a smaller footprint or lower cost.

**Input:** Current device configuration (the total energy is derived from it).

**Output:** An improved plan, or `null` if already optimal.

#### How it works

Both objectives share the same **unbounded-knapsack DP** candidate generator. The DP exhaustively enumerates every reachable battery mix up to the energy cap, then the best candidate is selected by running the layout engine on each feasible one.

```
Parameters:
  step     = 1 MWh   (exact for the integer-MWh catalog)
  K        = 20      (max candidates retained per energy bucket)
  nBuckets = ⌈(targetEnergy + 0.05) / step⌉ + 1

Initialization:
  dp[0] = { empty mix }

Fill:
  for each energy bucket e:
    for each battery type t:
      nextE = e + energy[t]              // add one unit of type t
      for each candidate c in dp[e]:
        nc = copy(c) with count[t] += 1
        insert nc into dp[nextE]
        // keep only top-K per bucket, sorted by:
        //   min_area → footprint, then cost, then device count
        //   min_cost → cost, then footprint, then device count

Collect all dp entries where energy ∈ [target − 0.05, target + 0.05]
Run layout engine on each → pick the best
```

**Why DP instead of enumeration?** A brute-force enumeration over all quantity combinations explodes combinatorially. The DP only visits each reachable energy level once per battery type, and the top-K pruning per bucket keeps memory bounded.

**Complexity:** `O(nBuckets × n × K)` DP transitions, plus layout calls for feasible candidates.

---

### Algorithm 3 — Maximize Power (fixed area)

> **When to use:** You have a site and want to know the most energy you can fit on it.

**Input:** Target site area in square feet.

**Output:** The highest-energy layout that fits.

Site area depends on how devices pack and is not additive, so you can't DP directly over area. Instead the energy-keyed DP generates candidates and the area constraint is checked by running the layout engine on each.

#### Phase 1 — binary search per battery type

For each battery type independently, binary-search for the maximum quantity that fits in the area:

```
upper bound = (targetArea / deviceFootprint) × 2 + 10

binary search [lo=1 .. hi=upper]:
  mid = (lo + hi) / 2
  generate plan for mid units of this type
  if plan.area > targetArea → hi = mid − 1
  else                      → best = mid, lo = mid + 1
```

This gives the best single-type plan and sets an energy ceiling for Phase 2:

```
maxE = bestSingleTypeEnergy × 1.2 + 5
```

The 1.2× buffer allows for mixed configurations that fill row-end gaps more efficiently than any single type, but caps the search space to avoid evaluating clearly impossible candidates.

#### Phase 2 — DP mixed-type search

Build the knapsack DP up to `maxE`, then scan from the top down, skipping single-type candidates (already handled) and those whose raw footprint exceeds the area budget:

```
for e from maxE down to (currentBestEnergy + 1):
  for each candidate c in dp[e]:
    if c has only 1 distinct type → skip
    if c.footprint > targetArea   → skip (quick pre-filter)
    generate full layout
    if layout.area ≤ targetArea and energy > best → update best
```

**Result tie-breaking:** if two candidates have equal energy (within 0.01 MWh), the cheaper one wins.

---

### Algorithm 4 — Plan for Energy Target

> **When to use:** You know how much energy you need and want the best plan to deliver it.

**Input:** Target MWh and objective (`min_area` or `min_cost`).

**Output:** The best plan that achieves the target energy, or `null` if unreachable.

Uses the same unbounded-knapsack DP as Algorithms 1 & 2, but without a baseline plan to beat — it simply returns the single best candidate in the tolerance window.

---

### Summary

| Mode | You provide | You get | Strategy |
|------|-------------|---------|----------|
| Generate plan | Devices + quantities | Layout for those exact devices | FFD layout engine only |
| Minimize area | Current plan | Smaller-footprint mix at same energy | Knapsack DP + layout evaluation |
| Minimize cost | Current plan | Cheaper mix at same energy | Knapsack DP + layout evaluation |
| Maximize power | Site area (sq ft) | Highest-energy mix that fits | Binary search + knapsack DP |
| Plan for energy | Target MWh | Best mix to hit that energy | Knapsack DP |

---

## 8. Frontend

### Component overview

| File | What it does |
|------|-------------|
| `App.tsx` | Root. Owns all global state: device selections, active site plan, sessions list, optimization results. Drives all API calls and debounced auto-generate. |
| `components/SiteCanvas.tsx` | Renders the interactive canvas. Handles zoom/pan (mouse wheel + drag + pinch), FLIP animations, and export to PNG/PDF. |
| `components/OptimizationPanel.tsx` | Right-hand sidebar. Shows optimization suggestions, the plan-for-energy and plan-for-area inputs, and session management controls. |
| `api/index.ts` | All API call functions, one per endpoint. Each logs failures to `console.warn` / `console.error`. |
| `api/client.ts` | Resolves the base URL from environment variables. |
| `types/api.ts` | TypeScript interfaces that mirror every backend response type. |

### Canvas animation

When the layout changes (a battery is added, removed, or replaced by optimization), the canvas animates every block to its new position using a **FLIP** technique:

1. **Remove:** the removed item shrinks with a CSS animation. While it shrinks, all other items are frozen at their current pixel positions.
2. **Reflow:** once the shrink completes (≈300 ms), the new layout is applied. Each moved item is immediately offset via `transform: translate(...)` back to where it used to be, making it visually appear to not have moved yet.
3. **Animate:** each item transitions its transform to zero — sliding smoothly to its new position.

**Add** works similarly: moved items slide first (making room), then new items grow in once space is available.

**Stagger cap:** each item's slide starts `delay × index` ms after the previous one. With 200+ devices this would create multi-second delays, causing items to visually overlap while they wait. The per-item delay is dynamically capped so the total stagger window never exceeds 800 ms:

```typescript
const step = Math.min(70, Math.floor(800 / itemCount))
```

### Input limits

Limits are enforced in real-time (`onChange`), not just on blur. Out-of-range values are clamped as the user types.

| Input | Max | Enforced in |
|-------|-----|-------------|
| Energy target | 500 MWh | Frontend (`onChange`) + backend validation |
| Land area | 100,000 sq ft | Frontend (`onChange`) + backend validation |
| Site width | 100 ft total | Backend layout engine (`maxUsableWidthFt = 80`) |

### Loading states

The app has two loading patterns:

- **Full-page splash:** shown on initial plan generation (first load or session resume) when no plan exists yet.
- **In-panel animated dots** (`…`): shown while recomputing an existing plan (e.g. typing a new energy target or area). The current canvas stays visible; only the panel shows `Finding the best layout…` with a cycling dot animation. Both the land-area and energy-target modes use this same in-panel pattern for consistency.

---

## 9. Tradeoffs

Every architectural choice is a tradeoff. Here are the major ones.

| Decision | What I chose | What I gave up | Why |
|----------|--------------|-----------------|-----|
| **SQLite over Postgres/MySQL** | Single embedded file, zero ops overhead, works locally or in a container with no extra process | Multi-writer concurrency; not suitable if many users hammer the DB simultaneously | This is a planning tool used by one or a few engineers at a time. WAL mode gives enough concurrent reads. Deploying Postgres for a single-user tool is overkill. |
| **Go stdlib-only backend** | No external web framework (`net/http` + `encoding/json`). Only one non-stdlib dep: the SQLite driver. | Less built-in validation/middleware sugar | Minimises dependency surface, makes auditing easy, eliminates transitive CVEs. The API is small enough that a framework buys nothing. |
| **DP + top-K pruning over brute force** | `O(T × K)` per item type instead of `O(2^n)` | May miss the global optimum in pathological cases with many item types having similar densities | Brute force over 20 device types is intractable. The top-K heuristic (`K=20`) consistently finds the optimum in practice; energy density varies enough between device families that the true optimum is never pruned. |
| **FFD heuristic over optimal bin-packing** | `O(n log n)` sort + single pass | May leave small gaps that a smarter algorithm could fill | Optimal 2D bin packing is NP-hard. FFD produces near-optimal layouts for rectangular items of similar height (our case) and is easy to reason about and debug. |
| **Symmetric ±0.05 MWh tolerance** | Both `target − 0.05` and `target + 0.05` accepted as "close enough" | A layout that is fractionally under target could be rejected in strict contexts | An asymmetric bound (`target × 0.99`) caused an infinite optimization loop: the algorithm kept iterating trying to hit a target it could never quite reach. Symmetric ±0.05 MWh is well within project uncertainty and breaks the cycle. |
| **Go backend instead of Node.js** | Strong typing, predictable performance, single static binary deployment | Larger ecosystem of frontend-friendly tooling (e.g. shared TS types, tRPC) | The service is CPU-bound (layout + optimization) rather than I/O-bound. Go's performance is predictable under load and the binary deploys anywhere without a runtime. Node would be a natural fit if the backend were just a thin API proxy, but it isn't. |
| **Storing full `site_plan_json` in sessions** | Sessions reload instantly; no recomputation needed | Stored JSON can grow large (hundreds of devices) and may go stale if the algorithm changes | Recomputing a large plan on every load adds latency and non-determinism. Plans are immutable snapshots — the user explicitly creates a new plan when they want a fresh result. Stale data is an acceptable tradeoff for instant recall. |
