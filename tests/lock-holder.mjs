// Test helper (not a test): take a set lock in a separate process, hold it, and log when it entered and left.
// Usage: node tests/lock-holder.mjs <project> <setId> <name> <holdMs> <heartbeatEveryMs|0> <logFile> [optionsJson]
import { appendFileSync } from 'node:fs';
import { withSetLock } from '../src/owner/fsutil.ts';

const [project, id, name, holdMs, beatMs, log, optionsJson] = process.argv.slice(2);
const sleep = (/** @type {number} */ ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const note = (/** @type {string} */ what) => appendFileSync(log, `${what} ${name} ${Date.now()}\n`);

try {
  withSetLock(project, id, ctx => {
    note('enter');
    const end = Date.now() + Number(holdMs);
    while (Date.now() < end) {
      if (Number(beatMs) > 0) ctx.heartbeat();
      sleep(Number(beatMs) > 0 ? Number(beatMs) : 10);
    }
    note('exit');
  }, optionsJson ? JSON.parse(optionsJson) : {});
} catch (e) {
  note('error');
  process.stderr.write(String(/** @type {any} */ (e).code ?? e) + '\n');
  process.exit(1);
}
