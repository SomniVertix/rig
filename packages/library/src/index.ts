import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { WorkflowDef } from '@relentless/schema';
import { WorkflowDefSchema } from '@relentless/schema';
import type { JsonValue as PersistenceJsonValue, Pool } from '@relentless/persistence';
import {
	resolvePrompt as resolvePromptRow,
	getWorkflow as getWorkflowRow,
	seedBundledPrompt,
	seedBundledWorkflow
} from '@relentless/persistence';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PromptLibraryEntry {
	id: string;
	body: string;
	description?: string;
	inputs?: Record<string, JsonValue>;
	defaults?: Record<string, JsonValue>;
	model?: string;
	tools?: string[];
}

export interface TemplateLibraryEntry {
	id: string;
	content: string;
}

export interface WorkflowLibraryEntry {
	id: string;
	workflow: WorkflowDef;
}

export interface ToolDef<Config = unknown, Input = unknown, Output = unknown> {
	name: string;
	description: string;
	parameters: JsonValue;
	execute: (ctx: { config: Config; input: Input; run: { id: string }; node: { id: string } }) => Promise<Output>;
}

export interface LibraryResolver {
	resolvePrompt(id: string): Promise<PromptLibraryEntry | null>;
	resolveTemplate(id: string): Promise<TemplateLibraryEntry | null>;
	resolveTool<Config = unknown, Input = unknown, Output = unknown>(id: string): Promise<ToolDef<Config, Input, Output> | null>;
	resolveWorkflow(id: string): Promise<WorkflowLibraryEntry | null>;
}

export interface LibraryResolverOptions {
	projectRoot?: string;
	globalRoot?: string;
	additionalSearchRoots?: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseScalar(raw: string): JsonValue {
	const trimmed = raw.trim();
	if (trimmed === 'true') {
		return true;
	}
	if (trimmed === 'false') {
		return false;
	}
	if (trimmed === 'null') {
		return null;
	}
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
		const inner = trimmed.slice(1, -1).trim();
		if (inner.length === 0) {
			return [];
		}
		return inner.split(',').map((entry) => parseScalar(entry));
	}
	return trimmed;
}

function parseFrontmatter(source: string): { frontmatter: Record<string, JsonValue>; body: string } {
	if (!source.startsWith('---')) {
		return { frontmatter: {}, body: source };
	}
	const end = source.indexOf('\n---', 3);
	if (end === -1) {
		return { frontmatter: {}, body: source };
	}
	const header = source.slice(3, end).trim();
	const body = source.slice(end + 4).replace(/^\r?\n/, '');
	const frontmatter: Record<string, JsonValue> = {};
	for (const line of header.split(/\r?\n/)) {
		const separator = line.indexOf(':');
		if (separator === -1) {
			continue;
		}
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		frontmatter[key] = parseScalar(value);
	}
	return { frontmatter, body };
}

function tryReadFile(filePath: string): Promise<string | null> {
	return fs.readFile(filePath, 'utf8').then(
		(contents) => contents,
		() => null
	);
}

async function resolveFirstExisting(paths: string[]): Promise<{ path: string; content: string } | null> {
	for (const candidate of paths) {
		const content = await tryReadFile(candidate);
		if (content !== null) {
			return { path: candidate, content };
		}
	}
	return null;
}

function searchRoots(projectRoot: string | undefined, globalRoot: string | undefined, subdir: string, id: string, extensions: string[]): string[] {
	const roots = [
		projectRoot ? resolve(projectRoot, '.relentless', subdir) : null,
		globalRoot ? resolve(globalRoot, subdir) : null
	].filter((entry): entry is string => entry !== null);
	const candidates: string[] = [];
	for (const root of roots) {
		for (const extension of extensions) {
			candidates.push(join(root, `${id}${extension}`));
		}
	}
	return candidates;
}

function defaultBundledRoot(): string {
	return resolve(process.cwd(), 'packages', 'library', 'bundled', 'global');
}

function parseWorkflowDocument(source: string): Record<string, unknown> {
	const trimmedSource = source.trim();
	if (trimmedSource.startsWith('{') || trimmedSource.startsWith('[')) {
		const parsed = JSON.parse(trimmedSource) as unknown;
		if (!isPlainObject(parsed)) {
			throw new Error('Workflow document must be an object');
		}
		return parsed;
	}

	const lines = source.split(/\r?\n/);
	const root: Record<string, unknown> = {};
	const stack: Array<{ indent: number; value: unknown; key?: string }> = [{ indent: -1, value: root }];

	const currentContainer = (): Record<string, unknown> | unknown[] => {
		const top = stack[stack.length - 1];
		if (top === undefined) {
			return root;
		}
		return top.value as Record<string, unknown> | unknown[];
	};

	for (const rawLine of lines) {
		if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith('#')) {
			continue;
		}
		const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
		const line = rawLine.trim();
		while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) {
			stack.pop();
		}
		const container = currentContainer();
		if (line.startsWith('- ')) {
			if (!Array.isArray(container)) {
				const array: unknown[] = [];
				if (stack.length > 0) {
					const parent = stack[stack.length - 1]!;
					if (isPlainObject(parent.value) && parent.key !== undefined) {
						(parent.value as Record<string, unknown>)[parent.key] = array;
					}
				}
				stack.push({ indent: indent - 2, value: array });
			}
			const arrayContainer = currentContainer();
			if (!Array.isArray(arrayContainer)) {
				throw new Error(`Invalid YAML sequence at: ${line}`);
			}
			const itemText = line.slice(2).trim();
			if (itemText.includes(': ')) {
				const item: Record<string, unknown> = {};
				arrayContainer.push(item);
				stack.push({ indent, value: item });
				const separator = itemText.indexOf(':');
				const key = itemText.slice(0, separator).trim();
				const value = itemText.slice(separator + 1).trim();
				item[key] = parseScalar(value);
				stack[stack.length - 1]!.key = key;
			} else {
				arrayContainer.push(parseScalar(itemText));
			}
			continue;
		}
		const separator = line.indexOf(':');
		if (separator === -1) {
			throw new Error(`Invalid YAML mapping entry: ${line}`);
		}
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		if (Array.isArray(container)) {
			const item: Record<string, unknown> = {};
			container.push(item);
			stack.push({ indent, value: item });
			item[key] = parseScalar(value);
			stack[stack.length - 1]!.key = key;
			continue;
		}
		(container as Record<string, unknown>)[key] = parseScalar(value);
		if (value === '') {
			const nested: Record<string, unknown> = {};
			(container as Record<string, unknown>)[key] = nested;
			stack.push({ indent, value: nested, key });
		}
	}

	return root;
}

function assertWorkflowShape(workflow: unknown): asserts workflow is WorkflowDef {
	if (!WorkflowDefSchema.safeParse(workflow).success) {
		throw new Error('Invalid workflow document');
	}
}

export class FileSystemLibraryResolver implements LibraryResolver {
	constructor(private readonly options: LibraryResolverOptions = {}) {}

	async resolvePrompt(id: string): Promise<PromptLibraryEntry | null> {
		const globalRoot = this.options.globalRoot ?? defaultBundledRoot();
		const found = await resolveFirstExisting([
			...searchRoots(this.options.projectRoot, globalRoot, 'agents', id, ['.md']),
			...searchRoots(this.options.projectRoot, globalRoot, 'prompts', id, ['.md']),
			...(this.options.additionalSearchRoots ?? []).flatMap((root) => [
				join(resolve(root), 'agents', `${id}.md`),
				join(resolve(root), 'prompts', `${id}.md`)
			])
		]);
		if (found === null) {
			return null;
		}
		const { frontmatter, body } = parseFrontmatter(found.content);
		const tools = frontmatter.tools;
		return {
			id,
			body,
			description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
			model: typeof frontmatter.model === 'string' ? frontmatter.model : undefined,
			tools: Array.isArray(tools) ? tools.map(String) : typeof tools === 'string' ? tools.split(',').map((entry) => entry.trim()).filter(Boolean) : undefined
		};
	}

	async resolveTemplate(id: string): Promise<TemplateLibraryEntry | null> {
		const globalRoot = this.options.globalRoot ?? defaultBundledRoot();
		const found = await resolveFirstExisting([
			...searchRoots(this.options.projectRoot, globalRoot, 'templates', id, ['.template.md', '.md']),
			...searchRoots(this.options.projectRoot, globalRoot, 'spec', id, ['.template.md', '.md']),
			...(this.options.additionalSearchRoots ?? []).flatMap((root) => [
				join(resolve(root), 'templates', `${id}.template.md`),
				join(resolve(root), 'templates', `${id}.md`),
				join(resolve(root), 'spec', `${id}.template.md`),
				join(resolve(root), 'spec', `${id}.md`)
			])
		]);
		return found === null ? null : { id, content: found.content };
	}

	async resolveTool<Config = unknown, Input = unknown, Output = unknown>(id: string): Promise<ToolDef<Config, Input, Output> | null> {
		const globalRoot = this.options.globalRoot ?? defaultBundledRoot();
		const found = await resolveFirstExisting([
			...searchRoots(this.options.projectRoot, globalRoot, 'tools', id, ['.ts', '.js']),
			...(this.options.additionalSearchRoots ?? []).flatMap((root) => [
				join(resolve(root), 'tools', `${id}.ts`),
				join(resolve(root), 'tools', `${id}.js`)
			])
		]);
		if (found === null) {
			return null;
		}
		const module = await import(pathToFileURL(found.path).href);
		const tool = (module.default ?? module.tool ?? module[id]) as ToolDef<Config, Input, Output> | undefined;
		return tool ?? null;
	}

	async resolveWorkflow(id: string): Promise<WorkflowLibraryEntry | null> {
		const globalRoot = this.options.globalRoot ?? defaultBundledRoot();
		const found = await resolveFirstExisting([
			...searchRoots(this.options.projectRoot, globalRoot, 'workflows', id, ['.yaml', '.yml']),
			...(this.options.additionalSearchRoots ?? []).flatMap((root) => [
				join(resolve(root), 'workflows', `${id}.yaml`),
				join(resolve(root), 'workflows', `${id}.yml`)
			])
		]);
		if (found === null) {
			return null;
		}
		const workflow = parseWorkflowDocument(found.content);
		assertWorkflowShape(workflow);
		return { id, workflow };
	}
}

export function createFileSystemLibraryResolver(options: LibraryResolverOptions = {}): LibraryResolver {
	return new FileSystemLibraryResolver(options);
}

/**
 * DB-backed `LibraryResolver` (Story 1.2, 2.1, 3.1, 4.4): prompts/agents and
 * workflows resolve from `@relentless/persistence`'s `library-store` (T3.1,
 * T3.2) instead of `.relentless/{agents,prompts,workflows}`. Templates/tools
 * remain file-based and continue to delegate to a `FileSystemLibraryResolver`
 * -- out of scope for DB-backing per this component's traceability.
 */
export interface PostgresLibraryResolverOptions {
	pool: Pool;
	/** The bound project id for shadowing resolution, or null/omitted for bundled-only (no project bound yet). */
	projectId?: string | null;
	fileSystemResolver?: LibraryResolver;
	fileSystemOptions?: LibraryResolverOptions;
}

export class PostgresLibraryResolver implements LibraryResolver {
	private readonly pool: Pool;
	private readonly projectId: string | null;
	private readonly fileSystemResolver: LibraryResolver;

	constructor(options: PostgresLibraryResolverOptions) {
		this.pool = options.pool;
		this.projectId = options.projectId ?? null;
		this.fileSystemResolver = options.fileSystemResolver ?? new FileSystemLibraryResolver(options.fileSystemOptions ?? {});
	}

	async resolvePrompt(id: string): Promise<PromptLibraryEntry | null> {
		const record = await resolvePromptRow(this.pool, this.projectId, id);
		if (record === null) {
			return null;
		}
		return {
			id: record.promptKey,
			body: record.body,
			description: record.description ?? undefined
		};
	}

	async resolveTemplate(id: string): Promise<TemplateLibraryEntry | null> {
		return await this.fileSystemResolver.resolveTemplate(id);
	}

	async resolveTool<Config = unknown, Input = unknown, Output = unknown>(id: string): Promise<ToolDef<Config, Input, Output> | null> {
		return await this.fileSystemResolver.resolveTool<Config, Input, Output>(id);
	}

	async resolveWorkflow(id: string): Promise<WorkflowLibraryEntry | null> {
		const record = await getWorkflowRow(this.pool, id);
		if (record === null) {
			return null;
		}
		const workflow = record.definition;
		assertWorkflowShape(workflow);
		return { id: record.id, workflow };
	}
}

export function createPostgresLibraryResolver(options: PostgresLibraryResolverOptions): LibraryResolver {
	return new PostgresLibraryResolver(options);
}

/**
 * Boot seed-if-absent pass (Story 13.3-13.5): scans
 * `packages/library/bundled/global/{agents,prompts,workflows}` and upserts
 * each as a project-less (`project_id IS NULL`), `origin='bundled'` row via
 * `ON CONFLICT DO NOTHING` (delegated to the persistence layer's
 * `seedBundledPrompt`/`seedBundledWorkflow`), so an existing row -- bundled
 * default or user-modified -- is never overwritten (Story 13.3), while a
 * bundled default absent on first boot is present after boot (Story 13.4).
 */
export interface SeedBundledLibraryOptions {
	globalRoot?: string;
}

async function listFilesWithExtensions(directory: string, extensions: string[]): Promise<string[]> {
	try {
		const entries = await fs.readdir(directory, { withFileTypes: true });
		return entries.filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.toLowerCase().endsWith(extension))).map((entry) => entry.name);
	} catch {
		return [];
	}
}

function stripExtension(fileName: string, extensions: string[]): string {
	for (const extension of extensions) {
		if (fileName.toLowerCase().endsWith(extension)) {
			return fileName.slice(0, fileName.length - extension.length);
		}
	}
	return fileName;
}

async function seedBundledPromptsFromDirectory(pool: Pool, directory: string, kind: string): Promise<void> {
	for (const fileName of await listFilesWithExtensions(directory, ['.md'])) {
		const promptKey = stripExtension(fileName, ['.md']);
		const content = await tryReadFile(join(directory, fileName));
		if (content === null) {
			continue;
		}
		const { frontmatter, body } = parseFrontmatter(content);
		const description = typeof frontmatter.description === 'string' ? frontmatter.description : null;
		await seedBundledPrompt(pool, { promptKey, kind, body, description });
	}
}

async function seedBundledWorkflowsFromDirectory(pool: Pool, directory: string): Promise<void> {
	for (const fileName of await listFilesWithExtensions(directory, ['.yaml', '.yml', '.json'])) {
		const id = stripExtension(fileName, ['.yaml', '.yml', '.json']);
		const content = await tryReadFile(join(directory, fileName));
		if (content === null) {
			continue;
		}
		const workflow = parseWorkflowDocument(content);
		await seedBundledWorkflow(pool, { id, definition: workflow as PersistenceJsonValue });
	}
}

export async function seedBundledLibrary(pool: Pool, options: SeedBundledLibraryOptions = {}): Promise<void> {
	const globalRoot = options.globalRoot ?? defaultBundledRoot();
	await seedBundledPromptsFromDirectory(pool, join(globalRoot, 'agents'), 'agent');
	await seedBundledPromptsFromDirectory(pool, join(globalRoot, 'prompts'), 'prompt');
	await seedBundledWorkflowsFromDirectory(pool, join(globalRoot, 'workflows'));
}

