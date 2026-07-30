import { useState } from 'react';
import { Check, X, Play, FileText } from 'lucide-react';
import {
	Icon,
	Button,
	IconButton,
	Badge,
	Tag,
	Card,
	CardPad,
	CardEyebrow,
	CardTitle,
	CardBody,
	CardFooter,
	StatusBadge,
	StageStepper,
	Tabs,
	Select,
	Textarea,
	Dialog,
	Toast,
	type Status
} from '../ds';

const statuses: Status[] = ['draft', 'in_review', 'approved', 'denied', 'running'];
const badgeTones = ['neutral', 'accent', 'success', 'danger', 'info', 'outline'] as const;
const btnVariants = ['primary', 'secondary', 'ghost', 'success', 'danger'] as const;

/** Dev-only visual QA surface — renders every ds/ component + variant against the ported CSS. */
export function Gallery() {
	const [tab, setTab] = useState('one');
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 900 }}>
			<section>
				<h2>Buttons</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{btnVariants.map((v) => (
						<Button key={v} variant={v} icon={v === 'success' ? Check : v === 'danger' ? X : Play}>
							{v}
						</Button>
					))}
				</div>
			</section>

			<section>
				<h2>IconButtons</h2>
				<div style={{ display: 'flex', gap: 8 }}>
					<IconButton icon={Check} aria-label="approve" />
					<IconButton icon={X} aria-label="deny" solid />
				</div>
			</section>

			<section>
				<h2>Badges</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{badgeTones.map((t) => (
						<Badge key={t} tone={t}>
							{t}
						</Badge>
					))}
					<Tag onRemove={() => {}}>removable tag</Tag>
				</div>
			</section>

			<section>
				<h2>StatusBadge</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{statuses.map((s) => (
						<StatusBadge key={s} status={s} />
					))}
				</div>
			</section>

			<section>
				<h2>StageStepper</h2>
				<StageStepper
					steps={[
						{ key: 'requirements', label: 'Requirements' },
						{ key: 'design', label: 'Design' },
						{ key: 'tasks', label: 'Tasks' },
						{ key: 'implementation', label: 'Implementation' }
					]}
					currentKey="design"
				/>
			</section>

			<section>
				<h2>Tabs</h2>
				<Tabs
					tabs={[
						{ key: 'one', label: 'Requirements' },
						{ key: 'two', label: 'Design' },
						{ key: 'three', label: 'Tasks' }
					]}
					activeKey={tab}
					onChange={setTab}
				/>
			</section>

			<section>
				<h2>Card</h2>
				<Card style={{ maxWidth: 320 }}>
					<CardPad>
						<CardEyebrow>SPEC · #a1f3</CardEyebrow>
						<CardTitle>Structured logging pipeline</CardTitle>
						<CardBody>Sample card body text.</CardBody>
					</CardPad>
					<CardFooter>
						<Icon icon={FileText} />
						<span>footer</span>
					</CardFooter>
				</Card>
			</section>

			<section>
				<h2>Fields</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
					<Select label="Executor" hint="claude · sonnet · default" options={[{ value: 'claude', label: 'claude' }, { value: 'pi', label: 'pi' }]} />
					<Textarea label="Seed prompt" placeholder="The loose idea — what should exist that does not?" />
				</div>
			</section>

			<section>
				<h2>Toast</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
					<Toast tone="success" title="Trail charted" message="wayfinder-agent · web-ui" />
					<Toast tone="danger" title="Deny recorded" />
					<Toast tone="info" title="Refetching…" />
				</div>
			</section>

			<section>
				<h2>Dialog</h2>
				<Button variant="primary" onClick={() => setDialogOpen(true)}>
					Open dialog
				</Button>
				<Dialog
					open={dialogOpen}
					onClose={() => setDialogOpen(false)}
					title="Abort run"
					footer={
						<>
							<Button variant="ghost" onClick={() => setDialogOpen(false)}>
								Cancel
							</Button>
							<Button variant="danger" onClick={() => setDialogOpen(false)}>
								Abort run
							</Button>
						</>
					}
				>
					This will terminate the running node immediately. Audit row written in-transaction.
				</Dialog>
			</section>
		</div>
	);
}
