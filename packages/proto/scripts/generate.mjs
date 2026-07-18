import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(process.cwd());
const protoPath = path.join(packageRoot, 'proto', 'rig.proto');
const generatedPath = path.join(packageRoot, 'src', 'generated', 'contracts.ts');

for (const filePath of [protoPath, generatedPath]) {
  fs.accessSync(filePath, fs.constants.R_OK);
}