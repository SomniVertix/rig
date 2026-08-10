import { Dialog, Markdown, RelativeTime } from '../../ds';
import { useHandoff, useHandoffConversation } from '../../data/handoffs';

export interface HandoffDetailDialogProps {
	handoffId: string;
	isOpen: boolean;
	onClose: () => void;
}

export function HandoffDetailDialog({ handoffId, isOpen, onClose }: HandoffDetailDialogProps) {
	const { data: handoff, isLoading, error } = useHandoff(handoffId);
	const { data: conversationData } = useHandoffConversation(handoff?.hasConversation ? handoffId : undefined);

	if (!isOpen) return null;

	return (
		<Dialog open={isOpen} onClose={onClose} title={handoff?.title || 'Handoff'}>
			<div className="handoff-detail-dialog">
				{isLoading && <div className="handoff-loading">Loading handoff…</div>}

				{error && (
					<div className="handoff-error">
						<p>Unable to load handoff</p>
						<p className="handoff-error__detail">{error instanceof Error ? error.message : String(error)}</p>
					</div>
				)}

				{handoff && (
					<>
						{/* Body Markdown */}
						{handoff.body && (
							<div className="handoff-detail__section">
								<Markdown>{handoff.body}</Markdown>
							</div>
						)}

						{/* Attachments */}
						{handoff.attachments && handoff.attachments.length > 0 && (
							<div className="handoff-detail__section">
								<h3 className="handoff-detail__heading">Attachments</h3>
								<div className="handoff-attachments">
									{handoff.attachments.map((att) => (
										<div key={att.id} className="handoff-attachment">
											<div className="handoff-attachment__path">
												<code>
													{att.repoPath}@{att.commitSha.substring(0, 7)}
												</code>
											</div>
											{att.note && <div className="handoff-attachment__note">{att.note}</div>}
										</div>
									))}
								</div>
							</div>
						)}

						{/* Conversation Transcript */}
						{handoff.hasConversation && conversationData && (
							<div className="handoff-detail__section">
								<h3 className="handoff-detail__heading">Conversation Transcript</h3>
								<div className="handoff-conversation">
									{conversationData.turns && conversationData.turns.length > 0 ? (
										conversationData.turns.map((turn) => (
											<div key={turn.id} className="handoff-turn">
												<div className="handoff-turn__header">
													<span className="handoff-turn__speaker">{turn.speaker}</span>
													{turn.verdict && (
														<span className="handoff-turn__verdict">
															Verdict: <strong>{turn.verdict}</strong>
														</span>
													)}
													<span className="handoff-turn__time">
														<RelativeTime value={turn.createdAt} />
													</span>
												</div>
												<div className="handoff-turn__content">{turn.content}</div>
											</div>
										))
									) : (
										<p className="handoff-conversation__empty">No turns yet.</p>
									)}
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</Dialog>
	);
}
