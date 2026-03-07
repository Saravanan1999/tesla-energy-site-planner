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
	mux.HandleFunc("GET /api/sessions", sessionHandler.ListSessions)
	mux.HandleFunc("POST /api/sessions", sessionHandler.CreateSession)
	mux.HandleFunc("GET /api/sessions/{sessionId}", sessionHandler.GetSession)
	mux.HandleFunc("PUT /api/sessions/{sessionId}", sessionHandler.UpdateSession)
	mux.HandleFunc("DELETE /api/sessions/{sessionId}", sessionHandler.DeleteSession)

	addr := ":8080"
	fmt.Printf("Server running on http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
