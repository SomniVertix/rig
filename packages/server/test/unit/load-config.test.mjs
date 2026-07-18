// Unit tests for loadServerConfig/normalizeConfig for webPort/webHost fields
// Tests the web-config component, Story 7 AC1, AC2, AC3

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// Import the functions to test
// Note: The load-config module is TypeScript, so we're importing from the compiled dist
import { ConfigError } from '../../dist/server/src/config/load-config.js';

// We need to import normalizeConfig, but it's not exported. Let's check if we can access it
// For now, we'll test via loadServerConfig which calls normalizeConfig internally

async function testWithEnv(envOverrides, configOverrides = {}) {
	const env = {
		DATABASE_URL: 'postgres://localhost/test',
		...envOverrides
	};

	const source = {
		env,
		workspaceRoot: '/tmp/test',
		configPath: '/tmp/test/relentless.config.ts'
	};

	// Import dynamically to ensure we get fresh module state
	const { loadServerConfig } = await import('../../dist/server/src/config/load-config.js');
	return loadServerConfig(source);
}

describe('loadServerConfig webPort/webHost configuration', () => {
	describe('webPort field', () => {
		test('(a) RELENTLESS_WEB_PORT unset -> webPort undefined', async () => {
			const config = await testWithEnv({
				// Explicitly not setting RELENTLESS_WEB_PORT
			});
			assert.equal(config.webPort, undefined, 'webPort should be undefined when RELENTLESS_WEB_PORT is unset');
		});

		test('(b) valid RELENTLESS_WEB_PORT -> numeric webPort', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: '3000'
			});
			assert.equal(config.webPort, 3000, 'webPort should be parsed as numeric value 3000');
			assert.equal(typeof config.webPort, 'number', 'webPort should be a number type');
		});

		test('(b) valid RELENTLESS_WEB_PORT with large number', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: '65535'
			});
			assert.equal(config.webPort, 65535, 'webPort should handle large valid port numbers');
		});

		test('(b) valid RELENTLESS_WEB_PORT with minimum value 1', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: '1'
			});
			assert.equal(config.webPort, 1, 'webPort should accept minimum positive value of 1');
		});

		test('(c) invalid RELENTLESS_WEB_PORT (zero) -> ConfigError', async () => {
			await assert.rejects(
				async () => testWithEnv({
					RELENTLESS_WEB_PORT: '0'
				}),
				(error) => error instanceof ConfigError && error.key === 'webPort',
				'should throw ConfigError with key "webPort" for zero value'
			);
		});

		test('(c) invalid RELENTLESS_WEB_PORT (negative) -> ConfigError', async () => {
			await assert.rejects(
				async () => testWithEnv({
					RELENTLESS_WEB_PORT: '-100'
				}),
				(error) => error instanceof ConfigError && error.key === 'webPort',
				'should throw ConfigError with key "webPort" for negative value'
			);
		});

		test('(c) invalid RELENTLESS_WEB_PORT (non-integer) -> ConfigError', async () => {
			await assert.rejects(
				async () => testWithEnv({
					RELENTLESS_WEB_PORT: '3000.5'
				}),
				(error) => error instanceof ConfigError && error.key === 'webPort',
				'should throw ConfigError with key "webPort" for non-integer value'
			);
		});

		test('(c) invalid RELENTLESS_WEB_PORT (non-numeric) -> ConfigError', async () => {
			await assert.rejects(
				async () => testWithEnv({
					RELENTLESS_WEB_PORT: 'not-a-number'
				}),
				(error) => error instanceof ConfigError && error.key === 'webPort',
				'should throw ConfigError with key "webPort" for non-numeric value'
			);
		});

		test('(c) invalid RELENTLESS_WEB_PORT (empty string) -> webPort undefined', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: ''
			});
			assert.equal(config.webPort, undefined, 'webPort should be undefined for empty string');
		});

		test('(c) invalid RELENTLESS_WEB_PORT (whitespace only) -> webPort undefined', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: '   \t  '
			});
			assert.equal(config.webPort, undefined, 'webPort should be undefined for whitespace-only string');
		});
	});

	describe('webHost field', () => {
		test('(d) webHost defaults to 0.0.0.0 when unset', async () => {
			const config = await testWithEnv({
				// Explicitly not setting RELENTLESS_WEB_HOST
			});
			assert.equal(config.webHost, '0.0.0.0', 'webHost should default to 0.0.0.0 when RELENTLESS_WEB_HOST is unset');
		});

		test('webHost accepts custom value from RELENTLESS_WEB_HOST', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_HOST: 'localhost'
			});
			assert.equal(config.webHost, 'localhost', 'webHost should use the RELENTLESS_WEB_HOST value when set');
		});

		test('webHost accepts 127.0.0.1', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_HOST: '127.0.0.1'
			});
			assert.equal(config.webHost, '127.0.0.1', 'webHost should accept 127.0.0.1');
		});

		test('webHost accepts :: (IPv6 any)', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_HOST: '::'
			});
			assert.equal(config.webHost, '::', 'webHost should accept :: for IPv6 any');
		});

		test('webHost and webPort can be set independently', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_HOST: 'example.com',
				RELENTLESS_WEB_PORT: '8080'
			});
			assert.equal(config.webHost, 'example.com', 'webHost should be set to example.com');
			assert.equal(config.webPort, 8080, 'webPort should be set to 8080');
		});

		test('webPort can be unset while webHost is set', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_HOST: 'example.com'
				// RELENTLESS_WEB_PORT not set
			});
			assert.equal(config.webHost, 'example.com', 'webHost should be set');
			assert.equal(config.webPort, undefined, 'webPort should be undefined when not set');
		});
	});

	describe('web listener startup behavior', () => {
		test('webPort undefined means no web listener would start', async () => {
			const config = await testWithEnv({
				// RELENTLESS_WEB_PORT not set
			});
			assert.equal(config.webPort, undefined, 'when webPort is undefined, no web listener should start');
			assert.equal(config.webHost, '0.0.0.0', 'webHost should still have default value even if no listener will start');
		});

		test('webPort set enables potential web listener', async () => {
			const config = await testWithEnv({
				RELENTLESS_WEB_PORT: '3000'
			});
			assert.equal(config.webPort, 3000, 'when webPort is set, web listener can start');
			assert.equal(typeof config.webPort, 'number', 'webPort should be a number when set');
		});
	});
});
