import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { Icon } from './Icon';

export interface StageStepperStep {
	key: string;
	label: string;
}

export interface StageStepperProps {
	steps: StageStepperStep[];
	/** Key of the current (in-progress) step; steps before it render as done. */
	currentKey: string;
	className?: string;
}

export function StageStepper({ steps, currentKey, className }: StageStepperProps) {
	const currentIndex = steps.findIndex((s) => s.key === currentKey);

	return (
		<div className={['rl-stepper', className ?? ''].filter(Boolean).join(' ')}>
			{steps.map((step, i) => {
				const done = currentIndex >= 0 && i < currentIndex;
				const current = i === currentIndex;
				const stepClasses = [
					'rl-stepper__step',
					done ? 'rl-stepper__step--done' : '',
					current ? 'rl-stepper__step--current' : ''
				]
					.filter(Boolean)
					.join(' ');

				return (
					<Fragment key={step.key}>
						<div className={stepClasses}>
							<span className="rl-stepper__node">{done ? <Icon icon={Check} size={13} /> : i + 1}</span>
							<span className="rl-stepper__label">{step.label}</span>
						</div>
						{i < steps.length - 1 ? (
							<div className={['rl-stepper__bar', done ? 'rl-stepper__bar--done' : 'rl-stepper__bar--pending'].join(' ')} />
						) : null}
					</Fragment>
				);
			})}
		</div>
	);
}
