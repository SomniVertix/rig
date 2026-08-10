import type { SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { Field } from './Field';

export interface SelectOption {
	value: string;
	label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
	options: SelectOption[];
	label?: string;
	hint?: string;
	error?: boolean;
}

export function Select({ options, label, hint, error = false, id, ...rest }: SelectProps) {
	const generatedId = useId();
	const selectId = id ?? generatedId;

	return (
		<Field label={label} hint={hint} error={error} htmlFor={selectId}>
			<select id={selectId} className={['rl-select', error ? 'rl-input--error' : ''].filter(Boolean).join(' ')} {...rest}>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</Field>
	);
}
