import { useCallback, useState } from 'react';

/** localStorage-backed useState, namespaced under `rig.`. */
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
	const storageKey = `rig.${key}`;
	const [value, setValue] = useState<T>(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			return stored !== null ? (JSON.parse(stored) as T) : initial;
		} catch {
			return initial;
		}
	});

	const set = useCallback(
		(next: T) => {
			setValue(next);
			try {
				localStorage.setItem(storageKey, JSON.stringify(next));
			} catch {
				// storage unavailable (private browsing, quota) — in-memory state still works
			}
		},
		[storageKey]
	);

	return [value, set];
}
