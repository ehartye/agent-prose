import { describe, expect, it } from 'vitest';
import { ProseError } from '../src/errors.ts';

describe('ProseError', () => {
  it('never lets details overwrite core fields', () => {
    const j = new ProseError('E_PARSE', 'm', { details: { code: 'X', line: 3 } }).toJson();
    expect(j.code).toBe('E_PARSE');
    expect(j.message).toBe('m');
    expect(j.line).toBe(3);
  });
});
