// Package scanner recursively discovers VS Code *.code-workspace files under
// a root directory and extracts each one's rig.workspaceId and folders list.
// Ported from v1's packages/server/src/workspace/workspace-scanner.ts, minus
// the Postgres workspace provisioning and the missing-workspaceId write-back:
// this scaffold reports files with no rig.workspaceId instead of mutating them.
package scanner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/tailscale/hujson"
)

const workspaceFileSuffix = ".code-workspace"

// skippedDirNames are directory names never descended into while walking the
// scan root, matching v1's SKIPPED_DIR_NAMES.
var skippedDirNames = map[string]bool{
	"node_modules": true,
	".git":         true,
	".local":       true,
}

var kebabSlugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Workspace is one successfully-parsed *.code-workspace file with a valid
// rig.workspaceId.
type Workspace struct {
	Path      string
	WorkspaceID string
	// Folders holds each entry of the file's "folders" array, resolved to an
	// absolute, cleaned path (relative entries resolve against the
	// workspace file's own directory, matching VS Code's own semantics).
	Folders []string
}

// Result is the outcome of one scan pass.
type Result struct {
	Scanned int
	// Workspaces holds every file with a valid (kebab-case) rig.workspaceId.
	Workspaces []Workspace
	// MissingWorkspaceID holds files with no rig.workspaceId at all.
	MissingWorkspaceID []string
	// InvalidWorkspaceID holds files whose rig.workspaceId is present but not
	// kebab-case.
	InvalidWorkspaceID []string
	// Malformed holds files that could not be read or did not parse as a
	// JSON/JWCC object.
	Malformed []string
}

type workspaceFile struct {
	Folders []struct {
		Path string `json:"path"`
	} `json:"folders"`
	Rig *struct {
		WorkspaceID *string `json:"workspaceId"`
	} `json:"rig"`
}

// Scan walks root recursively for *.code-workspace files and classifies
// each one. root itself must exist and be readable; a failure descending
// into a subdirectory is tolerated (skipped, not fatal to the pass).
func Scan(root string) (Result, error) {
	if _, err := os.Stat(root); err != nil {
		return Result{}, fmt.Errorf("scanner: workspace root %q: %w", root, err)
	}

	paths := findWorkspaceFiles(root)
	result := Result{Scanned: len(paths)}
	for _, path := range paths {
		classifyFile(path, &result)
	}
	return result, nil
}

func findWorkspaceFiles(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var paths []string
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			if skippedDirNames[name] {
				continue
			}
			paths = append(paths, findWorkspaceFiles(filepath.Join(dir, name))...)
			continue
		}
		if strings.HasSuffix(name, workspaceFileSuffix) {
			paths = append(paths, filepath.Join(dir, name))
		}
	}
	return paths
}

func classifyFile(path string, result *Result) {
	raw, err := os.ReadFile(path)
	if err != nil {
		result.Malformed = append(result.Malformed, path)
		return
	}

	std, err := hujson.Standardize(raw)
	if err != nil {
		result.Malformed = append(result.Malformed, path)
		return
	}

	var parsed workspaceFile
	if err := json.Unmarshal(std, &parsed); err != nil {
		result.Malformed = append(result.Malformed, path)
		return
	}

	if parsed.Rig == nil || parsed.Rig.WorkspaceID == nil {
		result.MissingWorkspaceID = append(result.MissingWorkspaceID, path)
		return
	}
	workspaceID := *parsed.Rig.WorkspaceID
	if !kebabSlugPattern.MatchString(workspaceID) {
		result.InvalidWorkspaceID = append(result.InvalidWorkspaceID, path)
		return
	}

	dir := filepath.Dir(path)
	folders := make([]string, 0, len(parsed.Folders))
	for _, f := range parsed.Folders {
		if f.Path == "" {
			continue
		}
		folders = append(folders, resolveFolder(dir, f.Path))
	}

	result.Workspaces = append(result.Workspaces, Workspace{
		Path:      path,
		WorkspaceID: workspaceID,
		Folders:   folders,
	})
}

func resolveFolder(workspaceDir, rawPath string) string {
	if filepath.IsAbs(rawPath) {
		return filepath.Clean(rawPath)
	}
	return filepath.Clean(filepath.Join(workspaceDir, rawPath))
}
