export const REGISTERED_FILTERS = ['json', 'default', 'truncate', 'fromjson'];
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function splitTopLevel(input, delimiter) {
    const parts = [];
    let current = '';
    let depth = 0;
    let quote = null;
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quote !== null) {
            current += char;
            if (char === quote && input[index - 1] !== '\\') {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (char === '(' || char === '[') {
            depth += 1;
            current += char;
            continue;
        }
        if (char === ')' || char === ']') {
            depth -= 1;
            current += char;
            continue;
        }
        if (depth === 0 && input.slice(index, index + delimiter.length) === delimiter) {
            parts.push(current.trim());
            current = '';
            index += delimiter.length - 1;
            continue;
        }
        current += char;
    }
    if (current.trim().length > 0) {
        parts.push(current.trim());
    }
    return parts;
}
function parsePath(expression) {
    const tokens = [];
    let cursor = 0;
    while (cursor < expression.length) {
        const char = expression[cursor];
        if (char !== undefined && /\s/.test(char)) {
            cursor += 1;
            continue;
        }
        if (char === '.') {
            cursor += 1;
            continue;
        }
        if (char === '[') {
            const end = expression.indexOf(']', cursor);
            if (end === -1) {
                throw new Error(`Unclosed bracket in expression '${expression}'`);
            }
            const raw = expression.slice(cursor + 1, end).trim();
            if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
                tokens.push(raw.slice(1, -1));
            }
            else if (/^-?\d+$/.test(raw)) {
                tokens.push(Number(raw));
            }
            else {
                tokens.push(raw);
            }
            cursor = end + 1;
            continue;
        }
        const match = expression.slice(cursor).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
        if (match === null) {
            throw new Error(`Invalid path segment in expression '${expression}'`);
        }
        tokens.push(match[0]);
        cursor += match[0].length;
    }
    return tokens;
}
function parseLiteral(expression) {
    const trimmed = expression.trim();
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
    return undefined;
}
function resolveReference(expression, scope) {
    const literal = parseLiteral(expression);
    if (literal !== undefined || expression.trim() === 'null') {
        return literal;
    }
    const path = parsePath(expression);
    if (path.length === 0) {
        return undefined;
    }
    const [root, ...rest] = path;
    const base = root === 'context'
        ? scope.context
        : root === 'run'
            ? scope.run
            : root === 'prev'
                ? scope.prev
                : root === 'nodes'
                    ? scope.nodes
                    : root === 'node'
                        ? scope.node
                        : root === 'inputs'
                            ? scope.inputs
                            : scope.context[String(root)];
    return rest.length === 0 ? base : rest.reduce((current, segment) => {
        if (current === undefined || current === null) {
            return undefined;
        }
        if (typeof segment === 'number') {
            return Array.isArray(current) ? current[segment] : undefined;
        }
        if (!isPlainObject(current)) {
            return undefined;
        }
        return current[segment];
    }, base);
}
function applyFilter(name, value, args) {
    switch (name) {
        case 'json':
            return JSON.stringify(value);
        case 'default':
            return value === undefined || value === null || value === '' ? args[0] : value;
        case 'truncate': {
            const text = String(value ?? '');
            const length = typeof args[0] === 'number' ? args[0] : Number(args[0] ?? 0);
            return text.slice(0, Math.max(0, length));
        }
        case 'fromjson':
            return JSON.parse(String(value ?? 'null'));
        default:
            throw new Error(`Filter '${name}' is not registered`);
    }
}
function evaluateSimpleCondition(expression, scope) {
    const trimmed = expression.trim();
    if (trimmed === '') {
        return false;
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed.includes(' or ')) {
        return splitTopLevel(trimmed, ' or ').some((segment) => evaluateSimpleCondition(segment, scope));
    }
    if (trimmed.includes(' and ')) {
        return splitTopLevel(trimmed, ' and ').every((segment) => evaluateSimpleCondition(segment, scope));
    }
    if (trimmed.startsWith('not ')) {
        return !evaluateSimpleCondition(trimmed.slice(4), scope);
    }
    for (const operator of ['==', '!=', '>=', '<=', '>', '<']) {
        const index = trimmed.indexOf(operator);
        if (index !== -1) {
            const left = resolveReference(trimmed.slice(0, index), scope);
            const right = resolveReference(trimmed.slice(index + operator.length), scope);
            switch (operator) {
                case '==':
                    return left === right;
                case '!=':
                    return left !== right;
                case '>=':
                    return Number(left) >= Number(right);
                case '<=':
                    return Number(left) <= Number(right);
                case '>':
                    return Number(left) > Number(right);
                case '<':
                    return Number(left) < Number(right);
            }
        }
    }
    const value = resolveReference(trimmed, scope);
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        return value.length > 0;
    }
    return scope.prev?.signal === trimmed || Boolean(value);
}
export function renderTemplate(template, context) {
    return template.replace(/\{\{\-?([\s\S]+?)\-?\}\}/g, (_match, body) => {
        const pieces = splitTopLevel(body.trim(), '|').map((piece) => piece.trim()).filter(Boolean);
        const [baseExpression = '', ...filters] = pieces;
        let value = resolveReference(baseExpression, context);
        for (const filterExpression of filters) {
            const [namePart = '', ...rest] = filterExpression.split(':');
            const name = namePart.trim();
            const args = rest.length === 0 ? [] : splitTopLevel(rest.join(':'), ',').map((entry) => resolveReference(entry.trim(), context));
            value = applyFilter(name, value, args);
        }
        return value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    });
}
export function evaluateGuardExpression(expression, context) {
    return evaluateSimpleCondition(expression, context);
}
export function listRegisteredFilters() {
    return [...REGISTERED_FILTERS];
}
