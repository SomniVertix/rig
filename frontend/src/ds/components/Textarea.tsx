import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { Field } from './Field';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
	label?: string;
	hint?: string;
	error?: boolean;
}

export function Textarea({ label, hint, error = false, id, ...rest }: TextareaProps) {
	const generatedId = useId();
	const textareaId = id ?? generatedId;

	return (
		<Field label={label} hint={hint} error={error} htmlFor={textareaId}>
			<textarea id={textareaId} className={['rl-textarea', error ? 'rl-textarea--error' : ''].filter(Boolean).join(' ')} {...rest} />
		</Field>
	);
}
