.PHONY: dev backend frontend

# Run frontend and backend together. Ctrl+C stops both.
dev:
	@echo "Starting backend (http://localhost:8080) and frontend (http://localhost:8000)..."
	@trap 'kill %1 %2 2>/dev/null; exit 0' INT TERM; \
	(cd backend && go run ./cmd/server) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && npm run dev
