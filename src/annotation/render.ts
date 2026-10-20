import type { PublicationBundle, PublishedAnnotation, PublishedDocument } from './types.ts';

export interface ConsumerRun { text: string; start: number; end: number; marks: Array<'strong'|'em'>; href?: string; annotations: PublishedAnnotation[] }
export interface ConsumerBlock { id: string; kind: string; start: number; end: number; level?:number;listDepth?:number;listType?:'ordered'|'unordered';listStart?:number;listItem?:string;runs: ConsumerRun[] }
export interface ConsumerOptions { context?: 'reading'|'assessment' }
const esc = (value: string): string => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const cut = (text: string, start: number, end: number): string => Array.from(text).slice(start,end).join('');
function safeHref(value: string): boolean {
  if (/[\u0000-\u0020]/u.test(value)) return false;
  try { return ['http:','https:'].includes(new URL(value,'https://example.invalid/').protocol); } catch { return false; }
}
/** Pure browser-compatible consumer boundary: escaped text, no filesystem or framework. */
export function planAnnotationRuns(bundle: PublicationBundle, documentId: string, options: ConsumerOptions = {}): ConsumerBlock[] {
  if(bundle.schema!=='prose/annotation-bundle@1'||bundle.projection!=='prose/annotation-text@1')throw new Error('Unsupported publication bundle or projection version');
  const document = bundle.documents.find(d=>d.id===documentId); if(!document) throw new Error('Unknown publication document');
  if(document.projectionVersion&&document.projectionVersion!=='prose/annotation-text@1')throw new Error('Unsupported document projection version');
  const annotations = options.context==='assessment' ? [] : bundle.annotations.filter(a=>a.document===document.id);
  return document.blocks.map(block=>{
    const applicable = annotations.filter(a=>a.target.start<block.end && a.target.end>block.start);
    const boundaries = new Set([block.start,block.end]);
    for(const run of block.runs){boundaries.add(run.start);boundaries.add(run.end);}
    for(const a of applicable){boundaries.add(Math.max(a.target.start,block.start));boundaries.add(Math.min(a.target.end,block.end));}
    for(const target of [...Object.values(document.targets),...Object.values(document.fragments)]) if(target.start>=block.start && target.start<=block.end)boundaries.add(target.start);
    const ordered=[...boundaries].sort((a,b)=>a-b);const runs:ConsumerRun[]=[];
    for(let i=0;i<ordered.length-1;i++){
      const start=ordered[i],end=ordered[i+1];if(end<=start)continue;
      const original=block.runs.find(r=>r.start<=start && r.end>=end);
      runs.push({text:cut(document.text,start,end),start,end,marks:original?.marks??[],...(original?.href?{href:original.href}:{}),annotations:applicable.filter(a=>a.target.start<=start && a.target.end>=end)});
    }
    return {id:block.id,kind:block.kind,start:block.start,end:block.end,...(block.level?{level:block.level}:{}),...(block.listDepth?{listDepth:block.listDepth}:{}),...(block.listType?{listType:block.listType}:{}),...(block.listStart!==undefined?{listStart:block.listStart}:{}),...(block.listItem?{listItem:block.listItem}:{}),runs};
  });
}
function destinationHref(bundle: PublicationBundle, destination: PublishedAnnotation['destination']): string|null {
  if(!destination)return null;if('url' in destination)return safeHref(destination.url)?destination.url:null;
  const doc=bundle.documents.find(d=>d.id===destination.document);if(!doc)return null;
  const target=destination.target&&Object.hasOwn(doc.targets,destination.target)?doc.targets[destination.target]:undefined;
  if(destination.target&&!target)return null;
  const fragment=target?`passage-${target.id}`:destination.fragment?`fragment-${doc.id}-${destination.fragment}`:`document-${doc.id}`;
  return '#'+fragment;
}
function anchorsAt(document: PublishedDocument, position: number): string {
  const targets=Object.values(document.targets).filter(t=>t.start===position).map(t=>`<span id="passage-${esc(t.id)}" tabindex="-1"></span>`);
  const fragments=Object.entries(document.fragments).filter(([,t])=>t.start===position).map(([id])=>`<span id="fragment-${esc(document.id)}-${esc(id)}" tabindex="-1"></span>`);
  return [...targets,...fragments].join('');
}
export function renderPublication(bundle: PublicationBundle, options: ConsumerOptions = {}): string {
  const active=options.context==='assessment'?[]:bundle.annotations;
  const sections=bundle.documents.map(document=>{
    const blocks=planAnnotationRuns(bundle,document.id,options);
    const listStack:Array<{tag:'ol'|'ul';start?:number;item?:string}>=[];
    const closeList=():string=>{const level=listStack.pop()!;return `</li></${level.tag}>`;};
    const pieces=blocks.map(block=>{
      const body=block.runs.map(run=>{
        let text=esc(run.text).replaceAll('\n','<br>');
        for(const mark of run.marks)text=mark==='strong'?`<strong>${text}</strong>`:`<em>${text}</em>`;
        if(run.href&&safeHref(run.href)){const href=run.href.startsWith('#')?`#fragment-${document.id}-${run.href.slice(1)}`:run.href;text=`<a href="${esc(href)}" rel="noopener noreferrer">${text}</a>`;}
        if(run.annotations.length){const ids=run.annotations.map(a=>a.id).join(' ');text=run.annotations.some(a=>a.kind==='highlight')?`<mark data-prose-annotations="${esc(ids)}">${text}</mark>`:`<span data-prose-annotations="${esc(ids)}">${text}</span>`;}
        return anchorsAt(document,run.start)+text;
      }).join('')+anchorsAt(document,block.end);
      const related=active.filter(a=>a.document===document.id&&a.target.start<block.end&&a.target.end>block.start);
      const notes=related.map(a=>`<a class="annotation-control" href="#note-${esc(a.id)}" aria-label="${esc(a.kind)}: ${esc(a.target.quote)}">[${esc(a.handle)}]</a>`).join(' ');
      const inner=`<span class="base-text">${body}</span>${notes?` <span class="annotation-controls">${notes}</span>`:''}`;
      let prefix='';
      if(block.kind==='list-item'){
        const depth=Math.min(block.listDepth??1,listStack.length+1),tag=block.listType==='ordered'?'ol':'ul',start=tag==='ol'?(block.listStart??1):undefined;
        const item=block.listItem??block.id;
        while(listStack.length>depth)prefix+=closeList();
        if(listStack.length===depth){const level=listStack.at(-1)!;if(level.tag===tag&&level.start===start){if(level.item===item)return prefix+`<p data-prose-block="${esc(block.id)}">${inner}</p>`;prefix+='</li>';}else prefix+=closeList();}
        if(listStack.length<depth){prefix+=`<${tag}${start!==undefined?` start="${start}"`:''}>`;listStack.push({tag,start});}
        listStack.at(-1)!.item=item;
        return prefix+`<li><p data-prose-block="${esc(block.id)}">${inner}</p>`;
      }
      while(listStack.length)prefix+=closeList();
      const tag=block.kind==='blockquote'?'blockquote':block.kind==='heading'?`h${block.level??2}`:'p';
      return `${prefix}<${tag} data-prose-block="${esc(block.id)}">${inner}</${tag}>`;
    });
    while(listStack.length)pieces.push(closeList());
    const content=pieces.join('\n');
    return `<article id="document-${esc(document.id)}" data-prose-document="${esc(document.id)}" lang="${esc(document.language)}" dir="${document.direction??'auto'}">${content}</article>`;
  }).join('\n');
  const notes=active.map(a=>{
    const concept=bundle.concepts.find(c=>c.id===a.concept);const href=destinationHref(bundle,a.destination);
    const title=concept?.label??a.kind;
    const body=a.body??concept?.definition??'';
    const sources=(a.sources??[]).filter(safeHref).map(url=>`<a href="${esc(url)}" rel="noopener noreferrer">Source</a>`).join(' ');
    return `<aside id="note-${esc(a.id)}" role="note" tabindex="-1"><p><strong>${esc(title)}.</strong> ${esc(body)}${href?` <a href="${esc(href)}" rel="noopener noreferrer">Open reference</a>`:''}</p>${sources?`<p>${sources}</p>`:''}</aside>`;
  }).join('\n');
  return `<!doctype html><html lang="${esc(bundle.documents[0]?.language??'und')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Annotated reading</title><style>body{max-width:76ch;margin:2rem auto;padding:0 1rem;line-height:1.65;font-family:system-ui,sans-serif;color:#172638}mark{background:#fff0a8;color:inherit}.annotation-control{font-size:.8em}aside{border-top:1px solid #b7c3cf;padding-top:1rem;margin-top:1.5rem}a{color:#185c97}:focus{outline:3px solid #c77e1c;outline-offset:3px}@media print{.annotation-controls{font-size:.8em}a{color:inherit}aside{break-inside:avoid}}</style></head><body>${sections}<section aria-label="Annotation notes">${notes}</section></body></html>`;
}
