/**
 * Static per-stage agent/model assignment. Not mocked API data — `SpecDTO`
 * has no agent/model fields (see api/types.ts), so this is real UI config
 * consumed by the live Specs screens, extracted from RL_DATA.stages
 * (design_handoff_rig_console/Rig Console.html) as a source of truth for
 * which agent+model the brand guide assigns to each stage.
 */
import type { SpecStageName } from '../api/types';

export interface SpecStageConfig {
	key: SpecStageName;
	label: string;
	agent: string;
	model: string;
}

export const SPEC_STAGE_CONFIG: SpecStageConfig[] = [
	{ key: 'requirements', label: 'Requirements', agent: 'requirements-compiler', model: 'sonnet' },
	{ key: 'design', label: 'Design', agent: 'design-drafter', model: 'opus' },
	{ key: 'tasks', label: 'Tasks', agent: 'tasks-drafter', model: 'sonnet' }
];
