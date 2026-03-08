# Tesla Energy Site Planner

A site planning tool for utility-scale battery storage projects. Pick from available Tesla Energy devices (Megapack, PowerPack, etc.) to generate a compliant site layout, or provide an energy target or land-area budget and let the planner find the best-fitting mix.

> **New here?** Start below to get the app running, then see [DESIGN.md](DESIGN.md) for a full technical deep-dive.

---

## What it does

- Select Tesla Energy devices (Megapack, Powerpack) and generate a compliant 2D site layout
- Provide a land area or energy target to find the device mix that best fits your requirements
- Save and restore your layout plans
- Export the canvas to PNG or PDF

---

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Go, net/http, SQLite

---

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | v20+ |
| [Go](https://go.dev/) | v1.21+ |
| `make` | pre-installed on macOS/Linux; Windows users can use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or run the backend and frontend commands directly |

---

## Quickstart

```bash
make dev
```

That's it. This installs frontend dependencies and starts both services.

| Service | URL |
|---------|-----|
| App (frontend) | http://localhost:8000 |
| API (backend) | http://localhost:8080 |

Press `Ctrl+C` to stop both.

### Run services individually

```bash
make backend    # API only  → http://localhost:8080
make frontend   # App only  → http://localhost:8000
```

---

## Environment variables

**No setup needed for local development.** The frontend defaults to `localhost:8080` when no env file is present.

Only create a `.env` file if you need to change something. Use `frontend/.env.example` as a reference:

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_APP_ENV` | `local` | `local` → `localhost:8080`; `prod` → Render deployment |
| `VITE_API_URL` | _(derived)_ | Override the backend URL directly, ignoring `VITE_APP_ENV` |

To point your local frontend at the production backend, create `frontend/.env.local` with:

```env
VITE_APP_ENV=prod
```

This file is gitignored and takes highest priority.

---

## Testing

```bash
# Backend
cd backend && go test ./internal/...

# Frontend
cd frontend && npm test
```

For coverage:

```bash
# Backend (outputs to terminal)
cd backend && go test ./internal/... -coverprofile=coverage.out && go tool cover -func=coverage.out | grep total:

# Frontend (HTML report in frontend/coverage/)
cd frontend && npm run test:coverage
```

Backend coverage: 90%+ across all services, handlers, and database layers. 
Frontend coverage: 90%+ on all statements and branches.

---

## Building for production

```bash
# Frontend — output in frontend/dist/
cd frontend && npm run build

# Backend — outputs binary to backend/bin/server
cd backend && go build -o bin/server ./cmd/server && ./bin/server
```

---

## Project structure

```
tesla-energy-site-planner/
├── backend/        # Go HTTP API (stdlib only + SQLite)
│   ├── cmd/server/ # Entry point
│   └── internal/   # handlers, services, database
├── frontend/       # React + TypeScript (Vite)
│   └── src/
│       ├── components/   # SiteCanvas, OptimizationPanel, …
│       ├── api/          # API client functions
│       └── types/        # TypeScript interfaces
├── DESIGN.md       # Full technical reference
└── Makefile
```

---

## Learn more

See [DESIGN.md](DESIGN.md) for the complete technical reference, including:

- System architecture and database schema
- All REST API endpoints
- Layout engine (how devices are packed onto the canvas)
- Optimization algorithms (knapsack DP, FFD bin-packing)
- Frontend animation system
- Key engineering tradeoffs
