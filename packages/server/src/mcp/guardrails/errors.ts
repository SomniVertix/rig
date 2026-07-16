/**
 * Guardrails (T6): every rejection this module produces carries a stable,
 * machine-readable `rule` string -- distinct from a generic thrown `Error` -- so the
 * tool layer's `errorResult` (tool-helpers.ts) surfaces which specific rule was
 * violated (Story 12.3) rather than collapsing every rejection into one generic
 * failure. Mirrors `SpecRepositoryError`'s shape from T5.1 on purpose: guardrails
 * validation runs in addition to, not instead of, the DB-level constraints from T1
 * (Story 12.4) -- both error families are rendered identically by the tool layer.
 */
export class GuardrailError extends Error {
	public readonly rule: string;

	constructor(rule: string, message: string) {
		super(message);
		this.name = 'GuardrailError';
		this.rule = rule;
	}
}
