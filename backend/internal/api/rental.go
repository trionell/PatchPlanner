package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	dbstore "github.com/trionell/patchplanner/internal/db"
	"github.com/trionell/patchplanner/internal/domain"
	"github.com/trionell/patchplanner/internal/service"
	"github.com/xuri/excelize/v2"
)

type RentalHandler struct {
	DB *sql.DB
}

func (h RentalHandler) Register(r chi.Router) {
	r.Get("/rentals", h.getSummary)
	r.Put("/rentals/manual/{itemID}", h.putManualLine)
	r.Delete("/rentals/manual/{itemID}", h.deleteManualLine)
	r.Get("/rental-export", h.exportFile)
	r.Get("/rental-export/report", h.exportReport)
	// Available for every inventory, whatever its source format — these are
	// what guarantee no inventory is a dead end (Slice 22).
	r.Get("/rental-export/pdf", h.exportPDF)
	r.Get("/rental-export/xlsx", h.exportGenericXLSX)
	// The audio plan as one document — input patch, output patch, stage rig
	// and both signal-flow drawings (Slice 40). Registered on the same event
	// router as the rest, so RequireEventAccess already covers it: an export
	// reads, and a viewer may read.
	r.Get("/audio-export/pdf", h.exportAudioPDF)
	h.registerConsoleExport(r)
}

func (h RentalHandler) exportAudioPDF(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	data, filename, err := service.ExportService{DB: h.DB}.BuildAudioPDF(eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", pdfContentType)
	w.Header().Set("Content-Disposition", contentDisposition(filename))
	_, _ = w.Write(data)
}

func (h RentalHandler) exportPDF(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	data, filename, err := service.ExportService{DB: h.DB}.BuildRentalPDF(eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", pdfContentType)
	w.Header().Set("Content-Disposition", contentDisposition(filename))
	_, _ = w.Write(data)
}

func (h RentalHandler) exportGenericXLSX(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	file, filename, err := service.ExportService{DB: h.DB}.BuildGenericRentalXLSX(eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer func() { _ = file.Close() }()

	w.Header().Set("Content-Type", xlsxContentType)
	w.Header().Set("Content-Disposition", contentDisposition(filename))
	if err := file.Write(w); err != nil {
		// Headers are already sent; the client sees a truncated download.
		return
	}
}

func (h RentalHandler) exportFile(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	file, report, ok := h.buildExport(w, eventID)
	if !ok {
		return
	}
	defer func() { _ = file.Close() }()

	w.Header().Set("Content-Type", xlsxContentType)
	w.Header().Set("Content-Disposition", contentDisposition(report.Filename))
	if err := file.Write(w); err != nil {
		// Headers are already sent; nothing sensible left to do but log-free
		// abort — the client sees a truncated download.
		return
	}
}

func (h RentalHandler) exportReport(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	file, report, ok := h.buildExport(w, eventID)
	if !ok {
		return
	}
	_ = file.Close()
	writeJSON(w, http.StatusOK, report)
}

// buildExport runs the export writer and maps its errors onto HTTP
// responses. Returns ok=false when a response has already been written.
func (h RentalHandler) buildExport(w http.ResponseWriter, eventID int64) (*excelize.File, domain.RentalExportReport, bool) {
	file, report, err := service.ExportService{DB: h.DB}.BuildRentalExport(eventID)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			writeError(w, http.StatusNotFound, "event not found")
		case errors.Is(err, service.ErrNoInventoryTemplate):
			writeError(w, http.StatusBadRequest, err.Error())
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return nil, domain.RentalExportReport{}, false
	}
	return file, report, true
}

func (h RentalHandler) getSummary(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	summary, err := dbstore.GetRentalSummary(h.DB, eventID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if summary.Items == nil {
		summary.Items = []domain.EventRental{}
	}
	writeJSON(w, http.StatusOK, summary)
}

func (h RentalHandler) putManualLine(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	var payload domain.ManualRentalRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.QuantityAudio < 0 || payload.QuantityLighting < 0 {
		writeError(w, http.StatusBadRequest, "quantities must not be negative")
		return
	}
	if !h.requireEventAndItem(w, eventID, itemID) {
		return
	}
	if err := dbstore.UpsertManualRental(h.DB, eventID, itemID, payload); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	line, err := dbstore.GetRentalLine(h.DB, eventID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, line)
}

func (h RentalHandler) deleteManualLine(w http.ResponseWriter, r *http.Request) {
	eventID, ok := parseID(w, chi.URLParam(r, "eventID"))
	if !ok {
		return
	}
	itemID, ok := parseID(w, chi.URLParam(r, "itemID"))
	if !ok {
		return
	}
	if err := dbstore.DeleteManualRental(h.DB, eventID, itemID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h RentalHandler) requireEventAndItem(w http.ResponseWriter, eventID, itemID int64) bool {
	event, err := dbstore.GetEvent(h.DB, eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "event not found")
			return false
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	belongs, err := dbstore.ItemBelongsToInventory(h.DB, itemID, event.InventoryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if !belongs {
		writeError(w, http.StatusNotFound, "inventory item not found")
		return false
	}
	return true
}
