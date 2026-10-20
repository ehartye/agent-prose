// Annotation review mode for the shared proof desk. Only this controller knows annotation decisions.
(function(){
 'use strict';
 const UI=window.ProseReview;
 UI.registerMode('annotations',()=>{
 const {h}=UI;
 const colors=['yellow','green','blue','purple','pink','orange'];
 const categories={highlight:'Highlights',vocabulary:'Vocabulary',concept:'Concepts',definition:'Definitions',explanation:'Explanations',link:'Links'};
 function colorOptions(){return colors.map(color=>h('option',{value:color,text:color[0].toUpperCase()+color.slice(1)}));}
 document.getElementById('review-mode-settings').append(h('fieldset',{class:'annotation-color-settings',disabled:true},
   h('legend',{text:'Annotation highlighting'}),
   h('label',{},'Highlighting',h('select',{id:'highlight-mode','data-highlight-control':'1'},h('option',{value:'category',text:'Category'}),h('option',{value:'member',text:'Member'}),h('option',{value:'hybrid',text:'Hybrid'}))),
   h('p',{class:'quiet',text:'Category uses kind colors. Member uses concept or annotation colors. Hybrid prefers member colors and falls back to category colors.'}),
   h('label',{},'Category',h('select',{id:'color-category'},...Object.entries(categories).map(([value,label])=>h('option',{value,text:label})))),
   h('label',{},'Category color',h('select',{id:'category-color','data-highlight-control':'1'},h('option',{value:'',text:'Default color'}),...colorOptions())),
   h('p',{class:'quiet',text:'Colors and highlighting mode are saved with this document and included as publication hints.'})
 ));
 document.title='Annotations | Prose review';
 document.getElementById('title').textContent='Annotation review';
 document.getElementById('subtitle').textContent='Review exact passages and publish approved notes.';
 document.getElementById('desk').classList.add('batch');
 const rail=document.getElementById('rail');rail.hidden=false;rail.setAttribute('aria-label','Annotation queue');rail.tabIndex=0;
 rail.replaceChildren(h("h2",{},
"Annotations ",
h("span",{"id":"count"})),
h("div",{"class":"annotation-filters"},
h("label",{},
"Review state",
h("select",{"id":"state-filter"},
h("option",{"value":""},
"All states"),
h("option",{},
"draft"),
h("option",{},
"accepted"),
h("option",{},
"rejected"),
h("option",{},
"deferred"),
h("option",{},
"stale"))),
h("label",{},
"Kind",
h("select",{"id":"kind-filter"},
h("option",{"value":""},
"All kinds"),
h("option",{},
"highlight"),
h("option",{},
"vocabulary"),
h("option",{},
"concept"),
h("option",{},
"definition"),
h("option",{},
"explanation"),
h("option",{},
"link"))),
h("label",{},
"Vocabulary list",
h("select",{"id":"list-filter"},
h("option",{"value":""},
"All lists")))),
h("nav",{"id":"queue","aria-label":"Select an annotation"}));
 const views=document.getElementById('views');views.hidden=false;views.replaceChildren(UI.button("Plain",()=>{},"",{"type":"button","data-mode":"plain","aria-pressed":"false"}),
UI.button("Annotated",()=>{},"",{"type":"button","data-mode":"annotated","aria-pressed":"true"}),
UI.button("Publication",()=>{},"",{"type":"button","data-mode":"publication","aria-pressed":"false"}));
 document.querySelector('.site-head').append(h('div',{class:'row annotation-session'},h('span',{id:'session-state',class:'quiet',text:'Opening...'}),UI.button('Reload source',()=>{},'',{id:'reload'}),UI.button('Close review',()=>{},'',{id:'close'})));
 document.getElementById('app').replaceChildren(h('div',{class:'annotation-layout'},h("section",{"class":"annotation-source card","aria-label":"Source reading pane","tabindex":"0"},
h("div",{"class":"reading-head"},
h("h2",{"id":"document-title"},
"Source")),
h("p",{"id":"source-note","class":"quiet"},
"The source remains unchanged. Select an annotation to inspect its passage."),
h("article",{"id":"source","class":"reading"}),
h("iframe",{"id":"publication","title":"Publication preview","sandbox":"","hidden":true}),
h("div",{"id":"diagnostics","class":"quiet"})),h("aside",{"class":"annotation-details card","aria-label":"Annotation details","tabindex":"0"},
h("h2",{"id":"detail-title"},
"Review a passage"),
h("p",{"id":"empty-detail"},
"Choose an annotation from the queue. Unresolved entries stay available for review."),
h("div",{"id":"detail","hidden":true},
h("div",{"class":"row"},
h("span",{"id":"state-label"}),
h("span",{"id":"resolution-label"})),
h("section",{"id":"review-changes","class":"panel","aria-label":"Changes since review","hidden":true},
h("h3",{},
"Changed since approval"),
h("ul",{"id":"change-list"}),
h("div",{"id":"definition-comparison","hidden":true},
h("h4",{},
"Previously approved definition"),
h("p",{"id":"reviewed-concept-definition"}),
h("h4",{},
"Current definition"),
h("p",{"id":"current-concept-definition"})),
h("details",{"id":"reviewed-source","class":"brief"},
h("summary",{},
"Previously approved source and passage"),
h("h4",{},
"Selected passage"),
h("blockquote",{"id":"reviewed-quote"}),
h("h4",{},
"Reviewed context"),
h("div",{"id":"reviewed-context","class":"context"}),
h("h4",{},
"Previously approved annotation text"),
h("p",{"id":"reviewed-body"}))),
h("h3",{},
"Exact passage"),
h("blockquote",{"id":"quote"}),
h("p",{"id":"context","class":"context"}),
h("div",{"id":"concept"}),
h('label',{class:'field'},h('span',{id:'member-color-label',text:'Annotation color'}),h('select',{id:'member-color','data-highlight-control':'1'},h('option',{value:'',text:'No member override'}),...colorOptions())),
h("label",{"class":"field"},
"Annotation text",
h("textarea",{"id":"body","rows":"7"})),
h("div",{class:"row"},UI.button("Save text",()=>{},"",{"type":"button","data-action":"edit"}),
UI.button("Discard text edits",()=>{},"",{"type":"button","id":"discard"})),
h("label",{"class":"field"},
"Reason ",
h("span",{"class":"quiet"},
"(optional)"),
h("input",{"id":"reason","type":"text"})),
h("div",{"class":"row"},
UI.button("Accept",()=>{},"primary",{"type":"button","data-action":"accept"}),
UI.button("Reject",()=>{},"danger",{"type":"button","data-action":"reject"}),
UI.button("Defer",()=>{},"",{"type":"button","data-action":"defer"}),
UI.button("Undo last decision",()=>{},"",{"type":"button","data-action":"undo"})),
h("section",{"class":"retarget"},
h("h3",{},
"Change location"),
h("label",{"class":"field"},
"Find exact passage",
h("input",{"id":"target-query","type":"text"})),
UI.button("Find locations",()=>{},"",{"type":"button","id":"locate"}),
h("label",{"class":"field"},
"Location",
h("select",{"id":"candidate"},
h("option",{"value":""},
"Choose a location"))),
UI.button("Use location",()=>{},"",{"type":"button","data-action":"retarget"})),
h("h3",{},
"Origin and supporting references"),
h("pre",{"id":"provenance"}),
h("details",{},
h("summary",{},
"Binding details"),
h("pre",{"id":"binding"}))))));
 UI.fontsFooter();

const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('t')||'';
let state=null,selected=null,mode='annotated',dirty=false,pending=null,publicationHTML='';
function publicationTheme(){const theme=document.documentElement.dataset.theme;$('publication').srcdoc=['light','dark'].includes(theme)?publicationHTML.replace('<html ','<html data-theme="'+theme+'" '):publicationHTML;}
document.addEventListener('prose-theme-change',()=>{if(publicationHTML)publicationTheme();});
const text=(id,value)=>{$(id).textContent=value==null?'':String(value)};
const notice=(message,error=false)=>UI.notice(message,undefined,error?'error':'info');
async function request(path,body){const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'x-prose-token':token,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});let value;try{value=await r.json()}catch{throw Error('The review server did not return a readable response.')}if(!r.ok){const error=Error(value.error?.message||'The request failed.');error.code=value.error?.code;throw error}return value}
function targetQuote(a){return typeof a.target?.quote==='string'?a.target.quote:a.target?.quote?.exact||a.target?.exact||''}
function current(){return state?.inspection.annotations.find(a=>a.id===selected)}
function cpSlice(value,start,end){return Array.from(value||'').slice(start,end).join('')}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o}
function lists(){const registry=state.inspection.concepts;return registry?.lists||{}}
function appearance(){return state.inspection.sidecar.appearance||{}}
function colorControls(){
 const prefs=appearance(),a=current();
 document.querySelector('.annotation-color-settings').disabled=false;
 $('highlight-mode').value=prefs.mode||'hybrid';
 const kind=$('color-category').value;
 $('category-color').value=Object.hasOwn(prefs.categories||{},kind)?prefs.categories[kind]:'';
 if(a){
  const concept=state.inspection.concepts?.concepts.find(c=>c.id===a.concept);
  text('member-color-label',a.concept?'Concept color: '+(concept?.label||a.concept):'Annotation color');
  const map=a.concept?prefs.concepts:prefs.annotations,key=a.concept||a.id;
  $('member-color').value=Object.hasOwn(map||{},key)?map[key]:'';
  $('member-color').options[0].textContent=concept?.color?'Project default: '+concept.color:'No member override';
 }
}
async function saveAppearance(next){
 const controls=[...document.querySelectorAll('[data-highlight-control]')];controls.forEach(el=>el.disabled=true);
 try{await request('/api/appearance',{appearance:next,expectedRevision:state.inspection.revision,eventId:crypto.randomUUID()});await reload(true);notice('Highlight settings saved. Publication hints updated.');}
 catch(e){notice(e.code==='E_CONFLICT'?'Highlight settings changed elsewhere. Reload source to compare before saving again.':e.message,true);}
 finally{controls.forEach(el=>el.disabled=false);colorControls();}
}
function setColor(group,key,color){const next=structuredClone(appearance());next[group]||={};if(color)Object.defineProperty(next[group],key,{value:color,enumerable:true,configurable:true,writable:true});else delete next[group][key];return saveAppearance(next);}
function inList(a,name){if(!name)return true;const items=lists()[name];return Array.isArray(items)&&items.includes(typeof a.concept==='string'?a.concept:a.concept?.id)}
function visible(){return state.inspection.annotations.filter(a=>(!$('state-filter').value||a.state===$('state-filter').value)&&(!$('kind-filter').value||a.kind===$('kind-filter').value)&&inList(a,$('list-filter').value))}
function queue(){
 colorControls();const items=visible();$('queue').replaceChildren();text('count',items.length+'/'+state.inspection.annotations.length);
 for(const a of items){
  const item=UI.queueItem({who:a.id+' · '+a.kind,where:a.resolution.status,status:a.state,state:({accepted:'sent',rejected:'skipped',stale:'blocked',deferred:'ended'})[a.state]||'',current:a.id===selected,label:a.id+' · '+a.kind+' · '+a.state+' / '+a.resolution.status,onClick:()=>select(a.id)});
  item.querySelector('.who').append(h('span',{class:'annotation-swatch','data-prose-color':a.presentationColor||'none',text:a.presentationColor==='none'?'Uncolored':a.presentationColor}));
  $('queue').append(item);
 }
 if(!items.length)$('queue').append(h('p',{class:'quiet',text:'No annotations match these filters.'}));
}
function safeLink(href){try{const u=new URL(href,location.origin);return /^(https?:|mailto:)$/.test(u.protocol)?href:null}catch{return null}}
function source(){const projection=state.inspection.projection;$('source').replaceChildren();if(mode==='publication')return;const all=mode==='plain'?[]:state.inspection.annotations.filter(a=>a.resolution.range);for(const block of projection.blocks){const p=document.createElement('div');p.className='source-block'+(block.kind==='heading'?' heading':'');p.dataset.block=block.id;const cuts=new Set([block.start,block.end]);const runs=block.runs?.length?block.runs:[{start:block.start,end:block.end,text:block.text}];for(const run of runs){cuts.add(Math.max(block.start,run.start));cuts.add(Math.min(block.end,run.end))}for(const a of all){const r=a.resolution.range;if(r.start<block.end&&r.end>block.start){cuts.add(Math.max(r.start,block.start));cuts.add(Math.min(r.end,block.end))}}const boundaries=[...cuts].filter(n=>n>=block.start&&n<=block.end).sort((a,b)=>a-b);for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],end=boundaries[i];if(start===end)continue;const run=runs.find(r=>r.start<=start&&r.end>=end);const hits=all.filter(a=>a.resolution.range.start<end&&a.resolution.range.end>start);let node=document.createTextNode(cpSlice(projection.text,start,end));if(run?.marks?.includes('em')){const n=document.createElement('em');n.append(node);node=n}if(run?.marks?.includes('strong')){const n=document.createElement('strong');n.append(node);node=n}if(run?.href&&safeLink(run.href)){const n=document.createElement('a');n.href=run.href;n.rel='noopener noreferrer';n.append(node);node=n}if(hits.length){const n=document.createElement('span');n.className='passage-mark'+(hits.some(a=>a.id===selected)?' selected':'');n.dataset.annotations=hits.map(a=>a.id).join(' ');const chosen=hits.find(a=>a.id===selected)||hits[0];n.dataset.proseColor=chosen.presentationColor||'none';n.dataset.proseCategory=chosen.kind;if(!run?.href){n.tabIndex=0;n.setAttribute('role','button');n.setAttribute('aria-label','Review '+hits.map(a=>a.id).join(', '));n.onclick=()=>select(hits[(hits.findIndex(a=>a.id===selected)+1)%hits.length].id);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click()}}}n.append(node);node=n}p.append(node)}$('source').append(p)}text('diagnostics',(projection.diagnostics||[]).map(d=>typeof d==='string'?d:d.message||JSON.stringify(d)).join('\n'))}
function snapshotContext(value){if(typeof value==='string')return value;if(!Array.isArray(value))return value?JSON.stringify(value,null,2):'No reviewed context was stored.';return value.map(block=>[Array.isArray(block.headingPath)?block.headingPath.join(' › '):'',block.text||''].filter(Boolean).join('\n')).join('\n\n')}
function reviewChanges(a){const labels={profile:'source adapter or reading view changed',payload:'annotation text or metadata changed',selector:'passage binding changed',quote:'selected text changed',context:'reviewed context changed',concept:'definition or concept changed',destination:'linked destination changed','reviewed-dependencies':'reviewed dependencies changed'};const changes=a.changes||[];const previous=a.review?.snapshot;const now=a.snapshot||{};$('review-changes').hidden=a.state!=='stale'&&!changes.length;$('change-list').replaceChildren();for(const key of changes.length?changes:['reviewed-dependencies']){const item=document.createElement('li');item.textContent=labels[key]||'reviewed information changed';$('change-list').append(item)}$('definition-comparison').hidden=!previous||!changes.includes('concept');text('reviewed-concept-definition',previous?.concept?.definition||'No shared definition was previously approved.');text('current-concept-definition',now.concept?.definition||'No current shared definition is available.');$('reviewed-source').hidden=!previous;text('reviewed-quote',previous?.quote||'No selected passage was stored.');text('reviewed-context',snapshotContext(previous?.context));text('reviewed-body',previous?.payload?.body||previous?.concept?.definition||'No annotation text was stored.')}
function details(preserve=false){const a=current();$('empty-detail').hidden=!!a;$('detail').hidden=!a;if(!a)return;text('detail-title',a.id);text('state-label',a.state);text('resolution-label',a.resolution.status);reviewChanges(a);text('quote',targetQuote(a)||'No exact quote');const range=a.resolution.range;const projection=state.inspection.projection;text('context',range?cpSlice(projection.text,Math.max(0,range.start-100),range.end+140):'This passage is unresolved. Find a location below; its current binding has not been approved.');const conceptId=typeof a.concept==='string'?a.concept:a.concept?.id;const concept=state.inspection.concepts?.concepts?.find(c=>c.id===conceptId);text('concept',concept?'Concept: '+concept.label+'\n'+(concept.definition||''):conceptId?'Concept: '+conceptId:'No shared concept');if(!preserve){$('body').value=typeof a.body==='string'?a.body:'';$('reason').value='';$('target-query').value=targetQuote(a);$('candidate').replaceChildren(option('','Choose a location'));dirty=false}text('provenance',JSON.stringify({origin:a.origin||a.provenance||null,cites:a.cites||a.sources||[],concept:concept||conceptId||null,destination:a.destination||null},null,2));text('binding',JSON.stringify({target:a.target,resolution:a.resolution,dependency:a.dependency,reviewedSnapshot:a.review?.snapshot,currentSnapshot:a.snapshot,revision:state.inspection.revision},null,2));document.querySelector('[data-action="accept"]').disabled=!a.resolution.range||!['exact','relocated','source-changed'].includes(a.resolution.status)}
function select(id){if(dirty&&selected!==id){notice('Save or discard your text edits before choosing another annotation.',true);return}selected=id;queue();source();details();const mark=document.querySelector('.passage-mark.selected');if(mark)mark.scrollIntoView({block:'nearest',behavior:'auto'})}
async function reload(preserve=false){const next=await request('/api/state');const removed=dirty&&selected&&!next.inspection.annotations.some(a=>a.id===selected);state=next;if(removed){queue();source();text('state-label','changed elsewhere');text('resolution-label','annotation removed');for(const b of document.querySelectorAll('[data-action]'))b.disabled=true;notice('This annotation was removed elsewhere. Your unsaved text is preserved; copy it or discard the text edits before choosing another annotation.',true);return}if(selected&&!current())selected=null;if(!selected)selected=state.inspection.annotations[0]?.id||null;const filter=$('list-filter').value;$('list-filter').replaceChildren(option('','All lists'),...Object.keys(lists()).map(k=>option(k,k)));$('list-filter').value=filter;text('document-title',state.inspection.sidecar.document.handle);text('session-state',state.session.state+' · '+state.cursor+' changes');queue();source();details(preserve&&dirty);if(mode==='publication')await publication()}
async function publication(){try{const value=await request('/api/publication');publicationHTML=value.html;publicationTheme();text('source-note','Publication preview uses the same compiled HTML as export. Only accepted current annotations are published.')}catch(e){notice(e.message,true)}}
async function changeMode(next){mode=next;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));$('source').hidden=mode==='publication';$('publication').hidden=mode!=='publication';if(mode==='publication')await publication();else{text('source-note','The source remains unchanged. Select an annotation to inspect its passage.');source()}}
async function decide(action){const a=current();if(!a)return;if(dirty&&action==='accept'){notice('Save your text before accepting this annotation. Your current edit is not stored yet.',true);return}if(dirty&&['retarget','undo'].includes(action)){notice('Save or discard your text edits before changing the location or undoing a decision.',true);return}const payload={id:a.id,action,expectedRevision:state.inspection.revision,...($('reason').value?{reason:$('reason').value}:{})};if(action==='edit')payload.body=$('body').value;if(action==='retarget'){if(!$('candidate').value){notice('Find and choose a location first.',true);return}payload.candidate=$('candidate').value}const signature=JSON.stringify(payload);if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};payload.eventId=pending.id;const controls=[...document.querySelectorAll('[data-action]')];controls.forEach(b=>b.disabled=true);try{await request('/api/decision',payload);pending=null;dirty=false;await reload();notice(action==='reject'?'Rejected. No replacement is required.':action==='edit'?'Text saved for review.':action==='retarget'?'Location changed for review.':'Decision saved.')}catch(e){if(e.code==='E_CONFLICT'){pending=null;notice('The source or annotations changed elsewhere. Your text is preserved. Reload source to compare, then save again.',true)}else notice(e.message,true)}finally{controls.forEach(b=>b.disabled=false);const a=current();if(a)document.querySelector('[data-action="accept"]').disabled=!a.resolution.range||!['exact','relocated','source-changed'].includes(a.resolution.status)}}
$('highlight-mode').onchange=()=>saveAppearance({...appearance(),mode:$('highlight-mode').value});
$('color-category').onchange=colorControls;
$('category-color').onchange=()=>setColor('categories',$('color-category').value,$('category-color').value);
$('member-color').onchange=()=>{const a=current();if(a)setColor(a.concept?'concepts':'annotations',a.concept||a.id,$('member-color').value)};
for(const id of ['state-filter','kind-filter','list-filter'])$(id).onchange=queue;
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>changeMode(b.dataset.mode);
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>decide(b.dataset.action);
$('body').oninput=()=>{dirty=true};
$('discard').onclick=()=>{dirty=false;pending=null;if(!current())selected=state.inspection.annotations[0]?.id||null;for(const b of document.querySelectorAll('[data-action]'))b.disabled=false;queue();source();details();notice('Unsaved text edits discarded. The stored annotation is unchanged.')};
$('reload').onclick=async()=>{try{await reload(true);notice(dirty?'Source reloaded. Your unsaved text is preserved; compare it before saving.':'Source reloaded.')}catch(e){notice(e.message,true)}};
$('locate').onclick=async()=>{try{const result=await request('/api/locate',{quote:$('target-query').value});if(result.revision!==state.inspection.revision){notice('The source changed. Reload source before choosing a location.',true);return}$('candidate').replaceChildren(option('','Choose a location'),...result.candidates.map(c=>option(c.id,(c.context?.prefix||c.prefix||'')+' ['+(c.quote?.exact||c.quote||c.text||$('target-query').value)+'] '+(c.context?.suffix||c.suffix||''))));notice(result.candidates.length+' matching locations. Choose one, then use location.')}catch(e){notice(e.message,true)}};
$('close').onclick=async()=>{try{await request('/api/close',{});text('session-state','closed');notice('Review closed. Decisions remain in the annotation file.');for(const b of document.querySelectorAll('[data-action], [data-highlight-control], #reload, #close, #locate, #discard'))b.disabled=true}catch(e){notice(e.message,true)}};
reload().catch(e=>notice(e.message,true));
 });
}());
