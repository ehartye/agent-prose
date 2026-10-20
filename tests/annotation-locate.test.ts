import { describe, expect, it } from 'vitest';
import { projectSource } from '../src/annotation/source.ts';
import { candidateFromId, locateCandidates, resolveTarget } from '../src/annotation/locate.ts';
const md = (text: string) => projectSource(text, { profile: 'markdown', documentId: 'lesson' });
describe('annotation literal location', () => {
  it('locates repeated terms without rebuilding Unicode indexes for every occurrence', () => {
    const p = md(Array(1000).fill('term').join(' '));
    const started = performance.now();
    const candidates = locateCandidates(p, { quote: 'term' });
    expect(candidates).toHaveLength(1000);
    for (const c of candidates) expect(candidateFromId(p, c.id)).toEqual(c);
    // A generous responsiveness bound catches the previous multi-second synchronous stall.
    expect(performance.now() - started).toBeLessThan(1500);
  });
  it('returns all repeated occurrences with stable snapshot-bound IDs and rejects ambiguity', () => {
    const p = md('A term appears.\n\nAnother term.');
    const candidates = locateCandidates(p, { quote: 'term' });
    expect(candidates).toHaveLength(2); expect(candidates[0].id).not.toBe(candidates[1].id);
    expect(resolveTarget(p, { quote: 'term' }).status).toBe('ambiguous');
    expect(candidateFromId(p, candidates[1].id)).toEqual(candidates[1]);
    expect(() => candidateFromId(md('A term changes.'), candidates[0].id)).toThrow(/stale|snapshot/i);
    expect(() => candidateFromId(p, 'made-up')).toThrow();
    expect(() => candidateFromId(projectSource('A term appears.\n\nAnother term.', { profile: 'markdown', documentId: 'other' }), candidates[0].id)).toThrow(/stale|snapshot/i);
  });
  it('finds an earlier short term independently of a later long term', () => {
    const p = md('Federalism and checks and balances work together.');
    expect(locateCandidates(p, { quote: 'Federalism' })[0].start).toBe(0);
    expect(locateCandidates(p, { quote: 'checks and balances' })).toHaveLength(1);
  });
  it('uses exact case and context and never treats alias matching as semantic disambiguation', () => {
    const p = md('Term one and term two.');
    expect(locateCandidates(p, { quote: 'term' })).toHaveLength(1);
    expect(locateCandidates(p, { quote: 'term', prefix: 'and ', suffix: ' two' })).toHaveLength(1);
    expect(locateCandidates(p, { quote: 'term', prefix: 'wrong' })).toHaveLength(0);
  });
  it('requires fragment, quote, block and positions to agree in the current binding', () => {
    const p = md('A [term]{#t} here.');
    expect(resolveTarget(p, { fragment: 't', quote: 'term', start: 2, end: 6 }).status).toBe('exact');
    expect(resolveTarget(p, { fragment: 't', quote: 'here' }).status).toBe('missing');
    expect(resolveTarget(p, { quote: 'term', start: 3, end: 7 }).status).toBe('missing');
    expect(resolveTarget(p, { quote: 'term', block: 'no-such-block' }).status).toBe('missing');
  });
  it('relocates unique text after a source change, retaining source-changed status', () => {
    const old = md('A term here.'); const current = md('Extra paragraph.\n\nA term here.');
    const result = resolveTarget(current, { quote: 'term', start: 2, end: 6, binding: { sourceDigest: old.sourceDigest, projectionDigest: old.digest } });
    expect(result.status).toBe('source-changed'); expect(result.range?.start).toBeGreaterThan(2);
  });
  it('rejects grapheme interiors including combining marks and emoji sequences', () => {
    const p = md('é 😀 👨‍👩‍👧');
    expect(resolveTarget(p, { quote: 'e' }).status).toBe('unsupported');
    expect(resolveTarget(p, { quote: '👨' }).status).toBe('unsupported');
    expect(resolveTarget(p, { quote: 'é' }).status).toBe('exact');
  });
  it('rejects targets crossing excluded regions but allows contiguous supported blocks', () => {
    const p = projectSource('<p>Before <code>no</code> after.</p>', { profile: 'html', documentId: 'lesson' });
    expect(resolveTarget(p, { start: 0, end: [...p.text].length }).status).toBe('unsupported');
    expect(resolveTarget(md('First\n\nSecond'), { quote: 'First\nSecond' }).status).toBe('exact');
  });
  it('never relocates positional-only selectors after a binding change', () => {
    const p = md('New text');
    expect(resolveTarget(p, { start: 0, end: 3, binding: { sourceDigest: 'old', projectionDigest: 'old' } }).status).toBe('source-changed');
    expect(resolveTarget(p, { quote: 'absent' }).status).toBe('missing');
  });
});
