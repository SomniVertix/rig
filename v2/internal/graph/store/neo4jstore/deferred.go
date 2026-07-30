package neo4jstore

import (
	"context"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// StartSession is intentionally unimplemented in this scaffold's first
// pass. Session bookkeeping is satellite/audit data the v1 discovery schema
// stored alongside the graph, not graph-shaped itself — deferred until it's
// needed for something beyond the sessionId string callers already thread
// through claimedBy/reachedIn by hand. (Waypoint assets and expedition
// terms, formerly deferred alongside it here, are implemented in assets.go
// and terms.go.)
func (s *Neo4jStore) StartSession(ctx context.Context, params store.StartSessionParams) (*domain.Session, error) {
	return nil, store.ErrNotImplemented
}
