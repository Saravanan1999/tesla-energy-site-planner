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

## Getting Started

### Backend

```bash
cd backend
go run ./cmd/server
```

The API server starts on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`.

## API Endpoints

| Method | Path          | Description  |
|--------|---------------|--------------|
| GET    | /api/health   | Health check |

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable       | Default                   | Description        |
|----------------|---------------------------|--------------------|
| VITE_API_URL   | http://localhost:8080     | Backend API base URL |

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

Current coverage targets (all packages >90%):

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

| File                    | Statements | Branches | Functions | Lines  |
|-------------------------|------------|----------|-----------|--------|
| api/client.ts           | 100%       | 100%     | 100%      | 100%   |
| api/index.ts            | 100%       | 87.5%    | 100%      | 100%   |
| components/DeviceCard   | 100%       | 100%     | 80%       | 100%   |
| components/DeviceCatalog| 100%       | 100%     | 100%      | 100%   |
| components/InfoTooltip  | 100%       | 100%     | 100%      | 100%   |
| components/MetricsPanel | 100%       | 100%     | 100%      | 100%   |
| components/OptimizationPanel | 99.36% | 90.3%   | 70%       | 99.36% |
| components/ResumeModal  | 100%       | 100%     | 75%       | 100%   |
| **All files**           | **99.65%** | **93.57%**| **81.25%**| **99.65%** |

## Building for Production

### Frontend

```bash
cd frontend
npm run build
```

Output is in `frontend/dist/`.

### Backend

```bash
cd backend
go build -o bin/server ./cmd/server
./bin/server
```
