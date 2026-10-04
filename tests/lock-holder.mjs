// Test helper (not a test): take a set lock in a separate process, hold it, and log when it entered and left.
// Usage: node tests/lock-holder.mjs <project> <setId> <name> <holdMs> <heartbeatEveryMs|0> <logFile> [optionsJson]
// optionsJson may carry `"kind": "session"`: then <setId> names a reading session and its session lock is held instead;
// `"kind": "strikes"`: then <setId> is a strike folder key (the draft's strike lock).
import { appendFileSync } from 'node:fs';
import { withDirLock, withSetLock } from '../src/owner/fsutil.ts';
import { sessionDir, strikeDir } from '../src/owner/paths.ts';

const [project, id, name, holdMs, beatMs, log, optionsJson] = process.argv.slice(2);
const sleep = (/** @type {number} */ ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const note = (/** @type {string} */ what) => appendFileSync(log, `${what} ${name} ${Date.now()}\n`);

try {
  const { kind, ...lockOptions } = optionsJson ? JSON.parse(optionsJson) : {};
  const hold = (/** @type {{ heartbeat(): void }} */ ctx) => {
    note('enter');
    const end = Date.now() + Number(holdMs);
    while (Date.now() < end) {
      if (Number(beatMs) > 0) ctx.heartbeat();
      sleep(Number(beatMs) > 0 ? Number(beatMs) : 10);
    }
    note('exit');
  };
  if (kind === 'session') withDirLock(sessionDir(project, id), { noun: 'session', id, project }, hold, lockOptions);
  else if (kind === 'strikes') withDirLock(strikeDir(project, id), { noun: 'strikes', id, project }, hold, lockOptions);
  else withSetLock(project, id, hold, lockOptions);
} catch (e) {
  note('error');
  process.stderr.write(String(/** @type {any} */ (e).code ?? e) + '\n');
  process.exit(1);
}
