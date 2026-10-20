// A detached local server's only command-line data is its session ID and metadata directory. The token stays in its 0600 lifecycle file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startAnnotationPreview } from './workbench.ts';

const [id, from] = process.argv.slice(2);
if (!id || !from || !/^[a-f0-9-]{36}$/.test(id)) process.exit(1);
try {
  const record = JSON.parse(readFileSync(join(from, `${id}.json`), 'utf8')) as { file: string; port: number };
  const server = await startAnnotationPreview(record.file, { local: true, port: record.port, from, session: id });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void server.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch { process.exitCode = 1; }
