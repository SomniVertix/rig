import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Pool } from 'pg';

import { assertEarsStructure, assertNoUnquantifiedQualityAdjective, assertNotBlank } from './content-validation.js';
import { requireKnownActor } from './actor-registry.js';

export * from './errors.js';
export * from './content-validation.js';
export * from './actor-registry.js';
export * from './checkbox-rule.js';
export * from './audit-log.js';

/**
 * Declarative field-level content rules (T6.1) a write tool can opt into. Every
 * field named here is checked only when present in `args` and typed as a string --
 * `update_*` tools where a field is optional simply skip the check when the caller
 * didn't supply that field this call.
 */
export interface GuardrailFieldRules {
	/** Field names checked for empty/whitespace-only content (Story 12.5). */
	notBlank?: string[];
	/** Field names checked against the unquantified quality-adjective list (Story 12.7). */
	noQualityAdjectives?: string[];
	/** For `acceptance_criterion`: the argument names holding `ears_pattern` and `full_text` (Story 12.1, 12.6). */
	earsAcceptanceCriterion?: { patternField: string; textField: string };
}

/**
 * Wraps a write-tool handler with T6's guardrails: known-actor validation always
 * runs first (Story 11.1, 11.4), followed by whatever field-level content rules the
 * caller declares (T6.1). Every rejection here is a distinct `GuardrailError` with a
 * stable `rule` (Story 12.3). None of this replaces the DB-level constraints from
 * T1 -- it runs strictly before the underlying `SpecRepository` call, which still
 * enforces its own constraints independently either way (Story 12.4).
 *
 * Compose as `withToolErrorHandling(withGuardrails(context.pool, rules, handler))`.
 */
export function withGuardrails<Args extends Record<string, unknown>>(
	pool: Pool,
	rules: GuardrailFieldRules,
	handler: (args: Args) => Promise<CallToolResult>
): (args: Args) => Promise<CallToolResult> {
	return async (args: Args) => {
		await requireKnownActor(pool, args.actor);

		for (const field of rules.notBlank ?? []) {
			const value = args[field];
			if (typeof value === 'string') {
				assertNotBlank(field, value);
			}
		}
		for (const field of rules.noQualityAdjectives ?? []) {
			const value = args[field];
			if (typeof value === 'string') {
				assertNoUnquantifiedQualityAdjective(field, value);
			}
		}
		if (rules.earsAcceptanceCriterion !== undefined) {
			const pattern = args[rules.earsAcceptanceCriterion.patternField];
			const text = args[rules.earsAcceptanceCriterion.textField];
			if (typeof pattern === 'string' && typeof text === 'string') {
				assertEarsStructure(pattern, text);
			}
		}

		return await handler(args);
	};
}
