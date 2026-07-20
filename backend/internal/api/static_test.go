package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func testStaticFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte("<html>index</html>")},
		"assets/app.js": &fstest.MapFile{Data: []byte("console.log('app')")},
	}
}

func TestStaticHandlerServesRealAsset(t *testing.T) {
	handler := NewStaticHandler(testStaticFS())

	req := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Body.String(); got != "console.log('app')" {
		t.Fatalf("expected asset content, got %q", got)
	}
}

func TestStaticHandlerFallsBackToIndexForUnknownPath(t *testing.T) {
	handler := NewStaticHandler(testStaticFS())

	req := httptest.NewRequest(http.MethodGet, "/events/12", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Body.String(); got != "<html>index</html>" {
		t.Fatalf("expected index.html content, got %q", got)
	}
}

func TestStaticHandlerServesIndexAtRoot(t *testing.T) {
	handler := NewStaticHandler(testStaticFS())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Body.String(); got != "<html>index</html>" {
		t.Fatalf("expected index.html content, got %q", got)
	}
}
