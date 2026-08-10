package mcpserver

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/somnivertix/rig/internal/binding/registry"
	"github.com/somnivertix/rig/internal/binding/scanner"
)

func TestNewHandlerRegistersAllToolsWithoutPanicking(t *testing.T) {
	reg := registry.New([]scanner.Workspace{
		{
			Path:        "/home/user/test.code-workspace",
			WorkspaceID: "test-ws",
			Folders:     []string{"/home/user/test"},
		},
	})

	h := NewHandler(reg)
	if h == nil {
		t.Fatal("NewHandler returned nil")
	}
}

func TestListWorkspacesHandlerIsCallable(t *testing.T) {
	workspaces := []scanner.Workspace{
		{
			Path:        "/home/user/project1.code-workspace",
			WorkspaceID: "project1",
			Folders:     []string{"/home/user/project1"},
		},
		{
			Path:        "/home/user/project2.code-workspace",
			WorkspaceID: "project2",
			Folders:     []string{"/home/user/project2"},
		},
	}

	reg := registry.New(workspaces)
	handler := listWorkspaces(reg)

	if handler == nil {
		t.Fatal("listWorkspaces returned nil handler")
	}

	// Call the handler
	result, output, err := handler(context.Background(), &mcp.CallToolRequest{}, struct{}{})

	if err != nil {
		t.Errorf("handler returned error: %v", err)
	}

	if result != nil {
		t.Errorf("handler should return nil CallToolResult for success case, got %v", result)
	}

	// Verify output is the correct type
	if len(output.Workspaces) == 0 && len(workspaces) > 0 {
		t.Errorf("handler returned empty output for non-empty registry")
	}
}

func TestListWorkspacesReturnsCorrectOutputShape(t *testing.T) {
	workspaces := []scanner.Workspace{
		{
			Path:        "/home/user/project1.code-workspace",
			WorkspaceID: "project1",
			Folders:     []string{"/home/user/project1"},
		},
	}

	reg := registry.New(workspaces)
	handler := listWorkspaces(reg)

	_, output, err := handler(context.Background(), &mcp.CallToolRequest{}, struct{}{})

	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	// Verify the output has the expected structure
	if len(output.Workspaces) != 1 {
		t.Fatalf("expected 1 workspace in output, got %d", len(output.Workspaces))
	}

	workspace := output.Workspaces[0]
	if workspace.ID != "project1" {
		t.Errorf("workspace ID = %q, want %q", workspace.ID, "project1")
	}
	if workspace.Slug != "project1" {
		t.Errorf("workspace Slug = %q, want %q", workspace.Slug, "project1")
	}
	if workspace.Name != "project1" {
		t.Errorf("workspace Name = %q, want %q", workspace.Name, "project1")
	}
	if workspace.RootPath != "/home/user/project1" {
		t.Errorf("workspace RootPath = %q, want %q", workspace.RootPath, "/home/user/project1")
	}
}

func TestListWorkspacesMatchesRegistryListDetailed(t *testing.T) {
	workspaces := []scanner.Workspace{
		{
			Path:        "/config/zebra.code-workspace",
			WorkspaceID: "zebra-ws",
			Folders:     []string{"/root/zebra"},
		},
		{
			Path:        "/config/alpha.code-workspace",
			WorkspaceID: "alpha-ws",
			Folders:     []string{"/root/alpha"},
		},
		{
			Path:        "/config/bravo.code-workspace",
			WorkspaceID: "bravo-ws",
			Folders:     []string{"/root/bravo"},
		},
	}

	reg := registry.New(workspaces)
	handler := listWorkspaces(reg)

	_, output, err := handler(context.Background(), &mcp.CallToolRequest{}, struct{}{})

	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	// Get expected data from registry
	expected := reg.ListDetailed()

	if len(output.Workspaces) != len(expected) {
		t.Fatalf("handler returned %d workspaces, expected %d", len(output.Workspaces), len(expected))
	}

	// Verify each workspace matches
	for i, workspace := range output.Workspaces {
		if workspace.ID != expected[i].ID {
			t.Errorf("workspace[%d].ID = %q, want %q", i, workspace.ID, expected[i].ID)
		}
		if workspace.Slug != expected[i].Slug {
			t.Errorf("workspace[%d].Slug = %q, want %q", i, workspace.Slug, expected[i].Slug)
		}
		if workspace.Name != expected[i].Name {
			t.Errorf("workspace[%d].Name = %q, want %q", i, workspace.Name, expected[i].Name)
		}
		if workspace.RootPath != expected[i].RootPath {
			t.Errorf("workspace[%d].RootPath = %q, want %q", i, workspace.RootPath, expected[i].RootPath)
		}
	}
}

func TestListWorkspacesHandlesEmptyRegistry(t *testing.T) {
	reg := registry.New([]scanner.Workspace{})
	handler := listWorkspaces(reg)

	_, output, err := handler(context.Background(), &mcp.CallToolRequest{}, struct{}{})

	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	if output.Workspaces == nil {
		t.Error("workspaces should be an empty slice, not nil")
	}

	if len(output.Workspaces) != 0 {
		t.Errorf("expected 0 workspaces, got %d", len(output.Workspaces))
	}
}

func TestListWorkspacesPreservesSortOrder(t *testing.T) {
	workspaces := []scanner.Workspace{
		{
			Path:        "/config/zebra.code-workspace",
			WorkspaceID: "zebra",
			Folders:     []string{"/z"},
		},
		{
			Path:        "/config/alpha.code-workspace",
			WorkspaceID: "alpha",
			Folders:     []string{"/a"},
		},
		{
			Path:        "/config/bravo.code-workspace",
			WorkspaceID: "bravo",
			Folders:     []string{"/b"},
		},
	}

	reg := registry.New(workspaces)
	handler := listWorkspaces(reg)

	_, output, err := handler(context.Background(), &mcp.CallToolRequest{}, struct{}{})

	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	expectedOrder := []string{"alpha", "bravo", "zebra"}
	if len(output.Workspaces) != len(expectedOrder) {
		t.Fatalf("expected %d workspaces, got %d", len(expectedOrder), len(output.Workspaces))
	}

	for i, expectedID := range expectedOrder {
		if output.Workspaces[i].ID != expectedID {
			t.Errorf("position %d: got ID %q, want %q (sorting broken)", i, output.Workspaces[i].ID, expectedID)
		}
	}
}
