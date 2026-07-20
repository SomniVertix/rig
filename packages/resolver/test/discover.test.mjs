// Unit tests for discover.ts (Requirements Story 2 AC2, AC3; Story 3 AC1):
// - findNearestWorkspace walks up and finds nested .code-workspace files
// - findNearestWorkspace returns null when no .code-workspace exists
// - resolveProjectId reads from committed workspace file (source 'workspace')
// - resolveProjectId uses .local override when present (source 'override')
// - resolveProjectId falls back to committed when .local is empty
// - resolveProjectId throws when neither committed nor .local has a projectId

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { findNearestWorkspace, resolveProjectId } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, 'fixtures');

describe('discover.ts', () => {
	describe('findNearestWorkspace', () => {
		test('finds .code-workspace several levels up (walk-up succeeds)', () => {
			// Start from a deep nested folder; should walk up and find the workspace
			// at the root of the fixture directory
			const startDir = join(fixturesDir, 'nested-walkup', 'deep', 'nested', 'folder');
			const result = findNearestWorkspace(startDir);

			assert.ok(result, 'should find a workspace when walking up');
			assert.equal(result.file, join(fixturesDir, 'nested-walkup', 'workspace.code-workspace'));
			assert.equal(result.dir, join(fixturesDir, 'nested-walkup'));
		});

		test('returns null when no .code-workspace exists anywhere above', async () => {
			// Deliberately outside the repo tree: this repo itself now has a
			// rig.code-workspace at its root (see docs/workspace-binding-migration.md),
			// so any in-repo fixture path -- including packages/resolver/test/fixtures/
			// -- would walk up and find it, defeating this test's premise.
			const base = await mkdtemp(join(await realpath(tmpdir()), 'rig-resolver-no-workspace-'));
			const startDir = join(base, 'deep', 'nested', 'folder');
			await mkdir(startDir, { recursive: true });

			const result = findNearestWorkspace(startDir);

			assert.equal(result, null, 'should return null when no workspace found');
		});
	});

	describe('resolveProjectId', () => {
		test('reads from committed workspace file (source workspace)', () => {
			// Workspace file with only committed rig.projectId
			const workspaceFile = join(fixturesDir, 'workspace-only', 'workspace.code-workspace');
			const result = resolveProjectId(workspaceFile);

			assert.equal(result.workspaceFile, workspaceFile);
			assert.equal(result.projectId, 'workspace-only-project');
			assert.equal(result.source, 'workspace');
		});

		test('uses .local override when present (source override)', () => {
			// Workspace file with both committed and .local override
			const workspaceFile = join(fixturesDir, 'workspace-and-override', 'workspace.code-workspace');
			const result = resolveProjectId(workspaceFile);

			assert.equal(result.workspaceFile, workspaceFile);
			assert.equal(result.projectId, 'workspace-override-project');
			assert.equal(result.source, 'override');
		});

		test('falls back to committed when .local is empty', () => {
			// .local file exists but has empty projectId; should fall back to committed
			const workspaceFile = join(fixturesDir, 'local-fallback', 'workspace.code-workspace');
			const result = resolveProjectId(workspaceFile);

			assert.equal(result.workspaceFile, workspaceFile);
			assert.equal(result.projectId, 'local-fallback-committed');
			assert.equal(result.source, 'workspace');
		});

		test('throws when neither committed nor .local has a projectId', () => {
			// Workspace file without any rig.projectId field
			const workspaceFile = join(fixturesDir, 'no-projectid', 'workspace.code-workspace');

			assert.throws(
				() => resolveProjectId(workspaceFile),
				/No rig\.projectId found/,
				'should throw with descriptive message when no projectId found'
			);
		});
	});
});
