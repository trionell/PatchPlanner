package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// NewStaticHandler serves the built frontend from fsys, falling back to
// index.html for any path that isn't a real file so client-side routes
// (e.g. a deep link refreshed in the browser) resolve correctly.
func NewStaticHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if requestPath == "" || requestPath == "." {
			requestPath = "index.html"
		}

		if f, err := fsys.Open(requestPath); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		r2 := new(http.Request)
		*r2 = *r
		u := *r.URL
		u.Path = "/"
		r2.URL = &u
		fileServer.ServeHTTP(w, r2)
	})
}
