import type { Status } from '../../ds';
import type { DisplayStageStatus } from '../../data/specs/types';

/** DisplayStageStatus's 'not_started' maps to StatusBadge's 'draft' token
 * (brand guide: "slate draft/not_started" — one visual state, two names). */
export function toBadgeStatus(status: DisplayStageStatus): Status {
	return status === 'not_started' ? 'draft' : status;
}
