package mcpserver

import (
	"testing"

	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// fakeStore satisfies store.Store purely by embedding the interface (every
// method panics if actually called via the nil embedded value). This test
// only needs NewHandler to construct without panicking — mcp.AddTool infers
// each tool's JSON schema eagerly at registration time, so a struct shape
// jsonschema-go can't handle (e.g. bad embedding) would panic right here,
// before any real Neo4j connection is ever needed.
type fakeStore struct {
	store.Store
}

func TestNewHandlerRegistersAllToolsWithoutPanicking(t *testing.T) {
	svc := service.New(fakeStore{})
	h := NewHandler(svc)
	if h == nil {
		t.Fatal("NewHandler returned nil")
	}
}
