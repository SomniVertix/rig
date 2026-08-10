/**
 * The one place that knows the UI's "Trail"/"Wayfinder" vocabulary maps to
 * V2's `/expeditions` API underneath (see GAPS.md §2). Everything above
 * `src/data/trails/` speaks `Trail`/`Waypoint`; everything at or below this
 * file speaks `Expedition`/`Waypoint` DTOs.
 */
import type { ExpeditionDTO, WaypointDTO, WaypointDependencyEdgeDTO } from '../api/types';
import type { TrailStatus, TrailSummary, TrailDetail, Waypoint, WaypointState } from '../data/trails/types';

export function toTrailStatus(expedition: ExpeditionDTO): TrailStatus {
	if (expedition.status === 'abandoned') return 'abandoned';
	if (expedition.status === 'complete') {
		return expedition.outcomeKind === 'spec' ? 'chartered' : 'settled';
	}
	return 'active';
}

function emptyWaypointCounts(): Record<WaypointState, number> {
	return { sighted: 0, marked: 0, claimed: 0, reached: 0, bypassed: 0 };
}

function countWaypoints(waypoints: WaypointDTO[]): Record<WaypointState, number> {
	const counts = emptyWaypointCounts();
	for (const w of waypoints) counts[w.status] += 1;
	return counts;
}

export function toTrailSummary(expedition: ExpeditionDTO, waypoints: WaypointDTO[]): TrailSummary {
	return {
		id: expedition.id,
		name: expedition.title,
		status: toTrailStatus(expedition),
		trailheadPrompt: expedition.briefingPrompt,
		destination: expedition.destination ?? undefined,
		waypointCounts: countWaypoints(waypoints),
		outcomeSpecId: expedition.outcomeSpecId ?? undefined,
		updatedAt: expedition.updatedAt
	};
}

export function toWaypoint(dto: WaypointDTO, dependencies: WaypointDependencyEdgeDTO[]): Waypoint {
	return {
		id: dto.id,
		title: dto.title,
		state: dto.status,
		decision: dto.resolutionGist ?? dto.resolution ?? undefined,
		claimedBy: dto.claimedBy ?? undefined,
		claimedAt: dto.claimedAt ?? undefined,
		bypassReason: dto.bypassReason ?? undefined,
		dependsOn: dependencies.filter((d) => d.toWaypointId === dto.id).map((d) => d.fromWaypointId)
	};
}

export function toTrailDetail(
	expedition: ExpeditionDTO,
	waypoints: WaypointDTO[],
	dependencies: WaypointDependencyEdgeDTO[]
): TrailDetail {
	return {
		...toTrailSummary(expedition, waypoints),
		waypoints: waypoints
			.slice()
			.sort((a, b) => a.waypointNumber - b.waypointNumber)
			.map((w) => toWaypoint(w, dependencies))
	};
}
