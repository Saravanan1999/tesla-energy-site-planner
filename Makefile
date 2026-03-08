.PHONY: dev backend frontend install

# Run frontend and backend together. Ctrl+C stops both.
dev: install
	@echo "Starting backend (http://localhost:8080) and frontend (http://localhost:8000)..."
	@trap 'kill %1 %2 2>/dev/null; exit 0' INT TERM; \
	(cd backend && go run ./cmd/server) & \
	(cd frontend && npm run dev) & \
	wait

install:
	cd frontend && npm install

backend:
	cd backend && go run ./cmd/server

frontend: install
	cd frontend && npm run dev
