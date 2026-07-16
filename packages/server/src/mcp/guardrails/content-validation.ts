import { GuardrailError } from './errors.js';

/**
 * T6.1: EARS/empty-content/quality-adjective validation module (design §Data Model
 * 10). These are semantic content rules layered on top of (never in place of) the
 * DB-level constraints from T1 -- a field can be non-null and non-empty at the SQL
 * level (e.g. zod's `.min(1)` already rejects a truly empty string at the tool-schema
 * layer) while still being whitespace-only or vague/unquantified, which only these
 * checks catch.
 */

// =============================================================================
// Empty / whitespace-only rejection
// =============================================================================

/** Rejects an empty or whitespace-only field value (Story 12.5). */
export function assertNotBlank(fieldName: string, value: string): void {
	if (value.trim().length === 0) {
		throw new GuardrailError('empty_field', `${fieldName} must not be empty or whitespace-only`);
	}
}

// =============================================================================
// EARS structural matching (Story 12.1, 12.6)
// =============================================================================

/**
 * Every EARS pattern requires the response clause to contain `SHALL`; each pattern
 * additionally implies specific structural keyword(s) that must also be present,
 * matching the exact illustrative shapes recorded as comments on
 * `spec_pipeline.ears_pattern` in schema.sql:
 *   - ubiquitous:          THE SYSTEM SHALL <response>                       (no extra keyword)
 *   - event_driven:        WHEN <trigger>, THE SYSTEM SHALL <response>       (WHEN)
 *   - state_driven:        WHILE <state>, THE SYSTEM SHALL <response>        (WHILE)
 *   - unwanted_behavior:   IF <condition>, THEN THE SYSTEM SHALL <response>  (IF)
 *   - complex_conditional: WHEN <trigger>, IF <condition>, THE SYSTEM SHALL  (WHEN *and* IF -- this
 *                          pattern's whole point is combining two simple patterns, so both keywords
 *                          are required, not just one)
 *   - optional_feature:    WHERE <feature included>, THE SYSTEM SHALL        (WHERE)
 */
const SHALL_PATTERN = /\bSHALL\b/i;

const EARS_PATTERN_KEYWORDS: Record<string, RegExp[]> = {
	ubiquitous: [],
	event_driven: [/\bWHEN\b/i],
	state_driven: [/\bWHILE\b/i],
	unwanted_behavior: [/\bIF\b/i],
	complex_conditional: [/\bWHEN\b/i, /\bIF\b/i],
	optional_feature: [/\bWHERE\b/i]
};

/**
 * Structurally validates `full_text` against its declared `ears_pattern`: SHALL plus
 * the pattern's implied keyword(s) must both be present (Story 12.1, 12.6).
 */
export function assertEarsStructure(earsPattern: string, fullText: string): void {
	if (!SHALL_PATTERN.test(fullText)) {
		throw new GuardrailError('ears_missing_shall', 'acceptance criterion full_text must contain SHALL');
	}
	const requiredKeywords = EARS_PATTERN_KEYWORDS[earsPattern];
	if (requiredKeywords === undefined) {
		throw new GuardrailError('ears_unknown_pattern', `unrecognized ears_pattern: ${earsPattern}`);
	}
	const missingKeyword = requiredKeywords.find((keyword) => !keyword.test(fullText));
	if (missingKeyword !== undefined) {
		throw new GuardrailError(
			'ears_pattern_mismatch',
			`acceptance criterion full_text does not match the structural keyword(s) implied by ears_pattern '${earsPattern}'`
		);
	}
}

// =============================================================================
// Unquantified quality-adjective rejection (Story 12.7)
// =============================================================================

/**
 * Fixed v1 vocabulary (tasks.md Flags) -- rejected unless an adjacent number+unit
 * token is present in the same field. Expanding this list later is a normal
 * follow-up change to this module, not a blocking gap.
 */
export const QUALITY_ADJECTIVES: readonly string[] = [
	'fast',
	'slow',
	'scalable',
	'reliable',
	'performant',
	'efficient',
	'robust',
	'secure',
	'intuitive',
	'seamless',
	'flexible',
	'simple',
	'easy',
	'responsive',
	'lightweight',
	'high-performance',
	'low-latency',
	'real-time',
	'highly available'
];

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeWordPattern(adjective: string): RegExp {
	// "highly available" is two words separated by a space; every other entry is a
	// single (possibly hyphenated) token. Either way `\b` on both ends gives a
	// whole-word/whole-phrase match, and internal whitespace is normalized to `\s+`.
	const escaped = escapeRegExp(adjective).replace(/ /g, '\\s+');
	return new RegExp(`\\b${escaped}\\b`, 'i');
}

const QUALITY_ADJECTIVE_PATTERNS: ReadonlyArray<{ adjective: string; pattern: RegExp }> = QUALITY_ADJECTIVES.map((adjective) => ({
	adjective,
	pattern: wholeWordPattern(adjective)
}));

/**
 * A number immediately adjacent to a unit-like token -- e.g. `200ms`, `99.9%`, `20
 * concurrent`, `3 seconds` -- the presence of which excuses an otherwise-rejected
 * quality adjective in the same field (Story 12.7).
 */
const NUMBER_UNIT_PATTERN = /\d+(\.\d+)?\s*[a-zA-Z%]+/;

/**
 * Rejects any fixed-vocabulary quality adjective present in `value` (whole-word,
 * case-insensitive) unless the same field also contains an adjacent number+unit
 * token quantifying the claim.
 */
export function assertNoUnquantifiedQualityAdjective(fieldName: string, value: string): void {
	if (NUMBER_UNIT_PATTERN.test(value)) {
		return;
	}
	const match = QUALITY_ADJECTIVE_PATTERNS.find(({ pattern }) => pattern.test(value));
	if (match !== undefined) {
		throw new GuardrailError(
			'unquantified_quality_adjective',
			`${fieldName} uses the unquantified quality adjective "${match.adjective}" with no adjacent number+unit (e.g. "200ms", "99.9%") to back it up`
		);
	}
}
