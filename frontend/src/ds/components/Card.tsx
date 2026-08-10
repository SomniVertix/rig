import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
	flat?: boolean;
	interactive?: boolean;
	children?: ReactNode;
}

export function Card({ flat = false, interactive = false, className, children, ...rest }: CardProps) {
	const classes = [
		'rl-card',
		flat ? 'rl-card--flat' : '',
		interactive ? 'rl-card--interactive' : '',
		className ?? ''
	]
		.filter(Boolean)
		.join(' ');
	return (
		<div className={classes} {...rest}>
			{children}
		</div>
	);
}

export function CardPad({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={['rl-card__pad', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
		</div>
	);
}

export function CardEyebrow({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={['rl-card__eyebrow', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
		</div>
	);
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={['rl-card__title', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
		</div>
	);
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={['rl-card__body', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
		</div>
	);
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={['rl-card__footer', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
		</div>
	);
}
