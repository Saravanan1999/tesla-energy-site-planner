package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/database"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/handlers"
	"github.com/stygianphantom/tesla-energy-site-planner/internal/services"
)

func main() {
	db, err := database.Open("tesla_energy.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	log.Println("Database connected and migrations applied")

	sitePlanSvc := services.NewSitePlanService(db)

	devicesHandler := handlers.NewDevicesHandler(db)
	sitePlanHandler := handlers.NewSitePlanHandler(sitePlanSvc)
	sessionHandler := handlers.NewSessionHandler(services.NewSessionService(db), sitePlanSvc)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", handlers.HealthCheck)
	mux.HandleFunc("/api/devices", devicesHandler.GetDevices)
	mux.HandleFunc("/api/site-plan", sitePlanHandler.GenerateSitePlan)
	mux.HandleFunc("/api/optimize", sitePlanHandler.OptimizeSitePlan)
	mux.HandleFunc("/api/optimize-power", sitePlanHandler.OptimizeMaxPower)
	mux.HandleFunc("/api/plan-for-energy", sitePlanHandler.PlanForEnergy)
	mux.HandleFunc("GET /api/sessions", sessionHandler.ListSessions)
	mux.HandleFunc("POST /api/sessions", sessionHandler.CreateSession)
	mux.HandleFunc("GET /api/sessions/{sessionId}", sessionHandler.GetSession)
	mux.HandleFunc("PUT /api/sessions/{sessionId}", sessionHandler.UpdateSession)
	mux.HandleFunc("DELETE /api/sessions/{sessionId}", sessionHandler.DeleteSession)

	cors := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	addr := ":8080"
	fmt.Printf("Server running on http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, cors(mux)))
}
