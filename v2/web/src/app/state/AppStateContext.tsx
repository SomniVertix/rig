import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePersistedState } from '../persist';

export type Theme = 'dark' | 'light';

export interface ToastItem {
	id: string;
	tone: 'success' | 'danger' | 'info';
	title: string;
	message?: string;
}

export interface OpenSession {
	id: string;
	kind: 'discovery' | 'scratch';
	split: boolean;
}

interface AppStateValue {
	theme: Theme;
	setTheme: (t: Theme) => void;
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (v: boolean) => void;
	toasts: ToastItem[];
	pushToast: (toast: Omit<ToastItem, 'id'>) => void;
	dismissToast: (id: string) => void;
	openSessions: OpenSession[];
	setOpenSessions: (sessions: OpenSession[]) => void;
	pageTitle: string;
	setPageTitle: (title: string) => void;
	sessionLauncherOpen: boolean;
	openSessionLauncher: () => void;
	closeSessionLauncher: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = usePersistedState<Theme>('theme', 'dark');
	const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState('sidebarCollapsed', false);
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const [openSessions, setOpenSessions] = useState<OpenSession[]>([]);
	const [pageTitle, setPageTitle] = useState('Rig');
	const [sessionLauncherOpen, setSessionLauncherOpen] = useState(false);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	const pushToast = (toast: Omit<ToastItem, 'id'>) => {
		const id = crypto.randomUUID();
		setToasts((prev) => [...prev, { ...toast, id }]);
		setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
	};

	const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

	const value = useMemo<AppStateValue>(
		() => ({
			theme,
			setTheme,
			sidebarCollapsed,
			setSidebarCollapsed,
			toasts,
			pushToast,
			dismissToast,
			openSessions,
			setOpenSessions,
			pageTitle,
			setPageTitle,
			sessionLauncherOpen,
			openSessionLauncher: () => setSessionLauncherOpen(true),
			closeSessionLauncher: () => setSessionLauncherOpen(false)
		}),
		[theme, sidebarCollapsed, toasts, openSessions, pageTitle, sessionLauncherOpen]
	);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
	const ctx = useContext(AppStateContext);
	if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
	return ctx;
}

/** Pages call this to set the Topbar title while mounted. */
export function usePageTitle(title: string) {
	const { setPageTitle } = useAppState();
	useEffect(() => {
		setPageTitle(title);
	}, [title, setPageTitle]);
}
