package rigclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Client talks to a single running `rig` service (cmd/rig), the same one
// the webui's fetch client in web/src/api/client.ts talks to.
type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// APIError mirrors web/src/api/client.ts's ApiError: status code plus the
// server's {"error": "..."} body, when present.
type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("rig api: %d %s", e.Status, e.Message)
}

type errorBody struct {
	Error string `json:"error"`
}

func (c *Client) do(ctx context.Context, method, path string, query url.Values, body any, out any) error {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("rig api: encoding request body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
	if err != nil {
		return fmt.Errorf("rig api: building request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("rig api: %w (is `rig` running at %s?)", err, c.baseURL)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("rig api: reading response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		var eb errorBody
		_ = json.Unmarshal(respBody, &eb)
		msg := eb.Error
		if msg == "" {
			msg = resp.Status
		}
		return &APIError{Status: resp.StatusCode, Message: msg}
	}

	if out == nil || len(respBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("rig api: decoding response: %w", err)
	}
	return nil
}

// ── Workspaces ───────────────────────────────────────────────────────────

func (c *Client) ListWorkspaces(ctx context.Context) ([]Workspace, error) {
	var out struct {
		Workspaces []Workspace `json:"workspaces"`
	}
	err := c.do(ctx, http.MethodGet, "/workspaces", nil, nil, &out)
	return out.Workspaces, err
}

func (c *Client) ResolveWorkspace(ctx context.Context, cwd string) (string, error) {
	var out struct {
		WorkspaceID string `json:"workspaceId"`
	}
	err := c.do(ctx, http.MethodPost, "/resolve", nil, map[string]string{"cwd": cwd}, &out)
	return out.WorkspaceID, err
}

// ── Expeditions / waypoints ────────────────────────────────────────────────

func (c *Client) ListExpeditions(ctx context.Context, workspaceID string, status ExpeditionStatus) ([]Expedition, error) {
	q := url.Values{"workspaceId": {workspaceID}}
	if status != "" {
		q.Set("status", string(status))
	}
	var out []Expedition
	err := c.do(ctx, http.MethodGet, "/expeditions", q, nil, &out)
	return out, err
}

func (c *Client) GetExpedition(ctx context.Context, id string) (*Expedition, error) {
	var out Expedition
	err := c.do(ctx, http.MethodGet, "/expeditions/"+url.PathEscape(id), nil, nil, &out)
	return &out, err
}

func (c *Client) ListWaypoints(ctx context.Context, expeditionID string) ([]Waypoint, error) {
	var out []Waypoint
	err := c.do(ctx, http.MethodGet, "/expeditions/"+url.PathEscape(expeditionID)+"/waypoints", nil, nil, &out)
	return out, err
}

func (c *Client) ListWaypointDependencies(ctx context.Context, expeditionID string) ([]WaypointDependencyEdge, error) {
	var out []WaypointDependencyEdge
	err := c.do(ctx, http.MethodGet, "/expeditions/"+url.PathEscape(expeditionID)+"/waypoint-dependencies", nil, nil, &out)
	return out, err
}

func (c *Client) ClaimWaypoint(ctx context.Context, id, claimedBy string) (*Waypoint, error) {
	var out Waypoint
	err := c.do(ctx, http.MethodPost, "/waypoints/"+url.PathEscape(id)+"/claim", nil, map[string]string{"claimedBy": claimedBy}, &out)
	return &out, err
}

func (c *Client) ReleaseWaypoint(ctx context.Context, id string) (*Waypoint, error) {
	var out Waypoint
	err := c.do(ctx, http.MethodPost, "/waypoints/"+url.PathEscape(id)+"/release", nil, nil, &out)
	return &out, err
}

func (c *Client) ReachWaypoint(ctx context.Context, id string, req ReachWaypointRequest) (*Waypoint, error) {
	var out Waypoint
	err := c.do(ctx, http.MethodPost, "/waypoints/"+url.PathEscape(id)+"/reach", nil, req, &out)
	return &out, err
}

func (c *Client) BypassWaypoint(ctx context.Context, id, reason string) (*Waypoint, error) {
	var out Waypoint
	err := c.do(ctx, http.MethodPost, "/waypoints/"+url.PathEscape(id)+"/bypass", nil, map[string]string{"reason": reason}, &out)
	return &out, err
}

func (c *Client) UnbypassWaypoint(ctx context.Context, id, reason string) (*Waypoint, error) {
	var out Waypoint
	err := c.do(ctx, http.MethodPost, "/waypoints/"+url.PathEscape(id)+"/unbypass", nil, map[string]string{"reason": reason}, &out)
	return &out, err
}

// ── Specs ────────────────────────────────────────────────────────────────

func (c *Client) ListSpecs(ctx context.Context, workspaceID string) ([]Spec, error) {
	q := url.Values{"workspaceId": {workspaceID}}
	var out []Spec
	err := c.do(ctx, http.MethodGet, "/specs", q, nil, &out)
	return out, err
}

func (c *Client) GetSpec(ctx context.Context, id string) (*Spec, error) {
	var out Spec
	err := c.do(ctx, http.MethodGet, "/specs/"+url.PathEscape(id), nil, nil, &out)
	return &out, err
}

func (c *Client) GetNextStage(ctx context.Context, id string) (*NextStageInfo, error) {
	var out NextStageInfo
	err := c.do(ctx, http.MethodGet, "/specs/"+url.PathEscape(id)+"/next-stage", nil, nil, &out)
	return &out, err
}

func (c *Client) ListTasksDocs(ctx context.Context, id string) ([]TasksDoc, error) {
	var out struct {
		TasksDocs []TasksDoc `json:"tasksDocs"`
	}
	err := c.do(ctx, http.MethodGet, "/specs/"+url.PathEscape(id)+"/tasks-docs", nil, nil, &out)
	return out.TasksDocs, err
}

func (c *Client) RenderSpecDocument(ctx context.Context, id string, stage SpecStageName, component string) (string, error) {
	q := url.Values{"stage": {string(stage)}}
	if component != "" {
		q.Set("component", component)
	}
	var out RenderDocumentResponse
	err := c.do(ctx, http.MethodGet, "/specs/"+url.PathEscape(id)+"/render", q, nil, &out)
	return out.Markdown, err
}

func (c *Client) FinalizeStage(ctx context.Context, id string, req StageActionRequest) (*StageActionResponse, error) {
	var out StageActionResponse
	err := c.do(ctx, http.MethodPost, "/specs/"+url.PathEscape(id)+"/finalize", nil, req, &out)
	return &out, err
}

func (c *Client) ApproveStage(ctx context.Context, id string, req StageActionRequest) (*StageActionResponse, error) {
	var out StageActionResponse
	err := c.do(ctx, http.MethodPost, "/specs/"+url.PathEscape(id)+"/approve", nil, req, &out)
	return &out, err
}

func (c *Client) DenyStage(ctx context.Context, id string, req StageActionRequest) (*StageActionResponse, error) {
	var out StageActionResponse
	err := c.do(ctx, http.MethodPost, "/specs/"+url.PathEscape(id)+"/deny", nil, req, &out)
	return &out, err
}

// ── Handoffs (read-only) ─────────────────────────────────────────────────

func (c *Client) ListHandoffs(ctx context.Context, workspaceID string, direction HandoffDirection, status string) ([]Handoff, error) {
	q := url.Values{"workspaceId": {workspaceID}, "direction": {string(direction)}}
	if status != "" {
		q.Set("status", status)
	}
	var out struct {
		Handoffs []Handoff `json:"handoffs"`
	}
	err := c.do(ctx, http.MethodGet, "/handoffs", q, nil, &out)
	return out.Handoffs, err
}

func (c *Client) GetHandoff(ctx context.Context, id string) (*Handoff, error) {
	var out Handoff
	err := c.do(ctx, http.MethodGet, "/handoffs/"+url.PathEscape(id), nil, nil, &out)
	return &out, err
}

func (c *Client) GetHandoffConversation(ctx context.Context, id string) (*HandoffConversation, []HandoffTurn, error) {
	var out struct {
		Conversation HandoffConversation `json:"conversation"`
		Turns        []HandoffTurn       `json:"turns"`
	}
	err := c.do(ctx, http.MethodGet, "/handoffs/"+url.PathEscape(id)+"/conversation", nil, nil, &out)
	return &out.Conversation, out.Turns, err
}
