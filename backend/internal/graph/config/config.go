// Package config loads the graph service's Neo4j connection settings from
// the environment, matching v1's env-var-driven config (docker-compose.yml).
// The listen address is cmd/rig's concern, not this package's — graph no
// longer runs as its own standalone process.
package config

import (
	"fmt"
	"os"
)

type Config struct {
	// Neo4jURI, Neo4jUsername, Neo4jPassword, Neo4jDatabase configure the
	// Neo4j driver connection.
	Neo4jURI      string
	Neo4jUsername string
	Neo4jPassword string
	Neo4jDatabase string
}

// Load reads configuration from environment variables. Defaults match the
// bundled docker-compose Neo4j container's topology (see docker-compose.yml)
// for a bare `go run ./cmd/rig` against it — never a specific external
// instance, so a missing env var fails toward "wrong local target" at worst,
// not a silent connection to someone else's database.
func Load() (Config, error) {
	cfg := Config{
		Neo4jURI:      getEnv("GRAPH_NEO4J_URI", "neo4j://localhost:7687"),
		Neo4jUsername: getEnv("GRAPH_NEO4J_USERNAME", "neo4j"),
		Neo4jDatabase: getEnv("GRAPH_NEO4J_DATABASE", "neo4j"),
	}

	cfg.Neo4jPassword = os.Getenv("GRAPH_NEO4J_PASSWORD")
	if cfg.Neo4jPassword == "" {
		return Config{}, fmt.Errorf("config: GRAPH_NEO4J_PASSWORD is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
