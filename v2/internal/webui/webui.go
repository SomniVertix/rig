// Package webui serves the built Rig Console SPA (v2/web/dist), embedded
// into the rig binary at build time. Keeps the "one process, one port"
// design (see repo README "Why merged") — the UI, REST, and MCP surfaces
// all come from the same server.
//
// dist/ is populated two ways:
//   - Docker: the multi-stage build in Dockerfile builds v2/web with pnpm
//     and copies its dist/ output here before `go build` runs.
//   - Local: dist/ ships with a placeholder index.html so `go build`/`go vet`
//     succeed on a fresh checkout; run `pnpm --dir web build && cp -r
//     web/dist/* internal/webui/dist/` to embed the real UI for `go run`.
package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
)

//go:embed all:dist
var distFS embed.FS

// Handler serves static assets from the embedded SPA build, falling back to
// index.html for any path with no matching file — the standard SPA pattern,
// letting react-router own client-side routes like /wayfinder/trails.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("webui: embedded dist/ missing: " + err.Error())
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(r.URL.Path)
		if clean != "/" {
			if f, err := sub.Open(clean[1:]); err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		indexReq := r.Clone(r.Context())
		indexReq.URL.Path = "/"
		fileServer.ServeHTTP(w, indexReq)
	})
}
