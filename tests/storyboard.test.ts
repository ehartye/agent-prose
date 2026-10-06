import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Standalone skill helper deliberately has no managed-runtime dependencies.
import { validateBoard, renderBoard, main } from '../skills/prose-storyboard/scripts/board.mjs';

const board = () => ({ schema: 'prose/storyboard@1', title: 'A crossing <test>', scenes: [
  { id: 'arrival', title: 'Arrive', status: 'drafted', panels: [{ id: 'wide', visual: '<script>alert(1)</script>', image: 'panel.svg' }], choices: [{ text: 'Keep investigating', to: 'arrival' }], next: ['arrival'], sources: ['source.md'] }
], characters: [{ id: 'keeper', name: 'Keeper', quests: [{ scene: 'arrival', action: 'Measure', change: 'Learn' }] }] });
function fixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'prose-board-'));
  try { writeFileSync(join(root, 'panel.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>'); writeFileSync(join(root, 'source.md'), 'source'); run(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
test('renders a portable board with embedded art, escaped captions and connected character quests', () => fixture(root => {
  const html = renderBoard(board(), root);
  expect(html).toContain('data:image/svg+xml;base64,');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('href="#scene-arrival"');
  expect(html).toContain('Keeper');
  expect(validateBoard(board(), root)).toEqual({ ok: true, scenes: 1, panels: 1, illustrated: 1, characters: 1 });
}));
test.each(['choice', 'next', 'quest'])('rejects a broken %s target', key => fixture(root => {
  const data = board();
  if (key === 'choice') data.scenes[0].choices[0].to = 'missing';
  if (key === 'next') data.scenes[0].next[0] = 'missing';
  if (key === 'quest') data.characters[0].quests[0].scene = 'missing';
  expect(() => validateBoard(data, root)).toThrow();
}));
test('rejects duplicate panel identities and unsupported canon status', () => fixture(root => {
  const data = board(); data.scenes[0].panels.push({ ...data.scenes[0].panels[0] });
  expect(() => validateBoard(data, root)).toThrow(/duplicate/);
  data.scenes[0].panels.pop(); data.scenes[0].status = 'shipped';
  expect(() => validateBoard(data, root)).toThrow(/status/);
}));
test('rejects missing art and remote image paths', () => fixture(root => {
  const data = board(); data.scenes[0].panels[0].image = 'missing.png';
  expect(() => validateBoard(data, root)).toThrow();
  data.scenes[0].panels[0].image = 'https://example.com/image.png';
  expect(() => validateBoard(data, root)).toThrow(/local/);
}));
test('refuses path traversal for art and refuses overwriting an existing deliverable', () => fixture(root => {
  const data = board(); data.scenes[0].panels[0].image = '../other.svg';
  expect(() => validateBoard(data, root)).toThrow();
  const input = join(root, 'board.json'), output = join(root, 'board.html');
  writeFileSync(input, JSON.stringify(board())); writeFileSync(output, 'owner content');
  expect(() => main(['render', input, '--out', output])).toThrow();
  expect(readFileSync(output, 'utf8')).toBe('owner content');
}));
test('allows clearly identified text-only panels when no image is supplied', () => fixture(root => {
  const data: any = board(); delete data.scenes[0].panels[0].image;
  expect(renderBoard(data, root)).toContain('Text-only frame');
  expect(validateBoard(data, root).illustrated).toBe(0);
}));
