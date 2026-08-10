import type { ReactNode } from 'react';

export interface FieldProps {
	label?: string;
	hint?: string;
	error?: boolean;
	htmlFor?: string;
	children: ReactNode;
}

/** Shared label + hint wrapper for Select/Textarea (matches `.rl-field*` in components.css). */
export function Field({ label, hint, error = false, htmlFor, children }: FieldProps) {
	return (
		<div className="rl-field">
			{label ? (
				<label className="rl-field__label" htmlFor={htmlFor}>
					{label}
				</label>
			) : null}
			{children}
			{hint ? <span className={['rl-field__hint', error ? 'rl-field__hint--error' : ''].filter(Boolean).join(' ')}>{hint}</span> : null}
		</div>
	);
}
