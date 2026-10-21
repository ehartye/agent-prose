import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { createAnnotationFile, inspectAnnotationFile, findCandidates, proposeAnnotations, decideAnnotation, compileAnnotations, setAnnotationAppearance } from '../src/annotation/store.ts';
import { resolveHighlightColor } from '../src/annotation/render.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'prose-annotations-')); dirs.push(dir);
  const source = join(dir, 'lesson.md');
  writeFileSync(source, '# Movement\n\nParticles spread by **diffusion**.\n\nAn unrelated final paragraph.\n');
  const concepts = join(dir, 'concepts.yaml');
  writeFileSync(concepts, stringify({ schema: 'prose/concepts@1', project: 'sample-science', language: 'en-US', concepts: [{ id: 'diffusion', label: 'Diffusion', definition: 'Net spreading from higher to lower concentration.', sources: [] }], lists: { core: ['diffusion'] } }));
  const file = join(dir, 'lesson.annotations.yaml');
  createAnnotationFile(source, file, { concepts });
  return { dir, source, file, concepts };
}
function proposed(file: string) {
  const located = findCandidates(file, { quote: 'diffusion' });
  return proposeAnnotations(file, [{ id: 'a-diffusion', kind: 'vocabulary', candidate: located.candidates[0].id, concept: 'diffusion', lists: ['core'], origin: { type: 'supplied' } }], { expectedRevision: located.revision });
}

describe('annotation authority and publication', () => {
  it('saves validated presentation hints without invalidating approval and publishes only public member identities', () => {
    const {file,source,concepts}=fixture();const original=readFileSync(source,'utf8');
    const registry=parse(readFileSync(concepts,'utf8'));registry.concepts[0].color='green';writeFileSync(concepts,stringify(registry));
    let current=proposed(file);
    current=proposeAnnotations(file,[{id:'__proto__',kind:'highlight',target:{quote:'diffusion'}}],{expectedRevision:current.revision});
    current=decideAnnotation(file,{id:'a-diffusion',action:'accept',expectedRevision:current.revision});
    const before=current.revision;
    const appearance={mode:'hybrid' as const,categories:{vocabulary:'blue' as const},concepts:{diffusion:'purple' as const},annotations:Object.fromEntries([['__proto__','pink' as const]])};
    current=setAnnotationAppearance(file,appearance,{expectedRevision:before,eventId:'colors-1'});
    expect(current.annotations[0].state).toBe('accepted');
    expect(Object.hasOwn(current.sidecar.appearance!.annotations!,'__proto__')).toBe(true);
    expect(current.sidecar.appearance!.annotations!.__proto__).toBe('pink');
    expect(setAnnotationAppearance(file,appearance,{expectedRevision:before,eventId:'colors-1'}).revision).toBe(current.revision);
    expect(()=>setAnnotationAppearance(file,{...appearance,mode:'category'},{expectedRevision:before})).toThrow();
    expect(()=>setAnnotationAppearance(file,{...appearance,categories:{concept:'url(javascript:bad)'}} as never)).toThrow();
    expect(()=>setAnnotationAppearance(file,{...appearance,concepts:{missing:'blue'}})).toThrow();
    const {bundle,html,report,webAnnotation}=compileAnnotations(file),doc=bundle.documents[0],annotation=bundle.annotations[0],concept=bundle.concepts[0];
    expect(doc.appearance?.concepts).toEqual({[concept.id]:'purple'});
    expect(doc.appearance?.annotations).toEqual({});
    expect(concept.color).toBe('green');
    expect(resolveHighlightColor(annotation,concept,doc.appearance)).toBe('purple');
    expect(resolveHighlightColor(annotation,concept,{...doc.appearance,mode:'category'})).toBe('blue');
    expect(resolveHighlightColor(annotation,undefined,{mode:'member'})).toBe('none');
    expect(html).toContain('data-prose-color="purple"');
    expect(report.warnings.some(w=>w.includes('color'))).toBe(false);
    expect(webAnnotation.report.warnings.some(w=>w.includes('color'))).toBe(true);
    expect(JSON.stringify(doc.appearance)).not.toContain('diffusion');
    expect(readFileSync(source,'utf8')).toBe(original);
  });
  it('persists proposals, explicit acceptance and portable publication without changing the source', () => {
    const { source, file, dir } = fixture(); const original = readFileSync(source, 'utf8');
    const proposal = proposed(file);
    expect(proposal.annotations[0].state).toBe('draft');
    expect(compileAnnotations(file).bundle.annotations).toHaveLength(0);
    const accepted = decideAnnotation(file, { id: 'a-diffusion', action: 'accept', expectedRevision: proposal.revision, eventId: 'accept-once' });
    expect(accepted.annotations[0].state).toBe('accepted');
    expect(inspectAnnotationFile(file).annotations[0].state).toBe('accepted');
    const compiled = compileAnnotations(file);
    expect(compiled.bundle.annotations).toHaveLength(1);
    expect(compiled.html).toContain('Diffusion');
    expect(compiled.html).toContain('<strong>');
    expect(JSON.stringify(compiled.bundle)).not.toContain(dir);
    expect(JSON.stringify(compiled.bundle)).not.toContain('accept-once');
    expect(readFileSync(source, 'utf8')).toBe(original);
  });
  it('rejects stale edits, deduplicates exact replay and preserves reject without a replacement', () => {
    const { file } = fixture(); const proposal = proposed(file);
    const decision = { id: 'a-diffusion', action: 'reject' as const, expectedRevision: proposal.revision, eventId: 'reject-once' };
    const rejected = decideAnnotation(file, decision);
    expect(rejected.annotations[0].state).toBe('rejected');
    expect(decideAnnotation(file, decision).revision).toBe(rejected.revision);
    expect(() => decideAnnotation(file, { id: 'a-diffusion', action: 'accept', expectedRevision: proposal.revision })).toThrow();
    expect(compileAnnotations(file).bundle.annotations).toEqual([]);
    const restored = decideAnnotation(file, { id: 'a-diffusion', action: 'undo', expectedRevision: rejected.revision });
    expect(restored.annotations[0].state).toBe('draft');
  });
  it('invalidates used definitions and manual payload edits without trusting an accepted flag', () => {
    const { file, concepts } = fixture(); const proposal = proposed(file);
    decideAnnotation(file, { id: 'a-diffusion', action: 'accept', expectedRevision: proposal.revision });
    const registry = parse(readFileSync(concepts, 'utf8')); registry.concepts[0].definition = 'A changed definition.';
    writeFileSync(concepts, stringify(registry));
    expect(inspectAnnotationFile(file).annotations[0].state).toBe('stale');
    expect(() => compileAnnotations(file)).toThrow();
    const stale = inspectAnnotationFile(file);
    decideAnnotation(file, { id: 'a-diffusion', action: 'accept', expectedRevision: stale.revision });
    const manual = parse(readFileSync(file, 'utf8')); manual.annotations[0].body = 'A manual replacement.';
    writeFileSync(file, stringify(manual));
    expect(inspectAnnotationFile(file).annotations[0].state).toBe('stale');
  });
  it('keeps unaffected acceptance across unrelated source and registry additions', () => {
    const { file, source, concepts } = fixture(); const proposal = proposed(file);
    decideAnnotation(file, { id: 'a-diffusion', action: 'accept', expectedRevision: proposal.revision });
    const registry = parse(readFileSync(concepts, 'utf8')); registry.concepts.push({ id: 'osmosis', label: 'Osmosis', definition: 'Another concept.' });
    writeFileSync(concepts, stringify(registry));
    writeFileSync(source, readFileSync(source, 'utf8') + '\nA distant appended paragraph.\n');
    expect(inspectAnnotationFile(file).annotations[0].state).toBe('accepted');
    expect(compileAnnotations(file).bundle.annotations).toHaveLength(1);
  });
  it('does not resolve repeated quotes by picking the first occurrence', () => {
    const { file, source } = fixture(); writeFileSync(source, 'diffusion appears.\n\nAnother diffusion appears.\n');
    const checked = proposeAnnotations(file, [{ id: 'ambiguous', kind: 'definition', target: { quote: 'diffusion' }, body: 'A definition.' }]);
    expect(checked.annotations[0].resolution.status).toBe('ambiguous');
    expect(() => decideAnnotation(file, { id: 'ambiguous', action: 'accept', expectedRevision: checked.revision })).toThrow();
  });
  it('refuses acceptance from a preview that has not seen a changed source or definition', () => {
    const {file,source,concepts}=fixture();const proposal=proposed(file);
    writeFileSync(source,readFileSync(source,'utf8').replace('Particles spread','Particles slowly spread'));
    expect(()=>decideAnnotation(file,{id:'a-diffusion',action:'accept',expectedRevision:proposal.revision})).toThrow();
    writeFileSync(source,'# Movement\n\nParticles spread by **diffusion**.\n\nAn unrelated final paragraph.\n');
    const refreshed=inspectAnnotationFile(file),registry=parse(readFileSync(concepts,'utf8'));
    registry.concepts[0].definition='A changed definition not yet reviewed.';writeFileSync(concepts,stringify(registry));
    expect(()=>decideAnnotation(file,{id:'a-diffusion',action:'accept',expectedRevision:refreshed.revision})).toThrow();
  });
  it('binds structured block identity and adapter version independently of unchanged displayed text',()=>{
    const dir=mkdtempSync(join(tmpdir(),'prose-block-bindings-'));dirs.push(dir);
    const source=join(dir,'lesson.json'),file=join(dir,'lesson.annotations.yaml');
    const snapshot={schema:'prose/structured-source@1',adapter:{id:'sample-course',version:'1'},documents:[{id:'movement',blocks:[{id:'p-one',kind:'paragraph',runs:[{text:'Particles move randomly.'}]}]}]};
    writeFileSync(source,JSON.stringify(snapshot));createAnnotationFile(source,file,{profile:'structured'});
    const candidate=findCandidates(file,{quote:'move'}).candidates[0];let current=proposeAnnotations(file,[{id:'h',kind:'highlight',candidate:candidate.id}]);
    current=decideAnnotation(file,{id:'h',action:'accept',expectedRevision:current.revision});
    snapshot.adapter.version='2';writeFileSync(source,JSON.stringify(snapshot));expect(inspectAnnotationFile(file).annotations[0].state).toBe('stale');
    current=inspectAnnotationFile(file);decideAnnotation(file,{id:'h',action:'accept',expectedRevision:current.revision});
    snapshot.documents[0].blocks[0].id='replacement';writeFileSync(source,JSON.stringify(snapshot));expect(inspectAnnotationFile(file).annotations[0].state).toBe('stale');
  });
});
