import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkflowDefSchema } from '@relentless/schema';
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseScalar(raw) {
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
function parseFrontmatter(source) {
    if (!source.startsWith('---')) {
        return { frontmatter: {}, body: source };
    }
    const end = source.indexOf('\n---', 3);
    if (end === -1) {
        return { frontmatter: {}, body: source };
    }
    const header = source.slice(3, end).trim();
    const body = source.slice(end + 4).replace(/^\r?\n/, '');
    const frontmatter = {};
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
function tryReadFile(filePath) {
    return fs.readFile(filePath, 'utf8').then((contents) => contents, () => null);
}
async function resolveFirstExisting(paths) {
    for (const candidate of paths) {
        const content = await tryReadFile(candidate);
        if (content !== null) {
            return { path: candidate, content };
        }
    }
    return null;
}
function searchRoots(projectRoot, globalRoot, subdir, id, extensions) {
    const roots = [
        projectRoot ? resolve(projectRoot, '.relentless', subdir) : null,
        globalRoot ? resolve(globalRoot, subdir) : null
    ].filter((entry) => entry !== null);
    const candidates = [];
    for (const root of roots) {
        for (const extension of extensions) {
            candidates.push(join(root, `${id}${extension}`));
        }
    }
    return candidates;
}
function defaultBundledRoot() {
    return resolve(process.cwd(), 'packages', 'library', 'bundled', 'global');
}
function parseWorkflowDocument(source) {
    const trimmedSource = source.trim();
    if (trimmedSource.startsWith('{') || trimmedSource.startsWith('[')) {
        const parsed = JSON.parse(trimmedSource);
        if (!isPlainObject(parsed)) {
            throw new Error('Workflow document must be an object');
        }
        return parsed;
    }
    const lines = source.split(/\r?\n/);
    const root = {};
    const stack = [{ indent: -1, value: root }];
    const currentContainer = () => {
        const top = stack[stack.length - 1];
        if (top === undefined) {
            return root;
        }
        return top.value;
    };
    for (const rawLine of lines) {
        if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith('#')) {
            continue;
        }
        const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
        const line = rawLine.trim();
        while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const container = currentContainer();
        if (line.startsWith('- ')) {
            if (!Array.isArray(container)) {
                const array = [];
                if (stack.length > 0) {
                    const parent = stack[stack.length - 1];
                    if (isPlainObject(parent.value) && parent.key !== undefined) {
                        parent.value[parent.key] = array;
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
                const item = {};
                arrayContainer.push(item);
                stack.push({ indent, value: item });
                const separator = itemText.indexOf(':');
                const key = itemText.slice(0, separator).trim();
                const value = itemText.slice(separator + 1).trim();
                item[key] = parseScalar(value);
                stack[stack.length - 1].key = key;
            }
            else {
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
            const item = {};
            container.push(item);
            stack.push({ indent, value: item });
            item[key] = parseScalar(value);
            stack[stack.length - 1].key = key;
            continue;
        }
        container[key] = parseScalar(value);
        if (value === '') {
            const nested = {};
            container[key] = nested;
            stack.push({ indent, value: nested, key });
        }
    }
    return root;
}
function assertWorkflowShape(workflow) {
    if (!WorkflowDefSchema.safeParse(workflow).success) {
        throw new Error('Invalid workflow document');
    }
}
export class FileSystemLibraryResolver {
    constructor(options = {}) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
    }
    async resolvePrompt(id) {
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
    async resolveTemplate(id) {
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
    async resolveTool(id) {
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
        const tool = (module.default ?? module.tool ?? module[id]);
        return tool ?? null;
    }
    async resolveWorkflow(id) {
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
export function createFileSystemLibraryResolver(options = {}) {
    return new FileSystemLibraryResolver(options);
}
