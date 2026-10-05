import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDialog, readManifest } from '../src/dialog/import.ts';
import { readSource, patchSource } from '../src/dialog/source.ts';
import { tmpProject, useTmp } from './owner-helpers.ts';

useTmp();
const BRIDGE = `\uFEFF// keep this comment\r\nexport const LINE_MAX=150;\r\nexport const BRIDGE_DIALOG={cap:{headline:'CAP-0',voice:'crew',scene:[{id:'cap.1',speaker:'cap',tier:'story',text:"Same text.",variants:[{id:'cap.1#core',when:{flag:'core'},text:'Conditioned text.'}]}],topics:[{id:'cap.topic',tier:'info',once:true,label:'A topic',text:'Same text.',effects:[{flag:'seen',value:true}]}]}};\r\n`;

describe('dialogue source extraction', () => {
  it('keeps equal strings as distinct slots, state variants and protected context', () => {
    const { project, write } = tmpProject();
    const source = write('bridge.mjs', BRIDGE);
    const out = join(project, 'bridge.dialog.yaml'); const manifestPath = join(project, 'bridge.manifest.json');
    const result = importDialog(source, { root: project, out, manifest: manifestPath });
    const m = readManifest(manifestPath);
    expect(result.slots).toBe(5);
    expect(m.slots.filter(s => s.original === 'Same text.').map(s => s.id)).toEqual(['cap.1:text', 'cap.topic:text']);
    expect(m.slots.find(s => s.id === 'cap.1#core:text')).toMatchObject({ speaker: 'cap', limit: 150, context: { when: { flag: 'core' } } });
    expect(m.slots.find(s => s.id === 'cap.topic:text')?.context).toMatchObject({ once: true, effects: [{ flag: 'seen', value: true }] });
    expect(readFileSync(source, 'utf8')).toBe(BRIDGE);
  });
  it('patches only a selected literal and preserves quotes, BOM, CRLF and every outside byte', () => {
    const parsed = readSource('bridge.mjs', BRIDGE);
    const target = parsed.leaves.find(l => l.value === 'Conditioned text.')!;
    const result = patchSource(parsed, [{ path: target.path, old: target.value, text: "It's \\\"new\\\"." }]);
    expect(result).toBe(BRIDGE.replace("'Conditioned text.'", "'It\\'s \\\\\\\"new\\\\\\\".'"));
    expect(readSource('bridge.mjs', result).leaves.find(l => JSON.stringify(l.path) === JSON.stringify(target.path))?.value).toBe("It's \\\"new\\\".");
  });
  it('supports structural JSON and YAML paths, including repeated text and YAML comments', () => {
    for (const [file, text] of [['data.json', '{"nodes":[{"id":"a","speaker":"Pip","text":"Hello"},{"id":"b","speaker":"Pip","text":"Hello"}]}'], ['data.yaml', 'nodes:\n  - id: a\n    speaker: Pip\n    text: Hello # retained\n  - id: b\n    speaker: Pip\n    text: Hello\n']] as const) {
      const source = readSource(file, text);
      const leaf = source.leaves.find(l => JSON.stringify(l.path) === JSON.stringify(['nodes', 1, 'text']))!;
      const patched = patchSource(source, [{ path: leaf.path, old: 'Hello', text: 'Welcome: friend' }]);
      expect(readSource(file, patched).leaves.filter(l => l.path.at(-1) === 'text').map(l => l.value)).toEqual(['Hello', 'Welcome: friend']);
      if (file.endsWith('yaml')) expect(patched).toContain('# retained');
    }
  });
  it('never executes imported code and reports dynamic dialogue expressions', () => {
    const parsed = readSource('bad.mjs', "globalThis.__dialogRan = true; export const BRIDGE_DIALOG={cap:{scene:[{id:'a',speaker:'cap',text:fetch('https://invalid')} ]}};");
    expect(parsed.unsupported).toContainEqual(expect.objectContaining({ path: ['BRIDGE_DIALOG', 'cap', 'scene', 0, 'text'] }));
    expect((globalThis as Record<string, unknown>).__dialogRan).toBeUndefined();
    const { project, write } = tmpProject();
    expect(() => importDialog(write('bad.mjs', "export const BRIDGE_DIALOG={cap:{scene:[{id:'a',text:`Hi ${x}`} ]}};"), { out: join(project, 'out.dialog.yaml'), manifest: join(project, 'out.json') })).toThrow(/unsupported/i);
  });
  it('reads verified ambient data constructors without running functions', () => {
    const { project, write } = tmpProject();
    const source = write('ambient.mjs', "export const AMBIENT_LINE_MAX=96; const L=(id,kind,text,tags={})=>Object.freeze({id,kind,text,...tags}); const f=flag=>({flag}); export const POOLS=Object.freeze({cap:[L('cap-air','quip','Air is useful.',{when:f('motion.cruising'),mood:'quiet'})]});");
    const manifest = join(project, 'ambient.json');
    importDialog(source, { out: join(project, 'ambient.dialog.yaml'), manifest });
    expect(readManifest(manifest).slots[0]).toMatchObject({ id: 'cap-air:text', kind: 'bubble', limit: 96, context: { when: { flag: 'motion.cruising' }, mood: 'quiet' } });
  });
  it('refuses duplicate identities and overwriting existing output', () => {
    const { project, write } = tmpProject();
    const source = write('data.json', JSON.stringify({ nodes: [{ id: 'a', text: 'One' }, { id: 'a', text: 'Two' }] }));
    const opts = { out: join(project, 'out.dialog.yaml'), manifest: join(project, 'out.json') };
    expect(() => importDialog(source, opts)).toThrow(/duplicate/i);
    writeFileSync(source, JSON.stringify({ nodes: [{ id: 'a', text: 'One' }] }));
    importDialog(source, opts);
    expect(() => importDialog(source, opts)).toThrow(/exists/i);
  });
});
