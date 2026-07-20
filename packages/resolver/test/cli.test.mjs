// Unit tests for cli.ts entrypoint behavior
// (Requirements Story 2 AC1; Design Data Model "Resolver package + discovery/proxy interface")
// - cli.ts spawned from fixture with no .code-workspace above exits with non-zero code and stderr diagnostic
// - cli.ts spawned from valid workspace with missing env vars exits with non-zero code and stderr diagnostic naming the variable

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import process from 'node:process';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = join(__dirname, 'fixtures');
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

describe('cli.ts', () => {
	describe('spawned process behavior', () => {
		test('exits with non-zero and stderr diagnostic when no .code-workspace found above fixture', async () => {
			// Deliberately outside the repo tree: this repo itself now has a
			// rig.code-workspace at its root (see docs/workspace-binding-migration.md),
			// so any in-repo fixture path would walk up and find it, causing the
			// CLI to actually attempt a (hanging) network connection instead of
			// exiting fast -- defeating this test's premise.
			const base = await mkdtemp(join(await realpath(tmpdir()), 'rig-resolver-cli-no-workspace-'));
			const cwd = join(base, 'deep', 'nested', 'folder');
			await mkdir(cwd, { recursive: true });

			let exitCode = null;
			let stderr = '';

			try {
				await execFileAsync(process.execPath, [cliPath], {
					cwd,
					// Provide dummy env vars so they don't cause exit before workspace check
					env: {
						RIG_MCP_URL: 'http://localhost:8000',
						RIG_MCP_BEARER_TOKEN: 'dummy-token',
					},
				});
			} catch (error) {
				if (error.status !== null && error.status !== undefined) {
					exitCode = error.status;
				}
				stderr = error.stderr || '';
			}

			assert.ok(exitCode !== 0, 'should exit with non-zero code when no workspace found');
			assert.ok(
				stderr.includes('no .code-workspace file found'),
				`stderr should mention missing .code-workspace file, got: ${stderr}`
			);
			assert.ok(
				stderr.includes(cwd),
				`stderr should include the starting directory path, got: ${stderr}`
			);
		});

		test('exits with non-zero and stderr diagnostic naming RIG_MCP_URL when it is unset', async () => {
			const cwd = join(fixturesDir, 'workspace-only');

			let exitCode = null;
			let stderr = '';

			try {
				await execFileAsync(process.execPath, [cliPath], {
					cwd,
					// Deliberately unset both env vars (empty env)
					env: {},
				});
			} catch (error) {
				if (error.status !== null && error.status !== undefined) {
					exitCode = error.status;
				}
				stderr = error.stderr || '';
			}

			assert.ok(exitCode !== 0, 'should exit with non-zero code when RIG_MCP_URL is unset');
			assert.ok(
				stderr.includes('RIG_MCP_URL'),
				`stderr should name the missing RIG_MCP_URL variable, got: ${stderr}`
			);
		});

		test('exits with non-zero and stderr diagnostic naming RIG_MCP_BEARER_TOKEN when it is unset', async () => {
			const cwd = join(fixturesDir, 'workspace-only');

			let exitCode = null;
			let stderr = '';

			try {
				await execFileAsync(process.execPath, [cliPath], {
					cwd,
					// Set RIG_MCP_URL but not RIG_MCP_BEARER_TOKEN
					env: {
						RIG_MCP_URL: 'http://localhost:8000',
					},
				});
			} catch (error) {
				if (error.status !== null && error.status !== undefined) {
					exitCode = error.status;
				}
				stderr = error.stderr || '';
			}

			assert.ok(exitCode !== 0, 'should exit with non-zero code when RIG_MCP_BEARER_TOKEN is unset');
			assert.ok(
				stderr.includes('RIG_MCP_BEARER_TOKEN'),
				`stderr should name the missing RIG_MCP_BEARER_TOKEN variable, got: ${stderr}`
			);
		});
	});
});
