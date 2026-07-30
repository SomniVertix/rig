import { Toast } from '../../ds';
import { useAppState } from '../state/AppStateContext';

export function ToastHost() {
	const { toasts } = useAppState();
	if (toasts.length === 0) return null;

	return (
		<div className="rl-toast-host">
			{toasts.map((t) => (
				<Toast key={t.id} tone={t.tone} title={t.title} message={t.message} />
			))}
		</div>
	);
}
