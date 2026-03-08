# tesla-energy-site-planner

A full-stack Tesla Energy site planning tool built with React + TypeScript (frontend) and Go (backend).

## Project Structure

```
tesla-energy-site-planner/
├── frontend/   # React + TypeScript (Vite)
└── backend/    # Go HTTP API
```

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Go](https://go.dev/) v1.21+
- `make` (pre-installed on macOS/Linux)

## Getting Started

### One command (recommended)

Starts the backend and frontend together. Press `Ctrl+C` to stop both.

```bash
make dev
```

- Frontend: `http://localhost:8000`
- Backend API: `http://localhost:8080`

### Individually

```bash
make backend    # backend only  → http://localhost:8080
make frontend   # frontend only → http://localhost:8000
```

Or without `make`:

```bash
# backend
cd backend && go run ./cmd/server

# frontend
cd frontend && npm install && npm run dev
```

## Optimization Algorithms

See [ALGORITHMS.md](ALGORITHMS.md) for a full description of all three optimization modes:

- **Minimize site area** — given a fixed total power target
- **Minimize cost** — given a fixed total power target
- **Maximize power** — given a fixed site area

## API Endpoints

| Method | Path                     | Description              |
|--------|--------------------------|--------------------------|
| GET    | /api/health              | Health check             |
| GET    | /api/devices             | List available devices   |
| POST   | /api/site-plan           | Generate a site plan     |
| POST   | /api/optimize            | Optimize a site plan     |
| POST   | /api/optimize-power      | Maximize power for area  |
| GET    | /api/sessions            | List saved sessions      |
| POST   | /api/sessions            | Create a session         |
| GET    | /api/sessions/{id}       | Get a session            |
| PUT    | /api/sessions/{id}       | Update a session         |
| DELETE | /api/sessions/{id}       | Delete a session         |

## Environment Variables

### Frontend

All `.env` files are **gitignored**. Only `frontend/.env.example` is committed.

For local development, copy the example file:

```bash
cp frontend/.env.example frontend/.env
```

| File | Committed | Purpose |
|------|-----------|---------|
| `.env.example` | Yes | Documents all variables with defaults — copy to `.env` to get started |
| `.env` | No | Local defaults — overrides nothing else, safe for non-secret values |
| `.env.local` | No | Personal overrides — highest priority, never shared |

#### Available variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `VITE_APP_ENV` | `local` \| `prod` | `local` | Selects the backend target |
| `VITE_API_URL` | any URL | _(derived from `VITE_APP_ENV`)_ | Override the backend URL directly, ignoring `VITE_APP_ENV` |

#### Backend targets

| `VITE_APP_ENV` | Backend URL |
|----------------|-------------|
| `local` _(default)_ | `http://localhost:8080` |
| `prod` | `https://tesla-energy-site-planner.onrender.com` |

#### Pointing a local frontend at the production backend

Create `frontend/.env.local` with:

```env
VITE_APP_ENV=prod
```

This is gitignored and takes highest priority without touching any committed file.

#### Deploying to Render

Vite embeds `VITE_*` variables into the JS bundle **at build time**. Set `VITE_APP_ENV=prod` in Render's **Environment** settings for your frontend service. Render exposes it to the build process automatically, so no `.env` file is needed on the server.

## Testing

### Backend

Run all tests:

```bash
cd backend
go test ./internal/...
```

Run with coverage report (file by file):

```bash
cd backend
go test ./internal/... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

Show total coverage only:

```bash
go test ./internal/... -coverprofile=coverage.out && go tool cover -func=coverage.out | grep total:
```

View an HTML coverage report in your browser:

```bash
go tool cover -html=coverage.out
```

Current coverage (all packages >90%):

| Package                  | Coverage |
|--------------------------|----------|
| internal/database        | 94.4%    |
| internal/handlers        | 92.0%    |
| internal/services        | 90.4%    |

### Frontend

Run all tests:

```bash
cd frontend
npm test
```

Run with coverage report:

```bash
cd frontend
npm run test:coverage
```

Coverage output is printed to the terminal. An HTML report is generated in `frontend/coverage/` and can be opened in a browser:

```bash
open frontend/coverage/index.html
```

Current coverage (111 tests across 9 test files):

| File                         | Statements | Branches | Functions | Lines  |
|------------------------------|------------|----------|-----------|--------|
| api/client.ts                | 100%       | 100%     | 100%      | 100%   |
| api/index.ts                 | 100%       | 87.5%    | 100%      | 100%   |
| components/DeviceCard        | 100%       | 100%     | 80%       | 100%   |
| components/DeviceCatalog     | 100%       | 100%     | 100%      | 100%   |
| components/InfoTooltip       | 100%       | 100%     | 100%      | 100%   |
| components/MetricsPanel      | 100%       | 100%     | 100%      | 100%   |
| components/OptimizationPanel | 99.36%     | 90.3%    | 70%       | 99.36% |
| components/ResumeModal       | 100%       | 100%     | 75%       | 100%   |
| **All files**                | **99.65%** | **93.57%** | **81.25%** | **99.65%** |

## Building for Production

### Frontend

```bash
cd frontend
npm run build
```

Output is in `frontend/dist/`. The build automatically uses `VITE_APP_ENV=prod` (via `.env.production`).

### Backend

```bash
cd backend
go build -o bin/server ./cmd/server
./bin/server
```
