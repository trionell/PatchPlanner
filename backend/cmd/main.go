package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/trionell/patchplanner/internal/api"
	"github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/service"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	addr := envOr("PATCHPLANNER_ADDR", ":7331")
	dbPath := envOr("PATCHPLANNER_DB", "./patchplanner.db")
	migrationsPath := envOr("PATCHPLANNER_MIGRATIONS", "./migrations")
	corsOrigin := envOr("PATCHPLANNER_CORS_ORIGIN", "http://localhost:5173")
	frontendURL := envOr("PATCHPLANNER_FRONTEND_URL", "http://localhost:5173")

	sessionTTL, err := time.ParseDuration(envOr("PATCHPLANNER_SESSION_TTL", "720h"))
	if err != nil {
		logger.Error("invalid PATCHPLANNER_SESSION_TTL", slog.Any("error", err))
		os.Exit(1)
	}

	googleClientID := os.Getenv("PATCHPLANNER_GOOGLE_CLIENT_ID")
	googleClientSecret := os.Getenv("PATCHPLANNER_GOOGLE_CLIENT_SECRET")
	googleRedirectURL := os.Getenv("PATCHPLANNER_GOOGLE_REDIRECT_URL")

	authConfig := api.AuthConfig{
		Provider:      service.NewGoogleIdentityProvider(googleClientID, googleClientSecret, googleRedirectURL),
		AllowedEmails: service.ParseAllowedEmails(os.Getenv("PATCHPLANNER_ALLOWED_EMAILS")),
		FrontendURL:   frontendURL,
		SessionTTL:    sessionTTL,
	}

	database, err := db.Open(dbPath, migrationsPath, logger)
	if err != nil {
		logger.Error("failed to initialize database", slog.Any("error", err))
		os.Exit(1)
	}
	defer func() { _ = database.Close() }()

	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{corsOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	r.Mount("/api/v1", api.NewRouter(database, authConfig))

	logger.Info("starting server", slog.String("addr", addr), slog.String("db", dbPath))
	if err := http.ListenAndServe(addr, r); err != nil {
		logger.Error("server stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
