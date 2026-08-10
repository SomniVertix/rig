// Package config loads the binding service's WORKSPACE_ROOT setting from
// the environment. The listen address is cmd/rig's concern, not this
// package's — workspace no longer runs as its own standalone process.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	// WorkspaceRoot is recursively scanned for *.code-workspace files.
	WorkspaceRoot string
}

func Load() (Config, error) {
	root := os.Getenv("WORKSPACE_ROOT")
	if root == "" {
		return Config{}, fmt.Errorf("config: WORKSPACE_ROOT is required")
	}
	return Config{WorkspaceRoot: root}, nil
}
