import { Moon, Sun } from 'lucide-react';
import { IconButton } from '../../ds';
import { useAppState } from '../state/AppStateContext';

export function ThemeToggle() {
	const { theme, setTheme } = useAppState();
	const next = theme === 'dark' ? 'light' : 'dark';
	return (
		<IconButton
			icon={theme === 'dark' ? Sun : Moon}
			aria-label={`Switch to ${next} theme`}
			onClick={() => setTheme(next)}
		/>
	);
}
