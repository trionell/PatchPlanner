package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type errorResponse struct {
	Error string `json:"error"`
}

// Content types for the file downloads this API serves.
const (
	xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	pdfContentType  = "application/pdf"
)

// contentDisposition builds an attachment header carrying filename twice:
// a sanitized ASCII form for old clients, and an RFC 5987 UTF-8 form for
// everything else. Event names routinely contain å/ä/ö, which the plain
// filename parameter cannot represent.
func contentDisposition(filename string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' {
			return '_'
		}
		return r
	}, filename)
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, url.PathEscape(filename))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}
