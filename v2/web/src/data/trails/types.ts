/** UI-facing types — deliberately keep the business-approved "Trail"/"Wayfinder"
 * vocabulary. Only domain/trails.ts (the translation seam) knows these map to
 * V2's `/expeditions` API underneath. */

export type WaypointState = 'sighted' | 'marked' | 'claimed' | 'reached' | 'bypassed';

export interface Waypoint {
	id: string;
	title: string;
	state: WaypointState;
	/** Set for reached/marked — the recorded resolution. */
	decision?: string;
	claimedBy?: string;
	claimedAt?: string;
	bypassReason?: string;
	dependsOn: string[];
}

/**
 * V2's expedition status is active/complete/abandoned; "chartered" and
 * "settled" are UI-facing distinctions derived from outcomeKind (see
 * domain/trails.ts). "abandoned" is a real V2 state the original 4-column
 * design (grilling/active/settled/chartered) didn't have a column for.
 */
export type TrailStatus = 'active' | 'settled' | 'chartered' | 'abandoned';

export interface TrailSummary {
	id: string;
	name: string;
	status: TrailStatus;
	trailheadPrompt: string;
	destination?: string;
	waypointCounts: Record<WaypointState, number>;
	outcomeSpecId?: string;
	updatedAt: string;
}

export interface TrailDetail extends TrailSummary {
	waypoints: Waypoint[];
}
