import type { HTMLAttributes } from 'react';

export interface RelativeTimeProps extends Omit<HTMLAttributes<HTMLTimeElement>, 'children'> {
	value: string;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 1000 * 60 * 60 * 24 * 365],
	['month', 1000 * 60 * 60 * 24 * 30],
	['week', 1000 * 60 * 60 * 24 * 7],
	['day', 1000 * 60 * 60 * 24],
	['hour', 1000 * 60 * 60],
	['minute', 1000 * 60],
	['second', 1000]
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelativeTime(value: string, now: number = Date.now()): string {
	const then = new Date(value).getTime();
	if (Number.isNaN(then)) return value;

	const diffMs = then - now;
	const absMs = Math.abs(diffMs);

	if (absMs < 1000 * 45) return 'just now';

	for (const [unit, unitMs] of UNITS) {
		if (absMs >= unitMs || unit === 'second') {
			return formatter.format(Math.round(diffMs / unitMs), unit);
		}
	}
	return formatter.format(Math.round(diffMs / 1000), 'second');
}

// Renders an ISO timestamp as relative text ("3 hours ago"), with the exact
// timestamp available on hover via the native title attribute.
export function RelativeTime({ value, className, ...rest }: RelativeTimeProps) {
	const date = new Date(value);
	const exact = Number.isNaN(date.getTime()) ? value : date.toLocaleString();

	return (
		<time dateTime={value} title={exact} className={['rl-relative-time', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{formatRelativeTime(value)}
		</time>
	);
}
