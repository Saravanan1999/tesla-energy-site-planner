package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/stygianphantom/tesla-energy-site-planner/internal/handlers"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", handlers.HealthCheck)

	addr := ":8080"
	fmt.Printf("Server running on http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
