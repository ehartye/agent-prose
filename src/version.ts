import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERSION: string = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')).version;
