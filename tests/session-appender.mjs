// Test helper (not a test): append `count` play events to a reading session from this process.
// Usage: node tests/session-appender.mjs <project> <sessionId> <count> <index>
import { appendEvent } from '../src/reading/session.ts';

const [project, id, count, index] = process.argv.slice(2);
for (let k = 0; k < Number(count); k++) appendEvent(project, id, { type: 'play', index: Number(index), mode: 'speech' });
