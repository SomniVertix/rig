package service

import (
	"context"
	"testing"
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// stubStore for handoffs tests: embeds store.Store (unimplemented methods panic
// if called), and tracks which store methods were invoked during tests.
type handoffStubStore struct {
	store.Store
	sendHandoffCalled          bool
	closeHandoffCalled         bool
	addHandoffAttachmentCalled bool
	markHandoffReadCalled      bool
	getHandoffCall             int // count of GetHandoff calls, 0-based
	handoffToReturn            *domain.Handoff
	attachmentToReturn         *domain.HandoffAttachment
	errToReturn                error
}

func (s *handoffStubStore) SendHandoff(ctx context.Context, params store.SendHandoffParams) (*domain.Handoff, error) {
	s.sendHandoffCalled = true
	if s.errToReturn != nil {
		return nil, s.errToReturn
	}
	return &domain.Handoff{
		ID:                params.SourceWorkspaceID + "-to-" + params.TargetWorkspaceID,
		SourceWorkspaceID: params.SourceWorkspaceID,
		TargetWorkspaceID: params.TargetWorkspaceID,
		Title:             params.Title,
		BodyMarkdown:      params.BodyMarkdown,
		Type:              params.Type,
		Status:            string(domain.HandoffStatusPending),
		SentBy:            params.SentBy,
		SentAt:            time.Now(),
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}, nil
}

func (s *handoffStubStore) GetHandoff(ctx context.Context, id string) (*domain.Handoff, error) {
	s.getHandoffCall++
	if s.errToReturn != nil {
		return nil, s.errToReturn
	}
	// Return the stub's configured handoff or a default pending one
	if s.handoffToReturn != nil {
		return s.handoffToReturn, nil
	}
	return &domain.Handoff{
		ID:        id,
		Status:    string(domain.HandoffStatusPending),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}, nil
}

func (s *handoffStubStore) MarkHandoffRead(ctx context.Context, handoffID string) error {
	s.markHandoffReadCalled = true
	if s.errToReturn != nil {
		return s.errToReturn
	}
	return nil
}

func (s *handoffStubStore) CloseHandoff(ctx context.Context, params store.CloseHandoffParams) error {
	s.closeHandoffCalled = true
	if s.errToReturn != nil {
		return s.errToReturn
	}
	return nil
}

func (s *handoffStubStore) AddHandoffAttachment(ctx context.Context, params store.AddHandoffAttachmentParams) (*domain.HandoffAttachment, error) {
	s.addHandoffAttachmentCalled = true
	if s.errToReturn != nil {
		return nil, s.errToReturn
	}
	if s.attachmentToReturn != nil {
		return s.attachmentToReturn, nil
	}
	return &domain.HandoffAttachment{
		ID:        "attach-" + params.HandoffID,
		HandoffID: params.HandoffID,
		RepoPath:  params.RepoPath,
		CommitSHA: params.CommitSHA,
		Note:      params.Note,
	}, nil
}

// TestSendHandoffValidation tests SendHandoff's validation guards.
func TestSendHandoffValidation(t *testing.T) {
	tests := []struct {
		name       string
		params     store.SendHandoffParams
		wantErr    bool
		wantErrMsg string
		wantCalled bool // expect SendHandoff to be called on store
	}{
		{
			name: "valid handoff",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "blank title",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty title",
			wantCalled: false,
		},
		{
			name: "whitespace-only title",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "   \t  ",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty title",
			wantCalled: false,
		},
		{
			name: "blank body",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty bodyMarkdown",
			wantCalled: false,
		},
		{
			name: "blank sentBy",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty sentBy",
			wantCalled: false,
		},
		{
			name: "whitespace-only sentBy",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "   \t  ",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty sentBy",
			wantCalled: false,
		},
		{
			name: "whitespace-only body",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "\n\t  ",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires a non-empty bodyMarkdown",
			wantCalled: false,
		},
		{
			name: "unknown type",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              "invalid-type",
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires type to be one of bug/question/fyi/dependency-change",
			wantCalled: false,
		},
		{
			name: "source == target workspace",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "same-ws",
				TargetWorkspaceID: "same-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "send_handoff requires sourceWorkspaceId and targetWorkspaceId to differ",
			wantCalled: false,
		},
		{
			name: "non-kebab-case source workspace",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "Source_WS",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "slug must be kebab-case",
			wantCalled: false,
		},
		{
			name: "non-kebab-case target workspace",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "Target.WS",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeBug),
				SentBy:            "test-user",
			},
			wantErr:    true,
			wantErrMsg: "slug must be kebab-case",
			wantCalled: false,
		},
		{
			name: "valid with all handoff types",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeQuestion),
				SentBy:            "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "valid with FYI type",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeFYI),
				SentBy:            "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "valid with dependency-change type",
			params: store.SendHandoffParams{
				SourceWorkspaceID: "source-ws",
				TargetWorkspaceID: "target-ws",
				Title:             "Test Handoff",
				BodyMarkdown:      "This is a test body",
				Type:              string(domain.HandoffTypeDependencyChange),
				SentBy:            "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := &handoffStubStore{}
			svc := New(stub)
			ctx := context.Background()

			result, err := svc.SendHandoff(ctx, tt.params)

			if tt.wantErr {
				if err == nil {
					t.Fatal("SendHandoff() expected error, got nil")
				}
				if tt.wantErrMsg != "" && !containsSubstring(err.Error(), tt.wantErrMsg) {
					t.Fatalf("SendHandoff() error = %q, want substring %q", err.Error(), tt.wantErrMsg)
				}
				if stub.sendHandoffCalled {
					t.Fatal("SendHandoff() store method should not have been called on validation error")
				}
			} else {
				if err != nil {
					t.Fatalf("SendHandoff() unexpected error: %v", err)
				}
				if result == nil {
					t.Fatal("SendHandoff() expected non-nil handoff, got nil")
				}
				if !stub.sendHandoffCalled {
					t.Fatal("SendHandoff() store method should have been called on success")
				}
			}
		})
	}
}

// TestSendHandoffWithAttachments tests SendHandoff's attachment validation.
func TestSendHandoffWithAttachments(t *testing.T) {
	baseParams := store.SendHandoffParams{
		SourceWorkspaceID: "source-ws",
		TargetWorkspaceID: "target-ws",
		Title:             "Test Handoff",
		BodyMarkdown:      "This is a test body",
		Type:              string(domain.HandoffTypeBug),
		SentBy:            "test-user",
	}

	tests := []struct {
		name        string
		attachments []store.HandoffAttachmentInput
		wantErr     bool
		wantErrMsg  string
		wantCalled  bool
	}{
		{
			name:        "valid without attachments",
			attachments: []store.HandoffAttachmentInput{},
			wantErr:     false,
			wantCalled:  true,
		},
		{
			name: "valid with one attachment",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "src/module/file.go",
					CommitSHA: "abc123def456",
					Note:      "Related change",
				},
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "valid with multiple attachments",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "src/module/file.go",
					CommitSHA: "abc123def456",
					Note:      "First change",
				},
				{
					RepoPath:  "tests/integration_test.go",
					CommitSHA: "def789ghi012",
					Note:      "Test coverage",
				},
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "blank repoPath in attachment",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "",
					CommitSHA: "abc123def456",
					Note:      "Missing repo path",
				},
			},
			wantErr:    true,
			wantErrMsg: "handoff attachment requires a non-empty repoPath",
			wantCalled: false,
		},
		{
			name: "whitespace repoPath in attachment",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "   \t  ",
					CommitSHA: "abc123def456",
					Note:      "Whitespace repo path",
				},
			},
			wantErr:    true,
			wantErrMsg: "handoff attachment requires a non-empty repoPath",
			wantCalled: false,
		},
		{
			name: "blank commitSha in attachment",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "src/module/file.go",
					CommitSHA: "",
					Note:      "Missing commit sha",
				},
			},
			wantErr:    true,
			wantErrMsg: "handoff attachment requires a non-empty commitSha",
			wantCalled: false,
		},
		{
			name: "whitespace commitSha in attachment",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "src/module/file.go",
					CommitSHA: "\n\t  ",
					Note:      "Whitespace commit sha",
				},
			},
			wantErr:    true,
			wantErrMsg: "handoff attachment requires a non-empty commitSha",
			wantCalled: false,
		},
		{
			name: "first attachment valid, second missing repoPath",
			attachments: []store.HandoffAttachmentInput{
				{
					RepoPath:  "src/module/file.go",
					CommitSHA: "abc123def456",
					Note:      "First change",
				},
				{
					RepoPath:  "",
					CommitSHA: "def789ghi012",
					Note:      "Bad second attachment",
				},
			},
			wantErr:    true,
			wantErrMsg: "handoff attachment requires a non-empty repoPath",
			wantCalled: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := baseParams
			params.Attachments = tt.attachments

			stub := &handoffStubStore{}
			svc := New(stub)
			ctx := context.Background()

			result, err := svc.SendHandoff(ctx, params)

			if tt.wantErr {
				if err == nil {
					t.Fatal("SendHandoff() expected error, got nil")
				}
				if tt.wantErrMsg != "" && !containsSubstring(err.Error(), tt.wantErrMsg) {
					t.Fatalf("SendHandoff() error = %q, want substring %q", err.Error(), tt.wantErrMsg)
				}
				if stub.sendHandoffCalled {
					t.Fatal("SendHandoff() store method should not have been called on validation error")
				}
			} else {
				if err != nil {
					t.Fatalf("SendHandoff() unexpected error: %v", err)
				}
				if result == nil {
					t.Fatal("SendHandoff() expected non-nil handoff, got nil")
				}
				if !stub.sendHandoffCalled {
					t.Fatal("SendHandoff() store method should have been called on success")
				}
			}
		})
	}
}

// getHandoffStubStore is a variant for testing GetHandoff transitions.
type getHandoffStubStore struct {
	store.Store
	handoffToReturn       *domain.Handoff
	readHandoffToReturn   *domain.Handoff
	getHandoffCallCount   int
	markHandoffReadCalled bool
}

func (s *getHandoffStubStore) GetHandoff(ctx context.Context, id string) (*domain.Handoff, error) {
	s.getHandoffCallCount++
	if s.getHandoffCallCount == 1 {
		// First call returns the initial handoff
		return s.handoffToReturn, nil
	}
	// Subsequent calls return the updated handoff (for pending->read case)
	return s.readHandoffToReturn, nil
}

func (s *getHandoffStubStore) MarkHandoffRead(ctx context.Context, handoffID string) error {
	s.markHandoffReadCalled = true
	return nil
}

// TestGetHandoffTransitions tests GetHandoff's state transitions.
func TestGetHandoffTransitions(t *testing.T) {
	tests := []struct {
		name                   string
		handoffStatus          domain.HandoffStatus
		wantTransitionedToRead bool
		wantFinalStatus        domain.HandoffStatus
		wantMarkReadCalled     bool
	}{
		{
			name:                   "pending handoff transitions to read",
			handoffStatus:          domain.HandoffStatusPending,
			wantTransitionedToRead: true,
			wantFinalStatus:        domain.HandoffStatusRead,
			wantMarkReadCalled:     true,
		},
		{
			name:                   "already read handoff no transition",
			handoffStatus:          domain.HandoffStatusRead,
			wantTransitionedToRead: false,
			wantFinalStatus:        domain.HandoffStatusRead,
			wantMarkReadCalled:     false,
		},
		{
			name:                   "actioned handoff no transition",
			handoffStatus:          domain.HandoffStatusActioned,
			wantTransitionedToRead: false,
			wantFinalStatus:        domain.HandoffStatusActioned,
			wantMarkReadCalled:     false,
		},
		{
			name:                   "dismissed handoff no transition",
			handoffStatus:          domain.HandoffStatusDismissed,
			wantTransitionedToRead: false,
			wantFinalStatus:        domain.HandoffStatusDismissed,
			wantMarkReadCalled:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handoff := &domain.Handoff{
				ID:        "test-handoff-1",
				Status:    string(tt.handoffStatus),
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			handoffRead := &domain.Handoff{
				ID:        "test-handoff-1",
				Status:    string(domain.HandoffStatusRead),
				CreatedAt: handoff.CreatedAt,
				UpdatedAt: time.Now(),
			}

			stub := &getHandoffStubStore{
				handoffToReturn:     handoff,
				readHandoffToReturn: handoffRead,
			}
			svc := New(stub)
			ctx := context.Background()

			result, err := svc.GetHandoff(ctx, "test-handoff-1")

			if err != nil {
				t.Fatalf("GetHandoff() unexpected error: %v", err)
			}
			if result == nil {
				t.Fatal("GetHandoff() expected non-nil result, got nil")
			}
			if result.Handoff == nil {
				t.Fatal("GetHandoff() expected non-nil handoff in result, got nil")
			}
			if result.TransitionedToRead != tt.wantTransitionedToRead {
				t.Fatalf("TransitionedToRead = %v, want %v", result.TransitionedToRead, tt.wantTransitionedToRead)
			}
			if result.Handoff.Status != string(tt.wantFinalStatus) {
				t.Fatalf("Final status = %s, want %s", result.Handoff.Status, tt.wantFinalStatus)
			}
			if stub.markHandoffReadCalled != tt.wantMarkReadCalled {
				t.Fatalf("MarkHandoffRead called = %v, want %v", stub.markHandoffReadCalled, tt.wantMarkReadCalled)
			}
		})
	}
}

// TestCloseHandoffValidation tests CloseHandoff's validation guards.
func TestCloseHandoffValidation(t *testing.T) {
	tests := []struct {
		name       string
		params     store.CloseHandoffParams
		wantErr    bool
		wantErrMsg string
		wantCalled bool
	}{
		{
			name: "valid close with actioned",
			params: store.CloseHandoffParams{
				ID:             "test-handoff-1",
				Terminal:       "actioned",
				ResolutionNote: "Implemented the fix",
				ResolvedBy:     "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "valid close with dismissed",
			params: store.CloseHandoffParams{
				ID:             "test-handoff-2",
				Terminal:       "dismissed",
				ResolutionNote: "Not applicable to our context",
				ResolvedBy:     "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "blank resolutionNote",
			params: store.CloseHandoffParams{
				ID:             "test-handoff-3",
				Terminal:       "actioned",
				ResolutionNote: "",
				ResolvedBy:     "test-user",
			},
			wantErr:    true,
			wantErrMsg: "close_handoff requires a non-empty resolutionNote",
			wantCalled: false,
		},
		{
			name: "whitespace-only resolutionNote",
			params: store.CloseHandoffParams{
				ID:             "test-handoff-4",
				Terminal:       "actioned",
				ResolutionNote: "   \n\t  ",
				ResolvedBy:     "test-user",
			},
			wantErr:    true,
			wantErrMsg: "close_handoff requires a non-empty resolutionNote",
			wantCalled: false,
		},
		{
			name: "newline in resolutionNote is valid",
			params: store.CloseHandoffParams{
				ID:             "test-handoff-5",
				Terminal:       "actioned",
				ResolutionNote: "Implemented as planned.\nDeployed to production.",
				ResolvedBy:     "test-user",
			},
			wantErr:    false,
			wantCalled: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := &handoffStubStore{}
			svc := New(stub)
			ctx := context.Background()

			err := svc.CloseHandoff(ctx, tt.params)

			if tt.wantErr {
				if err == nil {
					t.Fatal("CloseHandoff() expected error, got nil")
				}
				if tt.wantErrMsg != "" && !containsSubstring(err.Error(), tt.wantErrMsg) {
					t.Fatalf("CloseHandoff() error = %q, want substring %q", err.Error(), tt.wantErrMsg)
				}
				if stub.closeHandoffCalled {
					t.Fatal("CloseHandoff() store method should not have been called on validation error")
				}
			} else {
				if err != nil {
					t.Fatalf("CloseHandoff() unexpected error: %v", err)
				}
				if !stub.closeHandoffCalled {
					t.Fatal("CloseHandoff() store method should have been called on success")
				}
			}
		})
	}
}

// TestAddHandoffAttachmentValidation tests AddHandoffAttachment's validation guards.
func TestAddHandoffAttachmentValidation(t *testing.T) {
	tests := []struct {
		name       string
		params     store.AddHandoffAttachmentParams
		wantErr    bool
		wantErrMsg string
		wantCalled bool
	}{
		{
			name: "valid attachment",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-1",
				RepoPath:  "src/module/file.go",
				CommitSHA: "abc123def456",
				Note:      "Related change",
			},
			wantErr:    false,
			wantCalled: true,
		},
		{
			name: "blank repoPath",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-2",
				RepoPath:  "",
				CommitSHA: "abc123def456",
				Note:      "Missing repo path",
			},
			wantErr:    true,
			wantErrMsg: "add_handoff_attachment requires a non-empty repoPath",
			wantCalled: false,
		},
		{
			name: "whitespace repoPath",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-3",
				RepoPath:  "   \t  ",
				CommitSHA: "abc123def456",
				Note:      "Whitespace repo path",
			},
			wantErr:    true,
			wantErrMsg: "add_handoff_attachment requires a non-empty repoPath",
			wantCalled: false,
		},
		{
			name: "blank commitSha",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-4",
				RepoPath:  "src/module/file.go",
				CommitSHA: "",
				Note:      "Missing commit sha",
			},
			wantErr:    true,
			wantErrMsg: "add_handoff_attachment requires a non-empty commitSha",
			wantCalled: false,
		},
		{
			name: "whitespace commitSha",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-5",
				RepoPath:  "src/module/file.go",
				CommitSHA: "\n\t  ",
				Note:      "Whitespace commit sha",
			},
			wantErr:    true,
			wantErrMsg: "add_handoff_attachment requires a non-empty commitSha",
			wantCalled: false,
		},
		{
			name: "valid with empty note (optional field)",
			params: store.AddHandoffAttachmentParams{
				HandoffID: "test-handoff-6",
				RepoPath:  "src/module/file.go",
				CommitSHA: "abc123def456",
				Note:      "",
			},
			wantErr:    false,
			wantCalled: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := &handoffStubStore{}
			svc := New(stub)
			ctx := context.Background()

			result, err := svc.AddHandoffAttachment(ctx, tt.params)

			if tt.wantErr {
				if err == nil {
					t.Fatal("AddHandoffAttachment() expected error, got nil")
				}
				if tt.wantErrMsg != "" && !containsSubstring(err.Error(), tt.wantErrMsg) {
					t.Fatalf("AddHandoffAttachment() error = %q, want substring %q", err.Error(), tt.wantErrMsg)
				}
				if stub.addHandoffAttachmentCalled {
					t.Fatal("AddHandoffAttachment() store method should not have been called on validation error")
				}
			} else {
				if err != nil {
					t.Fatalf("AddHandoffAttachment() unexpected error: %v", err)
				}
				if result == nil {
					t.Fatal("AddHandoffAttachment() expected non-nil attachment, got nil")
				}
				if !stub.addHandoffAttachmentCalled {
					t.Fatal("AddHandoffAttachment() store method should have been called on success")
				}
			}
		})
	}
}

// containsSubstring is a helper to check if a substring is in a string.
func containsSubstring(s, substring string) bool {
	return len(s) > 0 && len(substring) > 0 && (s == substring || len(s) > len(substring) && (s[:len(substring)] == substring || s[len(s)-len(substring):] == substring || contains(s, substring)))
}

// contains checks if a string contains a substring.
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
