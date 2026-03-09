

# Tesla Energy Site Planner

A site planning tool for utility-scale battery storage projects. Pick from available Tesla Energy devices (Megapack, PowerPack, etc.) to generate a compliant site layout, or provide an energy target or land-area budget and let the planner find the best-fitting mix.

> **New here?** Start below to get the app running, then see [DESIGN.md](DESIGN.md) for a full technical deep-dive.


🎥 **Demo Video:** https://github.com/user-attachments/assets/e5466223-5ee7-4047-8ca3-7dfc2d7ae4fd

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

**macOS (Homebrew):**
```bash
brew install go node
```

> Homebrew always installs current versions — no extra steps needed.

**Linux (Debian/Ubuntu):**

> `apt` ships outdated versions of both Go and Node. Use the official sources instead.

Node.js 20:
```bash
sudo apt remove --purge nodejs libnode-dev libnode72 -y
sudo apt autoremove -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Go 1.24:
```bash
wget https://go.dev/dl/go1.24.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

> On ARM (e.g. Raspberry Pi) replace `amd64` with `arm64` in the Go download URL.

**Windows:** Download installers from [go.dev](https://go.dev/dl/) and [nodejs.org](https://nodejs.org/), or use WSL and follow the Linux steps above.

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
