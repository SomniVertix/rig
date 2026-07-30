// Command rig runs the unified rig service: the graph domain (Neo4j-backed
// expeditions/waypoints, scoped by workspaceId) and the binding domain (cwd
// -> workspaceId resolution via scanned *.code-workspace files) merged into
// one process, one port. It serves both REST surfaces and a single MCP
// server named "rig" — exposing the mcp__rig__* tool catalog from both
// domains together at /mcp — instead of the two separate rig-graph/
// rig-workspace MCP servers graph and workspace used to run standalone.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	graphapi "github.com/somnivertix/rig/internal/graph/api"
	graphconfig "github.com/somnivertix/rig/internal/graph/config"
	graphmcp "github.com/somnivertix/rig/internal/graph/mcpserver"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store/neo4jstore"

	bindingapi "github.com/somnivertix/rig/internal/binding/api"
	bindingconfig "github.com/somnivertix/rig/internal/binding/config"
	bindingmcp "github.com/somnivertix/rig/internal/binding/mcpserver"
	"github.com/somnivertix/rig/internal/binding/registry"
	"github.com/somnivertix/rig/internal/binding/scanner"

	"github.com/somnivertix/rig/internal/webui"
)

const shutdownTimeout = 10 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("rig service exited", "error", err)
		os.Exit(1)
	}
}

func run() error {
	graphCfg, err := graphconfig.Load()
	if err != nil {
		return err
	}
	bindingCfg, err := bindingconfig.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := neo4jstore.Connect(ctx, graphCfg.Neo4jURI, graphCfg.Neo4jUsername, graphCfg.Neo4jPassword, graphCfg.Neo4jDatabase)
	if err != nil {
		return err
	}
	defer st.Close(context.Background())

	if err := st.EnsureSchema(ctx); err != nil {
		return err
	}

	svc := service.New(st)

	scanResult, err := scanner.Scan(bindingCfg.WorkspaceRoot)
	if err != nil {
		return err
	}
	logScanResult(bindingCfg.WorkspaceRoot, scanResult)

	reg := registry.New(scanResult.Workspaces)

	mcpServer := mcp.NewServer(&mcp.Implementation{Name: "rig", Version: "0.1.0"}, nil)
	graphmcp.RegisterTools(mcpServer, svc)
	bindingmcp.RegisterTools(mcpServer, reg)
	mcpHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return mcpServer
	}, nil)

	bindingRouter := bindingapi.NewRouter(bindingapi.NewHandlers(reg))

	mux := http.NewServeMux()
	mux.Handle("/resolve", bindingRouter)
	mux.Handle("/workspaces", bindingRouter)
	mux.Handle("/mcp", mcpHandler)
	mux.Handle("/", withFallback(graphapi.NewRouter(graphapi.NewHandlers(svc)), webui.Handler()))

	addr := getEnv("RIG_HTTP_ADDR", ":8789")
	server := &http.Server{Addr: addr, Handler: mux}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	slog.Info("rig service listening", "addr", addr, "workspaceRoot", bindingCfg.WorkspaceRoot)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func logScanResult(root string, result scanner.Result) {
	slog.Info("workspace scan complete",
		"root", root,
		"scanned", result.Scanned,
		"matched", len(result.Workspaces),
		"missingWorkspaceId", len(result.MissingWorkspaceID),
		"invalidWorkspaceId", len(result.InvalidWorkspaceID),
		"malformed", len(result.Malformed),
	)
	for _, path := range result.MissingWorkspaceID {
		slog.Warn("workspace file has no rig.workspaceId", "path", path)
	}
	for _, path := range result.InvalidWorkspaceID {
		slog.Warn("workspace file has an invalid rig.workspaceId (must be kebab-case)", "path", path)
	}
	for _, path := range result.Malformed {
		slog.Warn("workspace file could not be read or parsed", "path", path)
	}
}

// withFallback serves api for any request it has a registered pattern for,
// and fallback (the embedded console SPA) for everything else — api.Handler
// returns an empty pattern for unmatched requests, per net/http's ServeMux.
func withFallback(api *http.ServeMux, fallback http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := api.Handler(r); pattern == "" {
			fallback.ServeHTTP(w, r)
			return
		}
		api.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
