import { describe, expect, it } from 'vitest';
import { loadCmudict, parseCmudict } from '../src/verse/cmudict.ts';

describe('parseCmudict', () => {
  it('groups numbered variants under the base word in order', () => {
    const map = parseCmudict('read R EH1 D\nread(2) R IY1 D\nhello HH AH0 L OW1\n');
    expect(map.get('read')).toEqual([['R', 'EH1', 'D'], ['R', 'IY1', 'D']]);
    expect(map.get('hello')).toEqual([['HH', 'AH0', 'L', 'OW1']]);
  });

  it('drops comment lines, inline comments and blanks', () => {
    const map = parseCmudict(';;; header\n\naalen AE1 L AH0 N # place, german\r\n');
    expect([...map.keys()]).toEqual(['aalen']);
    expect(map.get('aalen')).toEqual([['AE1', 'L', 'AH0', 'N']]);
  });
});

describe('loadCmudict', () => {
  const dict = loadCmudict();

  it('loads a large dictionary', () => {
    expect(dict.size).toBeGreaterThan(120_000);
  });

  it('has one variant for hello starting with HH', () => {
    const variants = dict.get('hello')!;
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants[0][0]).toBe('HH');
  });

  it('keeps several variants for read and the', () => {
    expect(dict.get('read')!.length).toBeGreaterThan(1);
    expect(dict.get('the')!.length).toBeGreaterThan(1);
  });

  it('contains no comments or variant markers as keys', () => {
    for (const key of dict.keys()) {
      expect(key).not.toMatch(/^;|#|\(\d+\)$/);
    }
    expect(dict.get('aalen')![0]).not.toContain('#');
  });

  it('is cached: the same instance on every call', () => {
    expect(loadCmudict()).toBe(dict);
  });
});
