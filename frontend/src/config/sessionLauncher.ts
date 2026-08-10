/** Static UI config for the Session launcher dialog fields — from the design
 * handoff §10, not mocked API data. Sessions have no V2 backend at all yet
 * (see GAPS.md §3), so nothing here is submittable; kept as real config so
 * the field-selection interaction itself is fully built. */

export type SessionType = 'discovery' | 'scratch';
export type Executor = 'claude' | 'pi';

export const SESSION_TYPES: { value: SessionType; label: string; note: string }[] = [
	{ value: 'discovery', label: 'Discovery', note: 'wayfinder skill · charts a trail' },
	{ value: 'scratch', label: 'General', note: 'scratch agent session · transcript only' }
];

export const EXECUTORS: { value: Executor; label: string; note: string }[] = [
	{ value: 'claude', label: 'claude', note: 'sonnet · ACP subprocess · default' },
	{ value: 'pi', label: 'pi', note: 'alt backend · ACP subprocess' }
];

export const MODEL_CONFIG_BY_EXECUTOR: Record<Executor, { options: string[]; default: string; hint: string }> = {
	claude: { options: ['opus', 'sonnet', 'haiku'], default: 'sonnet', hint: 'per-stage overrides still apply from the workflow YAML' },
	pi: { options: ['pi-large', 'pi-fast'], default: 'pi-large', hint: 'alt backend · model names map in the executor config' }
};

export const LAUNCHER_AGENTS = ['wayfinder-agent', 'requirements-compiler', 'design-drafter', 'tasks-drafter'];
export const DEFAULT_LAUNCHER_AGENT = 'wayfinder-agent';
