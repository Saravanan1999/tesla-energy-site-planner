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
