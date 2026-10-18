package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/trionell/patchplanner/internal/service"
)

// The console showfile (Slice 49): one desk as the file its model loads, and
// the preview of what that file holds and cannot hold. Both read, so a viewer
// may export, like every export (RequireEventAccess).
func (h RentalHandler) registerConsoleExport(r chi.Router) {
	r.Get("/console-export", h.exportConsole)
	r.Get("/console-export/preview", h.previewConsoleExport)
}

func (h RentalHandler) consoleExport(w http.ResponseWriter, r *http.Request) (service.ConsoleExport, bool) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return service.ConsoleExport{}, false
	}
	consoleID, err := strconv.ParseInt(r.URL.Query().Get("console"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "console must be a desk id")
		return service.ConsoleExport{}, false
	}
	ports := service.ExportPorts{}
	if raw := r.URL.Query().Get("ports"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &ports); err != nil {
			writeError(w, http.StatusBadRequest, "ports must be a JSON map of box → port")
			return service.ConsoleExport{}, false
		}
	}
	export, err := service.ExportService{DB: h.DB}.BuildConsoleExport(eventID, consoleID, ports)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "desk not found")
		return service.ConsoleExport{}, false
	case errors.Is(err, service.ErrGenericDesk):
		writeError(w, http.StatusConflict, "This desk is Generic, so there is no file to write. Pick its model in Rig.")
		return service.ConsoleExport{}, false
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
		return service.ConsoleExport{}, false
	}
	return export, true
}

func (h RentalHandler) exportConsole(w http.ResponseWriter, r *http.Request) {
	export, ok := h.consoleExport(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", contentDisposition(export.Filename))
	_, _ = w.Write(export.Bytes)
}

func (h RentalHandler) previewConsoleExport(w http.ResponseWriter, r *http.Request) {
	export, ok := h.consoleExport(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Filename string `json:"filename"`
		service.ConsoleExport
	}{export.Filename, export})
}
