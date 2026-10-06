// @ts-nocheck -- standalone Node skill helper; inputs and behavior are checked by tests/storyboard.test.ts.
import { readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const statuses = new Set(['playable', 'established', 'drafted', 'proposed']);
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = value => typeof value === 'string' && value.trim().length > 0;
const fail = message => { throw new Error(message); };
const array = (value, label) => { if (!Array.isArray(value)) fail(`${label} must be an array`); return value; };
const strings = (value, label) => { if (value !== undefined && array(value, label).some(v => !text(v))) fail(`${label} must contain nonempty strings`); };

function localFile(root, name, label, contained = false) {
  if (!text(name) || /^[a-z]+:/i.test(name)) fail(`${label} must be a local relative path`);
  const path = realpathSync(resolve(root, name));
  const rel = relative(realpathSync(root), path);
  if (contained && (isAbsolute(name) || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))) fail(`${label} must stay inside the board directory`);
  if (!statSync(path).isFile()) fail(`${label} must name a file`);
  return path;
}

export function validateBoard(board, root) {
  if (!board || board.schema !== 'prose/storyboard@1' || !text(board.title)) fail('Expected prose/storyboard@1 and a nonempty title');
  if (board.summary !== undefined && !text(board.summary)) fail('summary must be nonempty text');
  strings(board.notes, 'notes');
  const scenes = array(board.scenes, 'scenes');
  if (!scenes.length) fail('scenes must not be empty');
  const ids = new Set(), panelIds = new Set();
  const id = (value, label, used) => {
    if (!text(value) || !/^[a-zA-Z0-9_-]+$/.test(value) || used.has(value)) fail(`Invalid or duplicate ${label}: ${value}`);
    used.add(value);
  };
  for (const s of scenes) {
    if (!s || typeof s !== 'object') fail('Each scene must be an object');
    id(s.id, 'scene id', ids);
    if (!text(s.title) || !statuses.has(s.status)) fail(`Scene ${s.id} needs title and valid status`);
    strings(s.cast, `Scene ${s.id} cast`);
    strings(s.sources, `Scene ${s.id} sources`);
    for (const key of ['act', 'stake', 'outcome']) if (s[key] !== undefined && !text(s[key])) fail(`Scene ${s.id} ${key} must be nonempty text`);
    if (!array(s.panels, `Scene ${s.id} panels`).length) fail(`Scene ${s.id} needs panels`);
    for (const p of s.panels) {
      if (!p || typeof p !== 'object') fail(`Scene ${s.id} panel must be an object`);
      id(p.id, 'panel id', panelIds);
      if (!text(p.visual)) fail(`Panel ${p.id} needs visual text`);
      for (const key of ['shot', 'action', 'change', 'dialogue']) if (p[key] !== undefined && !text(p[key])) fail(`Panel ${p.id} ${key} must be nonempty text`);
      if (p.image !== undefined) {
        const path = localFile(root, p.image, `Panel ${p.id} image`, true);
        if (!mime[extname(path).toLowerCase()]) fail(`Panel ${p.id} image format is unsupported`);
      }
    }
    for (const source of s.sources ?? []) {
      if (/^https?:\/\//i.test(source)) { new URL(source); }
      else localFile(root, source, `Scene ${s.id} source`);
    }
  }
  for (const s of scenes) {
    strings(s.next, `Scene ${s.id} next`);
    for (const to of s.next ?? []) if (!ids.has(to)) fail(`Scene ${s.id} has missing next target ${to}`);
    if (s.choices !== undefined) for (const c of array(s.choices, `Scene ${s.id} choices`)) {
      if (!c || !text(c.text) || !ids.has(c.to)) fail(`Scene ${s.id} has invalid choice target or text`);
    }
  }
  const characterIds = new Set();
  if (board.characters !== undefined) for (const c of array(board.characters, 'characters')) {
    if (!c || typeof c !== 'object') fail('Each character must be an object');
    id(c.id, 'character id', characterIds);
    if (!text(c.name) || !array(c.quests, `Character ${c.id} quests`).length) fail(`Character ${c.id} needs name and quests`);
    if (c.board !== undefined && !ids.has(c.board)) fail(`Character ${c.id} has a missing storyboard target`);
    for (const q of c.quests) if (!q || !ids.has(q.scene) || !text(q.action) || !text(q.change)) fail(`Character ${c.id} has an invalid quest`);
  }
  return { ok: true, scenes: scenes.length, panels: panelIds.size, illustrated: scenes.flatMap(s => s.panels).filter(p => p.image).length, characters: characterIds.size };
}

export function renderBoard(board, root) {
  const report = validateBoard(board, root);
  const line = (label, value) => value ? `<p><b>${label}</b> ${escape(value)}</p>` : '';
  const link = (to, label) => `<a href="#scene-${escape(to)}">${escape(label)}</a>`;
  const image = p => p.image ? `<img src="data:${mime[extname(p.image).toLowerCase()]};base64,${readFileSync(localFile(root, p.image, 'image', true)).toString('base64')}" alt="${escape(p.visual)}" loading="lazy">` : '<div class="empty">Text-only frame · illustration not supplied</div>';
  const characterHTML = (board.characters ?? []).map(c => `<article class="character"><h3>${escape(c.name)}</h3>${c.board ? `<p>${link(c.board, 'View the character’s storyboard')}</p>` : ''}${line('Status', c.status)}${line('Personal stake', c.desire)}<ol>${c.quests.map(q => `<li>${link(q.scene, board.scenes.find(s => s.id === q.scene).title)}${line('Quest', q.action)}${line('Development', q.change)}</li>`).join('')}</ol>${line('Payoff', c.payoff)}</article>`).join('');
  const sceneHTML = board.scenes.map(s => `<article class="sequence" id="scene-${escape(s.id)}"><header><p class="eyebrow">${escape(s.act ?? 'Sequence')} <span class="status ${escape(s.status)}">${escape(s.status)}</span></p><h2><span>${escape(s.id)}</span> ${escape(s.title)}</h2>${line('Cast', s.cast?.join(' · '))}${line('Stake', s.stake)}</header><div class="panels">${s.panels.map((p, i) => `<figure>${image(p)}<figcaption><p class="shot">${i + 1} · ${escape(p.shot ?? 'Panel')}</p><p>${escape(p.visual)}</p>${line('Action', p.action)}${line('Change', p.change)}${line('Dialogue', p.dialogue)}</figcaption></figure>`).join('')}</div><div class="sequence-foot">${line('Outcome', s.outcome)}${s.choices?.length ? `<p><b>Directions / choices</b></p><ul>${s.choices.map(c => `<li>${link(c.to, c.text)}</li>`).join('')}</ul>` : ''}${s.next?.length ? `<p class="next">Next: ${s.next.map(to => link(to, board.scenes.find(n => n.id === to).title)).join(' · ')}</p>` : ''}${s.sources?.length ? `<details><summary>Story sources</summary><ul>${s.sources.map(source => `<li><a href="${escape(/^https?:\/\//i.test(source) ? source : pathToFileURL(localFile(root, source, 'source')).href)}">${escape(source.split('/').at(-1))}</a></li>`).join('')}</ul></details>` : ''}</div></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(board.title)}</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#0c1924;color:#e9efe8;font:16px/1.5 system-ui,sans-serif}a{color:#b6e3cc;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #ffd083;outline-offset:4px}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(1.7rem,3vw,2.6rem);line-height:1.12}h2{font-size:1.55rem;margin-bottom:12px}h2 span{color:#ffc778}b{color:#c1d1db}body>header{padding:28px 32px 22px;border-bottom:1px solid #37505e;background:#122735}.eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:.75rem;color:#b7c7ce}.summary{max-width:900px}.layout{display:grid;grid-template-columns:240px minmax(0,1fr);max-width:1720px;margin:auto}nav{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:24px 20px}nav a{display:block;font-size:.87rem;margin-bottom:9px}main{min-width:0;padding:24px 28px 70px}.notes{padding:18px 24px;background:#152b37;border-left:3px solid #d9b678;margin-bottom:25px}.notes li{margin:6px 0}.sequence{scroll-margin-top:16px;margin-bottom:30px;border:1px solid #355060;border-radius:12px;overflow:hidden;background:#152532}.sequence>header{padding:22px 24px 6px}.sequence>header p{font-size:.94rem}.status{font-size:.72rem;letter-spacing:.02em;border:1px solid #627c90;padding:3px 8px;border-radius:14px;margin-left:8px;color:#c9dbe8}.status.playable{border-color:#64ae89;color:#b8edcc}.status.drafted{border-color:#c9a456;color:#ffe0a6}.panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#355060}figure{margin:0;min-width:0;background:#132532}img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;background:#0a1822;image-rendering:pixelated}figcaption{padding:16px 18px;font-size:.89rem}figcaption p{margin-bottom:10px}.shot{font-weight:700;color:#ffcf86}.sequence-foot{padding:18px 24px;font-size:.92rem}.sequence-foot ul{margin:8px 0 15px;padding-left:20px}.sequence-foot li{margin:4px 0}.next{color:#afc1cc;font-size:.83rem}summary{cursor:pointer;color:#b6c7d0}.sequence-foot details ul{overflow-wrap:anywhere}.empty{aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed #67808e;font-size:.9rem;padding:20px;color:#aabac4}.characters{scroll-margin-top:16px}.character-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.character{padding:22px;background:#152b37;border:1px solid #365364;border-radius:10px}.character ol{padding-left:22px}.character li{margin-bottom:18px}.character p{font-size:.92rem}.character h3{color:#ffcf86;font-size:1.25rem}.skip{position:absolute;top:-100px}.skip:focus{top:8px;left:8px;background:#152b37;padding:10px}.top-links{display:flex;flex-wrap:wrap;gap:20px}.stat{color:#bfd3de}.footer{padding:20px;color:#a8becb;font-size:.85rem}
@media(max-width:1050px){.layout{grid-template-columns:185px minmax(0,1fr)}main{padding:18px}.panels{grid-template-columns:1fr}figure{display:grid;grid-template-columns:1fr 1fr;align-items:start}.character-grid{grid-template-columns:1fr}}
@media(max-width:650px){body>header{padding:22px 18px}.layout{display:block}nav{position:static;max-height:200px;border-bottom:1px solid #37505e;padding:18px}nav a{font-size:1rem}main{padding:16px 10px}figure{display:block}.sequence>header,.sequence-foot{padding:18px}.character{padding:18px}.notes{padding:16px}.top-links{gap:14px}}
@media print{body{background:white;color:#111;font-size:10pt}body>header,main{padding:0}.layout{display:block}nav,.top-links,.notes,details{display:none}.sequence{background:white;border:1px solid #aaa;break-inside:avoid;page-break-inside:avoid;margin:12px 0}.panels{grid-template-columns:repeat(3,minmax(0,1fr));background:white}figure{display:block;background:white}img{background:white}a,b,h2 span,.shot,.eyebrow,.character h3{color:#222}.sequence>header,.sequence-foot,figcaption{padding:10px}.character{background:white;color:#111;break-inside:avoid}.character-grid{display:block}.status{color:#222!important;border-color:#666!important}.footer{color:#222}}
</style></head><body><a class="skip" href="#sequences">Skip to storyboards</a><header><p class="eyebrow">Visual storytelling · editable planning draft</p><h1>${escape(board.title)}</h1>${line('', board.summary)}<p class="stat">${report.scenes} sequences · ${report.panels} panels · ${report.illustrated} illustrations · ${report.characters} character tracks</p><div class="top-links"><a href="#sequences">Campaign storyboards</a>${characterHTML ? '<a href="#characters">Character quest arcs</a>' : ''}<a href="javascript:window.print()">Print / save PDF</a></div></header><div class="layout"><nav aria-label="Storyboard sequences">${board.scenes.map(s => link(s.id, `${s.id} · ${s.title}`)).join('')}${characterHTML ? '<a href="#characters">Character quest arcs</a>' : ''}</nav><main id="sequences">${board.notes?.length ? `<aside class="notes"><b>Scope and story status</b><ul>${board.notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul></aside>` : ''}${sceneHTML}${characterHTML ? `<section class="characters" id="characters"><p class="eyebrow">Personal development through quests</p><h2>Character tracks</h2><p>These tracks propose personal stakes, consequential participation and visible later development. Linked sequences show where they cross the main progression.</p><div class="character-grid">${characterHTML}</div></section>` : ''}<p class="footer">Editable storyboard source: prose/storyboard@1. Structural validation does not establish canon, playable behavior or final-art fidelity.</p></main></div></body></html>`;
}

export function main(args) {
  const [command, file, ...rest] = args;
  if (!['validate', 'render'].includes(command) || !file) fail('Usage: board.mjs validate <board.json> | render <board.json> --out <new.html>');
  if (command === 'validate' && rest.length) fail('validate takes only a board path');
  if (command === 'render' && (rest.length !== 2 || rest[0] !== '--out' || !rest[1])) fail('render requires --out <new.html>');
  const board = JSON.parse(readFileSync(file, 'utf8'));
  const root = dirname(resolve(file));
  const report = validateBoard(board, root);
  if (command === 'render') {
    const html = renderBoard(board, root);
    writeFileSync(rest[1], html, { flag: 'wx' });
    return { ...report, output: resolve(rest[1]) };
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (error) { console.error(JSON.stringify({ error: { code: 'E_STORYBOARD', message: error.message } })); process.exitCode = 1; }
}
