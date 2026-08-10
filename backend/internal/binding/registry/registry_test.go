package registry

import (
	"testing"

	"github.com/somnivertix/rig/internal/binding/scanner"
)

func TestListDetailed(t *testing.T) {
	tests := []struct {
		name              string
		workspaces        []scanner.Workspace
		wantLength        int
		wantDetailByID    map[string]WorkspaceDetail
		wantSortedIDOrder []string
	}{
		{
			name: "single workspace with folder",
			workspaces: []scanner.Workspace{
				{
					Path:        "/home/user/my-project.code-workspace",
					WorkspaceID: "my-project",
					Folders:     []string{"/home/user/my-project"},
				},
			},
			wantLength:        1,
			wantSortedIDOrder: []string{"my-project"},
			wantDetailByID: map[string]WorkspaceDetail{
				"my-project": {
					ID:       "my-project",
					Slug:     "my-project",
					Name:     "my-project",
					RootPath: "/home/user/my-project",
				},
			},
		},
		{
			name: "single workspace without folders - RootPath fallback",
			workspaces: []scanner.Workspace{
				{
					Path:        "/home/user/empty.code-workspace",
					WorkspaceID: "empty-ws",
					Folders:     []string{},
				},
			},
			wantLength:        1,
			wantSortedIDOrder: []string{"empty-ws"},
			wantDetailByID: map[string]WorkspaceDetail{
				"empty-ws": {
					ID:       "empty-ws",
					Slug:     "empty-ws",
					Name:     "empty",
					RootPath: "/home/user", // fallback to workspace file's directory
				},
			},
		},
		{
			name: "workspace with multiple folders - first folder picked",
			workspaces: []scanner.Workspace{
				{
					Path:        "/workspace/multi.code-workspace",
					WorkspaceID: "multi-folder",
					Folders:     []string{"/path/to/first", "/path/to/second", "/path/to/third"},
				},
			},
			wantLength:        1,
			wantSortedIDOrder: []string{"multi-folder"},
			wantDetailByID: map[string]WorkspaceDetail{
				"multi-folder": {
					ID:       "multi-folder",
					Slug:     "multi-folder",
					Name:     "multi",
					RootPath: "/path/to/first", // first folder, not second
				},
			},
		},
		{
			name: "name derivation strips .code-workspace extension",
			workspaces: []scanner.Workspace{
				{
					Path:        "/config/my-special-workspace.code-workspace",
					WorkspaceID: "special",
					Folders:     []string{"/config"},
				},
			},
			wantLength:        1,
			wantSortedIDOrder: []string{"special"},
			wantDetailByID: map[string]WorkspaceDetail{
				"special": {
					ID:       "special",
					Slug:     "special",
					Name:     "my-special-workspace", // extension stripped
					RootPath: "/config",
				},
			},
		},
		{
			name: "multiple workspaces sorted by ID",
			workspaces: []scanner.Workspace{
				{
					Path:        "/root/zebra.code-workspace",
					WorkspaceID: "zebra",
					Folders:     []string{"/root/zebra"},
				},
				{
					Path:        "/root/alpha.code-workspace",
					WorkspaceID: "alpha",
					Folders:     []string{"/root/alpha"},
				},
				{
					Path:        "/root/bravo.code-workspace",
					WorkspaceID: "bravo",
					Folders:     []string{"/root/bravo"},
				},
			},
			wantLength:        3,
			wantSortedIDOrder: []string{"alpha", "bravo", "zebra"}, // lexicographic order
			wantDetailByID: map[string]WorkspaceDetail{
				"alpha": {
					ID:       "alpha",
					Slug:     "alpha",
					Name:     "alpha",
					RootPath: "/root/alpha",
				},
				"bravo": {
					ID:       "bravo",
					Slug:     "bravo",
					Name:     "bravo",
					RootPath: "/root/bravo",
				},
				"zebra": {
					ID:       "zebra",
					Slug:     "zebra",
					Name:     "zebra",
					RootPath: "/root/zebra",
				},
			},
		},
		{
			name: "duplicate workspaceId - first occurrence wins (dedup)",
			workspaces: []scanner.Workspace{
				{
					Path:        "/root/first.code-workspace",
					WorkspaceID: "duplicate-id",
					Folders:     []string{"/root/first"},
				},
				{
					Path:        "/root/second.code-workspace",
					WorkspaceID: "duplicate-id",
					Folders:     []string{"/root/second"},
				},
				{
					Path:        "/root/third.code-workspace",
					WorkspaceID: "other-id",
					Folders:     []string{"/root/third"},
				},
			},
			wantLength:        2,
			wantSortedIDOrder: []string{"duplicate-id", "other-id"},
			wantDetailByID: map[string]WorkspaceDetail{
				"duplicate-id": {
					ID:       "duplicate-id",
					Slug:     "duplicate-id",
					Name:     "first", // first occurrence, not second
					RootPath: "/root/first",
				},
				"other-id": {
					ID:       "other-id",
					Slug:     "other-id",
					Name:     "third",
					RootPath: "/root/third",
				},
			},
		},
		{
			name:       "empty registry",
			workspaces: []scanner.Workspace{},
			wantLength: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := New(tt.workspaces)
			got := r.ListDetailed()

			if len(got) != tt.wantLength {
				t.Fatalf("len(got) = %d, want %d", len(got), tt.wantLength)
			}

			// Verify sorted order
			if tt.wantLength > 0 && len(tt.wantSortedIDOrder) > 0 {
				for i, id := range tt.wantSortedIDOrder {
					if got[i].ID != id {
						t.Errorf("got[%d].ID = %q, want %q", i, got[i].ID, id)
					}
				}
			}

			// Verify each workspace's details
			for id, wantDetail := range tt.wantDetailByID {
				var gotDetail *WorkspaceDetail
				for _, detail := range got {
					if detail.ID == id {
						gotDetail = &detail
						break
					}
				}

				if gotDetail == nil {
					t.Fatalf("workspace %q not found in results", id)
				}

				if gotDetail.ID != wantDetail.ID {
					t.Errorf("workspace %q: ID = %q, want %q", id, gotDetail.ID, wantDetail.ID)
				}
				if gotDetail.Slug != wantDetail.Slug {
					t.Errorf("workspace %q: Slug = %q, want %q", id, gotDetail.Slug, wantDetail.Slug)
				}
				if gotDetail.Name != wantDetail.Name {
					t.Errorf("workspace %q: Name = %q, want %q", id, gotDetail.Name, wantDetail.Name)
				}
				if gotDetail.RootPath != wantDetail.RootPath {
					t.Errorf("workspace %q: RootPath = %q, want %q", id, gotDetail.RootPath, wantDetail.RootPath)
				}
			}
		})
	}
}

// TestListDetailedSortingIsMandatory verifies that unsorted results would fail.
// This test documents that sorting behavior is essential and not optional.
func TestListDetailedSortingIsMandatory(t *testing.T) {
	workspaces := []scanner.Workspace{
		{
			Path:        "/root/z.code-workspace",
			WorkspaceID: "z-ws",
			Folders:     []string{"/z"},
		},
		{
			Path:        "/root/a.code-workspace",
			WorkspaceID: "a-ws",
			Folders:     []string{"/a"},
		},
		{
			Path:        "/root/m.code-workspace",
			WorkspaceID: "m-ws",
			Folders:     []string{"/m"},
		},
	}

	r := New(workspaces)
	got := r.ListDetailed()

	// Verify strict lexicographic sort order
	expectedOrder := []string{"a-ws", "m-ws", "z-ws"}
	for i, expectedID := range expectedOrder {
		if got[i].ID != expectedID {
			t.Errorf("position %d: got ID %q, want %q (sorting broken)", i, got[i].ID, expectedID)
		}
	}
}

// TestListDetailedRootPathFallback verifies that workspace file directory
// is used as RootPath when Folders is empty.
func TestListDetailedRootPathFallback(t *testing.T) {
	tests := []struct {
		name          string
		workspacePath string
		folders       []string
		expectedRoot  string
	}{
		{
			name:          "empty folders array uses file directory",
			workspacePath: "/workspace/config/empty.code-workspace",
			folders:       []string{},
			expectedRoot:  "/workspace/config",
		},
		{
			name:          "nil folders uses file directory",
			workspacePath: "/workspace/another.code-workspace",
			folders:       nil,
			expectedRoot:  "/workspace",
		},
		{
			name:          "single folder uses that folder",
			workspacePath: "/workspace/config/single.code-workspace",
			folders:       []string{"/some/path"},
			expectedRoot:  "/some/path",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := New([]scanner.Workspace{
				{
					Path:        tt.workspacePath,
					WorkspaceID: "test-ws",
					Folders:     tt.folders,
				},
			})
			got := r.ListDetailed()

			if len(got) != 1 {
				t.Fatalf("expected 1 workspace, got %d", len(got))
			}

			if got[0].RootPath != tt.expectedRoot {
				t.Errorf("RootPath = %q, want %q", got[0].RootPath, tt.expectedRoot)
			}
		})
	}
}
