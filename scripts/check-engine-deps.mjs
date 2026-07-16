import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const engineRoot = path.join(root, 'packages', 'engine');
const enginePackageJsonPath = path.join(engineRoot, 'package.json');
const allowedWorkspaceDependency = '@relentless/schema';
const forbiddenWorkspaceDependencies = [
  '@relentless/persistence',
  '@relentless/executors',
  '@relentless/library',
  '@relentless/server'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const enginePackageJson = readJson(enginePackageJsonPath);
const dependencyEntries = Object.entries(enginePackageJson.dependencies ?? {});

for (const [name] of dependencyEntries) {
  if (forbiddenWorkspaceDependencies.includes(name)) {
    fail(`engine package.json must not depend on ${name}`);
  }
}

const allowedDependencies = new Set([allowedWorkspaceDependency]);
const importPattern = /(?:import\s+(?:type\s+)?[^'"`]*?from\s*|export\s+[^'"`]*?from\s*|import\s*\(\s*)(['"`])([^'"`]+)\1/g;
const requirePattern = /require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
const sourceFiles = [];

function collectSourceFiles(currentDir) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      sourceFiles.push(entryPath);
    }
  }
}

collectSourceFiles(path.join(engineRoot, 'src'));

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const pattern of [importPattern, requirePattern]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[2];
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const resolved = path.resolve(path.dirname(filePath), specifier);
        if (!resolved.startsWith(engineRoot + path.sep) && resolved !== engineRoot) {
          fail(`engine source imports outside its package: ${path.relative(root, filePath)} -> ${specifier}`);
        }
        continue;
      }
      if (specifier.startsWith('@relentless/')) {
        if (!allowedDependencies.has(specifier)) {
          fail(`engine source imports forbidden workspace package: ${path.relative(root, filePath)} -> ${specifier}`);
        }
      }
    }
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}