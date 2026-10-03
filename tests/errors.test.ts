import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ProseError, RESERVED_ERROR_CODES } from '../src/errors.ts';

describe('ProseError', () => {
  it('never lets details overwrite core fields', () => {
    const j = new ProseError('E_PARSE', 'm', { details: { code: 'X', line: 3 } }).toJson();
    expect(j.code).toBe('E_PARSE');
    expect(j.message).toBe('m');
    expect(j.line).toBe(3);
  });
});

describe('error code lists', () => {
  it('has E_SERVER as an active code (the reading page emits it), no longer reserved', () => {
    expect(ERROR_CODES).toContain('E_SERVER');
    expect(RESERVED_ERROR_CODES).not.toContain('E_SERVER');
  });
  it('never lists a code as both active and reserved', () => {
    expect(ERROR_CODES.filter(c => RESERVED_ERROR_CODES.includes(c))).toEqual([]);
  });
});
