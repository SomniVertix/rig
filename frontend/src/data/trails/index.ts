// Stage A — real V2 backend exists (/expeditions, /waypoints). Re-exporting
// from live.ts is the whole seam; a Stage-C change elsewhere would just
// swap this file's source, not any caller.
export * from './live';
export * from './types';
