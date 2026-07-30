import type { ReactNode } from 'react';

export interface TabItem {
	key: string;
	label: string;
	icon?: ReactNode;
}

export interface TabsProps {
	tabs: TabItem[];
	activeKey: string;
	onChange: (key: string) => void;
	className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
	return (
		<div className={['rl-tabs', className ?? ''].filter(Boolean).join(' ')} role="tablist">
			{tabs.map((tab) => {
				const active = tab.key === activeKey;
				return (
					<button
						key={tab.key}
						type="button"
						role="tab"
						aria-selected={active}
						className={['rl-tabs__tab', active ? 'rl-tabs__tab--active' : ''].filter(Boolean).join(' ')}
						onClick={() => onChange(tab.key)}
					>
						{tab.icon}
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
