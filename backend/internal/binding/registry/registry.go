// Package registry resolves a client's working directory to a rig
// workspaceId by matching it against the folders declared in scanned
// *.code-workspace files. Ported from v1's
// packages/resolver/src/discover.ts findWorkspacesClaiming/workspaceClaims,
// minus the ancestor-walk-up fallback (irrelevant server-side) and the
// .code-workspace.local override (this is a server-side resolve endpoint,
// not a per-developer client process).
package registry

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/somnivertix/rig/internal/binding/scanner"
)

// ErrNoMatch means no scanned workspace's folders claim the given directory.
var ErrNoMatch = errors.New("registry: no workspace claims this directory")

// AmbiguousError means more than one distinct workspaceId claims the given
// directory. Which workspace a directory binds to is security-relevant (it
// determines which workspace's data an MCP session can read/write), so this
// is a hard error rather than a silently-picked winner, matching v1.
type AmbiguousError struct {
	Dir        string
	WorkspaceIDs []string
}

func (e *AmbiguousError) Error() string {
	return fmt.Sprintf("registry: %q is claimed by multiple workspaces: %s", e.Dir, strings.Join(e.WorkspaceIDs, ", "))
}

// Registry is an in-memory, immutable snapshot of one scan pass. Rebuild it
// (via New) to pick up filesystem changes — there is no incremental update.
type Registry struct {
	workspaces []scanner.Workspace
}

func New(workspaces []scanner.Workspace) *Registry {
	return &Registry{workspaces: workspaces}
}

// Resolve returns the workspaceId of the workspace claiming dir: the unique
// workspace whose folders list contains dir itself or an ancestor of it.
// dir need not exist on this machine's filesystem — it is compared purely
// as a path string against each workspace's already-resolved folder paths.
func (r *Registry) Resolve(dir string) (string, error) {
	target := filepath.Clean(dir)

	matched := map[string]bool{}
	for _, ws := range r.workspaces {
		if claims(ws.Folders, target) {
			matched[ws.WorkspaceID] = true
		}
	}

	switch len(matched) {
	case 0:
		return "", ErrNoMatch
	case 1:
		for workspaceID := range matched {
			return workspaceID, nil
		}
	}

	ids := make([]string, 0, len(matched))
	for workspaceID := range matched {
		ids = append(ids, workspaceID)
	}
	sort.Strings(ids)
	return "", &AmbiguousError{Dir: target, WorkspaceIDs: ids}
}

// WorkspaceSummary is a workspace-derived workspace identity safe to expose to
// remote clients (e.g. the browser) that have no cwd of their own to
// resolve — folder paths are deliberately omitted.
type WorkspaceSummary struct {
	WorkspaceID string `json:"workspaceId"`
	Label     string `json:"label"`
}

// List returns every distinct workspaceId known to this registry, sorted by
// workspaceId. Label is derived from the claiming workspace file's own
// basename (folder paths are intentionally not exposed).
func (r *Registry) List() []WorkspaceSummary {
	labels := map[string]string{}
	for _, ws := range r.workspaces {
		if _, ok := labels[ws.WorkspaceID]; ok {
			continue
		}
		labels[ws.WorkspaceID] = labelFromWorkspacePath(ws.Path)
	}

	ids := make([]string, 0, len(labels))
	for id := range labels {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	out := make([]WorkspaceSummary, len(ids))
	for i, id := range ids {
		out[i] = WorkspaceSummary{WorkspaceID: id, Label: labels[id]}
	}
	return out
}

func labelFromWorkspacePath(path string) string {
	return strings.TrimSuffix(filepath.Base(path), ".code-workspace")
}

// WorkspaceDetail is a fuller workspace-derived projection than
// WorkspaceSummary, including the workspace's root filesystem path. This is
// safe to expose to MCP clients (which already run with filesystem access to
// resolve a cwd) but must not be exposed to the path-free browser-facing
// WorkspaceSummary shape.
type WorkspaceDetail struct {
	ID       string `json:"id"`
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	RootPath string `json:"rootPath"`
}

// ListDetailed returns every distinct workspaceId known to this registry,
// sorted by workspaceId, alongside its root filesystem path. RootPath is the
// workspace's first declared folder when it has one, else the directory
// containing the workspace file itself.
func (r *Registry) ListDetailed() []WorkspaceDetail {
	details := map[string]WorkspaceDetail{}
	for _, ws := range r.workspaces {
		if _, ok := details[ws.WorkspaceID]; ok {
			continue
		}

		rootPath := filepath.Dir(ws.Path)
		if len(ws.Folders) > 0 {
			rootPath = ws.Folders[0]
		}

		details[ws.WorkspaceID] = WorkspaceDetail{
			ID:       ws.WorkspaceID,
			Slug:     ws.WorkspaceID,
			Name:     labelFromWorkspacePath(ws.Path),
			RootPath: rootPath,
		}
	}

	ids := make([]string, 0, len(details))
	for id := range details {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	out := make([]WorkspaceDetail, len(ids))
	for i, id := range ids {
		out[i] = details[id]
	}
	return out
}

func claims(folders []string, target string) bool {
	for _, folder := range folders {
		if target == folder || strings.HasPrefix(target, folder+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}
