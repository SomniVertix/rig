import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Without `test.globals: true`, @testing-library/react's own afterEach-based
// auto-cleanup never wires up — a render left mounted from an earlier test
// in the same file can silently swallow a later test's query/click.
afterEach(() => cleanup());

// jsdom doesn't implement ResizeObserver; @xyflow/react measures its
// container with one on mount, so component tests need a stub.
class ResizeObserverStub implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
