import type { LucideIcon } from 'lucide-react';

export interface IconProps {
	icon: LucideIcon;
	size?: number;
	className?: string;
}

/** Thin Lucide wrapper so every consumer gets the brand's stroke width and `currentColor`. */
export function Icon({ icon: LucideIconComponent, size = 16, className }: IconProps) {
	return <LucideIconComponent size={size} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
