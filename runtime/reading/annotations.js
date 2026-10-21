// Annotation review mode for the shared proof desk. Only this controller knows annotation decisions.
(function(){
 'use strict';
 const UI=window.ProseReview;
 UI.registerMode('annotations',()=>{
 const {h,disclosure}=UI;
 const colors=['yellow','green','blue','purple','pink','orange'];
 const categories={highlight:'Highlights',vocabulary:'Vocabulary',concept:'Concepts',definition:'Definitions',explanation:'Explanations',link:'Links'};
 const kindNames={highlight:'Highlight',vocabulary:'Vocabulary',concept:'Concept',definition:'Definition',explanation:'Explanation',link:'Link'};
 const field=(label,input)=>h('label',{class:'field'},label,input);
 function colorOptions(){return colors.map(color=>h('option',{value:color,text:color[0].toUpperCase()+color.slice(1)}));}
 document.getElementById('review-mode-settings').append(h('fieldset',{class:'annotation-color-settings',disabled:true},
   h('legend',{text:'Annotation colors'}),
   field('Highlighting',h('select',{id:'highlight-mode','data-highlight-control':'1'},h('option',{value:'category',text:'Category'}),h('option',{value:'member',text:'Member'}),h('option',{value:'hybrid',text:'Hybrid'}))),
   h('p',{id:'highlight-mode-hint',class:'quiet'}),
   h('div',{class:'settings-pair'},
     field('Category',h('select',{id:'color-category'},...Object.entries(categories).map(([value,label])=>h('option',{value,text:label})))),
     field('Category color',h('select',{id:'category-color','data-highlight-control':'1'},h('option',{value:'',text:'Default color'}),...colorOptions()))),
   h('p',{class:'quiet',text:'Applied to this document and its published annotations.'})
  ));
 document.title='Annotations | Prose review';
 document.getElementById('title').textContent='Annotation review';
 document.getElementById('subtitle').textContent='';document.getElementById('subtitle').hidden=true;
 document.getElementById('desk').classList.add('batch');
 const rail=document.getElementById('rail');rail.hidden=false;rail.setAttribute('aria-label','Annotation queue');rail.tabIndex=0;
 rail.replaceChildren(
   h('div',{class:'queue-heading'},h('h2',{text:'Annotations'}),h('span',{id:'count',class:'queue-count'})),
   h('p',{id:'review-progress-label',class:'quiet'}),
   h('progress',{id:'review-progress',class:'review-progress',max:1,value:0,'aria-label':'Annotations accepted'}),
   disclosure('Filters',{id:'annotation-filter-tools'},h('div',{class:'annotation-filters'},
     field('Review state',h('select',{id:'state-filter'},h('option',{value:'',text:'All states'}),...['draft','accepted','rejected','deferred','stale'].map(state=>h('option',{value:state,text:state[0].toUpperCase()+state.slice(1)})))),
     field('Kind',h('select',{id:'kind-filter'},h('option',{value:'',text:'All kinds'}),...Object.entries(kindNames).map(([value,label])=>h('option',{value,text:label})))),
     field('Vocabulary list',h('select',{id:'list-filter'},h('option',{value:'',text:'All lists'}))))),
   h('nav',{id:'queue','aria-label':'Select an annotation'}));
 const views=document.getElementById('views');views.hidden=false;views.replaceChildren(
   h('div',{class:'review-tabs'},...['Plain','Annotated','Publication'].map(label=>UI.button(label,()=>{},'view-tab',{'data-mode':label.toLowerCase(),'aria-pressed':String(label==='Annotated')}))));
 document.getElementById('review-settings-button').before(views);
 document.getElementById('review-mode-settings').append(
   h('div',{class:'annotation-session review-tools'},h('span',{id:'session-state',class:'quiet',text:'Opening...'}),UI.button('Reload source',()=>{},'toolbar-button',{id:'reload'}),UI.button('Close review',()=>{},'toolbar-button',{id:'close'})));
 document.getElementById('app').replaceChildren(h('div',{class:'annotation-layout'},
   h('section',{id:'reading-pane',class:'annotation-source card','aria-label':'Source reading pane',tabindex:'0'},
     h('div',{class:'reading-head'},h('span',{class:'eyebrow',text:'Source text'}),h('h2',{id:'document-title',text:'Source'}),h('a',{class:'pane-jump',href:'#annotation-editor',text:'Review annotation'})),
     h('article',{id:'source',class:'reading'}),
     h('iframe',{id:'publication',title:'Publication preview',sandbox:'',hidden:true}),
     h('p',{id:'source-note',class:'quiet',text:'Select a marked passage to review its annotation.'}),
     h('div',{id:'diagnostics',class:'quiet'})),
   h('aside',{id:'annotation-editor',class:'annotation-details card','aria-label':'Annotation details',tabindex:'-1'},
     h('div',{class:'inspector-scroll',role:'region','aria-label':'Annotation editor',tabindex:'0'},
       h('div',{class:'inspector-heading'},h('p',{id:'detail-kind',class:'eyebrow',text:'Annotation'}),h('h2',{id:'detail-title',text:'Review a passage'}),h('div',{class:'annotation-status'},h('span',{id:'state-label'}),h('span',{id:'resolution-label'}))),
       h('p',{id:'empty-detail',class:'quiet',text:'Choose a passage from the queue to review its annotation.'}),
       h('div',{id:'detail',hidden:true},
         h('section',{id:'review-changes',class:'panel','aria-label':'Changes since review',hidden:true},
           h('h3',{text:'Changed since approval'}),h('ul',{id:'change-list'}),
           h('div',{id:'definition-comparison',hidden:true},h('h4',{text:'Previously approved definition'}),h('p',{id:'reviewed-concept-definition'}),h('h4',{text:'Current definition'}),h('p',{id:'current-concept-definition'})),
           disclosure('Previously approved source and passage',{id:'reviewed-source'},h('h4',{text:'Selected passage'}),h('blockquote',{id:'reviewed-quote'}),h('h4',{text:'Reviewed context'}),h('div',{id:'reviewed-context',class:'context'}),h('h4',{text:'Previously approved annotation text'}),h('p',{id:'reviewed-body'}))),
         h('p',{class:'eyebrow',text:'Selected passage'}),h('blockquote',{id:'quote',class:'selected-quote'}),
         h('section',{id:'concept',class:'concept-note',hidden:true}),
         disclosure('Annotation text',{id:'body-tools',open:true},field('Annotation text',h('textarea',{id:'body',rows:'4','aria-describedby':'body-hint edit-state'})),h('p',{id:'body-hint',class:'quiet'}),h('p',{id:'edit-state',class:'edit-state',role:'status'})),
         disclosure('Surrounding text',{id:'context-tools'},h('p',{id:'context',class:'context'})),
         disclosure('Appearance',{id:'member-appearance'},field(h('span',{id:'member-color-label',text:'Annotation color'}),h('select',{id:'member-color','data-highlight-control':'1'},h('option',{value:'',text:'No member override'}),...colorOptions()))),
         disclosure('Add a review note',{id:'reason-tools'},field('Reason (optional)',h('input',{id:'reason',type:'text'}))),
         disclosure('Change location',{id:'retarget-tools',class:'retarget'},
           field('Find exact passage',h('input',{id:'target-query',type:'text'})),UI.button('Find locations',()=>{},'toolbar-button',{id:'locate'}),
           field('Location',h('select',{id:'candidate'},h('option',{value:'',text:'Choose a location'}))),UI.button('Use location',()=>{},'toolbar-button',{'data-action':'retarget'})),
         disclosure('Sources and origin',{id:'sources-tools'},h('p',{id:'origin-label',class:'quiet'}),h('div',{id:'reference-links'}),
           disclosure('Technical details',{},h('pre',{id:'provenance'}),h('pre',{id:'binding'}))))),
     h('div',{id:'review-actions',class:'review-actions',hidden:true},
       h('a',{class:'pane-jump',href:'#reading-pane',text:'Back to source text'}),
       h('div',{id:'edit-actions',class:'row edit-actions',hidden:true},UI.button('Save text',()=>{},'primary',{'data-action':'edit'}),UI.button('Discard text edits',()=>{},'link',{id:'discard'})),
       h('div',{class:'decision-buttons'},UI.button('Accept',()=>{},'primary',{'data-action':'accept'}),UI.button('Reject',()=>{},'danger',{'data-action':'reject'}),UI.button('Defer',()=>{},'',{'data-action':'defer'})),
       UI.button('Undo last decision',()=>{},'link undo-decision',{'data-action':'undo'})))));

const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('t')||'';
let state=null,selected=null,mode='annotated',dirty=false,pending=null,publicationHTML='',detailSelection=null;
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
 text('highlight-mode-hint',({category:'Every annotation uses its category color.',member:'Each concept or annotation uses its own color. Unassigned passages have no fill.',hybrid:'Member colors take priority; other passages use their category color.'})[prefs.mode||'hybrid']);
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
function annotationTitle(a){
 const concept=state.inspection.concepts?.concepts.find(c=>c.id===a.concept);
 const title=concept?.label||targetQuote(a)||a.body||'Unlocated passage';
 const chars=Array.from(title.trim());return chars.length>72?chars.slice(0,69).join('')+'\u2026':chars.join('');
}
function queue(){
 colorControls();const items=visible(),all=state.inspection.annotations;
 $('queue').replaceChildren();text('count',items.length+'/'+all.length);
 const accepted=all.filter(a=>a.state==='accepted').length;
 text('review-progress-label',accepted+' of '+all.length+' accepted');$('review-progress').max=Math.max(1,all.length);$('review-progress').value=accepted;
 const active=['state-filter','kind-filter','list-filter'].filter(id=>$(id).value).length;
 $('annotation-filter-tools').querySelector('summary').textContent=active?'Filters ('+active+')':'Filters';
 for(const a of items){
  const quote=targetQuote(a),block=state.inspection.projection.blocks.find(b=>a.resolution.range&&b.start<a.resolution.range.end&&b.end>a.resolution.range.start);
  const item=UI.queueItem({who:annotationTitle(a),where:a.body||block?.text||quote||'Find this passage to continue.',tag:kindNames[a.kind],status:a.state,state:({accepted:'sent',rejected:'skipped',stale:'blocked',deferred:'ended'})[a.state]||'',current:a.id===selected,label:annotationTitle(a)+' \u00b7 '+a.kind+' \u00b7 '+a.state+' / '+a.resolution.status,onClick:()=>select(a.id)});
  item.querySelector('.state').append(h('span',{class:'annotation-swatch','data-prose-color':a.presentationColor||'none','aria-hidden':'true',title:'Highlight color: '+(a.presentationColor||'none')}));
  $('queue').append(item);
 }
 if(!items.length)$('queue').append(h('p',{class:'quiet',text:'No annotations match. Change the filters to see more passages.'}));
}
function safeLink(href){try{const u=new URL(href,location.origin);return /^(https?:|mailto:)$/.test(u.protocol)?href:null}catch{return null}}
function source(){const projection=state.inspection.projection;$('source').replaceChildren();if(mode==='publication')return;const all=mode==='plain'?[]:state.inspection.annotations.filter(a=>a.resolution.range);for(const block of projection.blocks){const p=document.createElement('div');p.className='source-block'+(block.kind==='heading'?' heading':'');p.dataset.block=block.id;const cuts=new Set([block.start,block.end]);const runs=block.runs?.length?block.runs:[{start:block.start,end:block.end,text:block.text}];for(const run of runs){cuts.add(Math.max(block.start,run.start));cuts.add(Math.min(block.end,run.end))}for(const a of all){const r=a.resolution.range;if(r.start<block.end&&r.end>block.start){cuts.add(Math.max(r.start,block.start));cuts.add(Math.min(r.end,block.end))}}const boundaries=[...cuts].filter(n=>n>=block.start&&n<=block.end).sort((a,b)=>a-b);for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],end=boundaries[i];if(start===end)continue;const run=runs.find(r=>r.start<=start&&r.end>=end);const hits=all.filter(a=>a.resolution.range.start<end&&a.resolution.range.end>start);let node=document.createTextNode(cpSlice(projection.text,start,end));if(run?.marks?.includes('em')){const n=document.createElement('em');n.append(node);node=n}if(run?.marks?.includes('strong')){const n=document.createElement('strong');n.append(node);node=n}if(run?.href&&safeLink(run.href)){const n=document.createElement('a');n.href=run.href;n.rel='noopener noreferrer';n.append(node);node=n}if(hits.length){const n=document.createElement('span');n.className='passage-mark'+(hits.some(a=>a.id===selected)?' selected':'');n.dataset.annotations=hits.map(a=>a.id).join(' ');const chosen=hits.find(a=>a.id===selected)||hits[0];n.dataset.proseColor=chosen.presentationColor||'none';n.dataset.proseCategory=chosen.kind;if(!run?.href){n.tabIndex=0;n.setAttribute('role','button');n.setAttribute('aria-label','Review '+hits.map(annotationTitle).join(', '));n.onclick=()=>select(hits[(hits.findIndex(a=>a.id===selected)+1)%hits.length].id);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click()}}}n.append(node);node=n}p.append(node)}$('source').append(p)}text('diagnostics',(projection.diagnostics||[]).map(d=>typeof d==='string'?d:d.message||JSON.stringify(d)).join('\n'))}
function snapshotContext(value){if(typeof value==='string')return value;if(!Array.isArray(value))return value?JSON.stringify(value,null,2):'No reviewed context was stored.';return value.map(block=>[Array.isArray(block.headingPath)?block.headingPath.join(' › '):'',block.text||''].filter(Boolean).join('\n')).join('\n\n')}
function reviewChanges(a){const labels={profile:'source adapter or reading view changed',payload:'annotation text or metadata changed',selector:'passage binding changed',quote:'selected text changed',context:'reviewed context changed',concept:'definition or concept changed',destination:'linked destination changed','reviewed-dependencies':'reviewed dependencies changed'};const changes=a.changes||[];const previous=a.review?.snapshot;const now=a.snapshot||{};$('review-changes').hidden=a.state!=='stale'&&!changes.length;$('change-list').replaceChildren();for(const key of changes.length?changes:['reviewed-dependencies']){const item=document.createElement('li');item.textContent=labels[key]||'reviewed information changed';$('change-list').append(item)}$('definition-comparison').hidden=!previous||!changes.includes('concept');text('reviewed-concept-definition',previous?.concept?.definition||'No shared definition was previously approved.');text('current-concept-definition',now.concept?.definition||'No current shared definition is available.');$('reviewed-source').hidden=!previous;text('reviewed-quote',previous?.quote||'No selected passage was stored.');text('reviewed-context',snapshotContext(previous?.context));text('reviewed-body',previous?.payload?.body||previous?.concept?.definition||'No annotation text was stored.')}
function details(preserve=false){
 const a=current();$('empty-detail').hidden=!!a;$('detail').hidden=!a;$('review-actions').hidden=!a;
 if(!a)return;
 if(detailSelection!==a.id){$('body-tools').open=!!a.body;detailSelection=a.id;}
 $('body-tools').querySelector('summary').textContent=a.body?'Annotation text':'Add annotation text';
 text('detail-title',annotationTitle(a));text('detail-kind',kindNames[a.kind]);text('state-label',a.state);$('state-label').dataset.state=a.state;
 const locations={exact:'Exact match',relocated:'Relocated','source-changed':'Source updated',missing:'Needs a location',ambiguous:'Choose a location'};
 text('resolution-label',locations[a.resolution.status]||a.resolution.status);reviewChanges(a);
 text('quote',targetQuote(a)||'No exact passage selected');
 const range=a.resolution.range,projection=state.inspection.projection;
 text('context',range?cpSlice(projection.text,Math.max(0,range.start-100),range.end+140):'Find the intended passage below before accepting this annotation.');
 const concept=state.inspection.concepts?.concepts.find(c=>c.id===a.concept);
 $('concept').hidden=!concept;
 $('concept').replaceChildren(...(concept?[h('p',{class:'eyebrow',text:'Shared definition'}),h('p',{class:'concept-label',text:concept.label}),h('p',{text:concept.definition||''})]:[]));
 text('body-hint',concept&&!a.body?'Uses the shared definition above. Add annotation text to give this passage its own note.':'');
 if(!preserve){$('body').value=typeof a.body==='string'?a.body:'';$('reason').value='';$('target-query').value=targetQuote(a);$('candidate').replaceChildren(option('','Choose a location'));dirty=false;}
 text('edit-state',dirty?'Unsaved text changes':'');
 $('edit-actions').hidden=!dirty;$('review-actions').dataset.editing=String(dirty);
 text('origin-label',({supplied:'Provided by the author',assistant:'Suggested by an assistant',deterministic:'Located by a rule'})[a.origin?.type]||'Origin not recorded');
 const urls=[...new Set([...(a.sources||[]),...(concept?.sources||[])])].filter(url=>safeLink(url));
 $('reference-links').replaceChildren(urls.length?h('ul',{class:'reference-links'},...urls.map(url=>h('li',{},h('a',{href:url,rel:'noopener noreferrer',text:url})))):h('p',{class:'quiet',text:'No source links supplied.'}));
 text('provenance',JSON.stringify({origin:a.origin||a.provenance||null,cites:a.cites||a.sources||[],concept:concept||a.concept||null,destination:a.destination||null},null,2));
 text('binding',JSON.stringify({annotation:a.id,target:a.target,resolution:a.resolution,dependency:a.dependency,reviewedSnapshot:a.review?.snapshot,currentSnapshot:a.snapshot,revision:state.inspection.revision},null,2));
 if(!range)$('retarget-tools').open=true;
 document.querySelector('[data-action="accept"]').disabled=!range||!['exact','relocated','source-changed'].includes(a.resolution.status);
}
function revealSelection(){
 if(window.matchMedia('(max-width:1150px)').matches){$('annotation-editor').scrollIntoView({block:'start',behavior:'auto'});$('annotation-editor').focus({preventScroll:true});}
 else {const mark=document.querySelector('.passage-mark.selected');if(mark)mark.scrollIntoView({block:'nearest',behavior:'auto'});}
}
function select(id){
 if(dirty){if(selected!==id)notice('Save or discard your text edits before choosing another annotation.',true);else revealSelection();return;}
 const changed=selected!==id;selected=id;queue();source();details();
 if(changed)document.querySelector('.inspector-scroll').scrollTop=0;
 revealSelection();
}
async function reload(preserve=false){const next=await request('/api/state');const removed=dirty&&selected&&!next.inspection.annotations.some(a=>a.id===selected);state=next;if(removed){queue();source();text('state-label','changed elsewhere');text('resolution-label','annotation removed');for(const b of document.querySelectorAll('[data-action]'))b.disabled=true;notice('This annotation was removed elsewhere. Your unsaved text is preserved; copy it or discard the text edits before choosing another annotation.',true);return}if(selected&&!current())selected=null;if(!selected)selected=state.inspection.annotations[0]?.id||null;const filter=$('list-filter').value;$('list-filter').replaceChildren(option('','All lists'),...Object.keys(lists()).map(k=>option(k,k)));$('list-filter').value=filter;text('document-title',state.inspection.sidecar.document.handle.replace(/[-_]+/g,' '));text('session-state',state.session.state==='open'?'Review open':'Review closed');queue();source();details(preserve&&dirty);if(mode==='publication')await publication()}
async function publication(){try{const value=await request('/api/publication');publicationHTML=value.html;publicationTheme();text('source-note','Publication preview uses the same compiled HTML as export. Only accepted current annotations are published.')}catch(e){notice(e.message,true)}}
async function changeMode(next){mode=next;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));$('source').hidden=mode==='publication';$('publication').hidden=mode!=='publication';if(mode==='publication')await publication();else{text('source-note','Select a marked passage to review its annotation.');source()}}
async function decide(action){const a=current();if(!a)return;if(dirty&&action==='accept'){notice('Save your text before accepting this annotation. Your current edit is not stored yet.',true);return}if(dirty&&['retarget','undo'].includes(action)){notice('Save or discard your text edits before changing the location or undoing a decision.',true);return}const payload={id:a.id,action,expectedRevision:state.inspection.revision,...($('reason').value?{reason:$('reason').value}:{})};if(action==='edit')payload.body=$('body').value;if(action==='retarget'){if(!$('candidate').value){notice('Find and choose a location first.',true);return}payload.candidate=$('candidate').value}const signature=JSON.stringify(payload);if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};payload.eventId=pending.id;const controls=[...document.querySelectorAll('[data-action]')];controls.forEach(b=>b.disabled=true);try{await request('/api/decision',payload);pending=null;dirty=false;await reload();notice(action==='reject'?'Rejected. No replacement is required.':action==='edit'?'Text saved for review.':action==='retarget'?'Location changed for review.':'Decision saved.')}catch(e){if(e.code==='E_CONFLICT'){pending=null;notice('The source or annotations changed elsewhere. Your text is preserved. Reload source to compare, then save again.',true)}else notice(e.message,true)}finally{controls.forEach(b=>b.disabled=false);const a=current();if(a)document.querySelector('[data-action="accept"]').disabled=!a.resolution.range||!['exact','relocated','source-changed'].includes(a.resolution.status)}}
$('highlight-mode').onchange=()=>saveAppearance({...appearance(),mode:$('highlight-mode').value});
$('color-category').onchange=colorControls;
$('category-color').onchange=()=>setColor('categories',$('color-category').value,$('category-color').value);
$('member-color').onchange=()=>{const a=current();if(a)setColor(a.concept?'concepts':'annotations',a.concept||a.id,$('member-color').value)};
for(const id of ['state-filter','kind-filter','list-filter'])$(id).onchange=queue;
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>changeMode(b.dataset.mode);
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>decide(b.dataset.action);
$('body').oninput=()=>{dirty=true;text('edit-state','Unsaved text changes');$('edit-actions').hidden=false;$('review-actions').dataset.editing='true'};
$('discard').onclick=()=>{dirty=false;pending=null;if(!current())selected=state.inspection.annotations[0]?.id||null;for(const b of document.querySelectorAll('[data-action]'))b.disabled=false;queue();source();details();notice('Unsaved text edits discarded. The stored annotation is unchanged.')};
$('reload').onclick=async()=>{try{await reload(true);$('review-settings').close();notice(dirty?'Source reloaded. Your unsaved text is preserved; compare it before saving.':'Source reloaded.')}catch(e){notice(e.message,true)}};
$('locate').onclick=async()=>{try{const result=await request('/api/locate',{quote:$('target-query').value});if(result.revision!==state.inspection.revision){notice('The source changed. Reload source before choosing a location.',true);return}$('candidate').replaceChildren(option('','Choose a location'),...result.candidates.map(c=>option(c.id,(c.context?.prefix||c.prefix||'')+' ['+(c.quote?.exact||c.quote||c.text||$('target-query').value)+'] '+(c.context?.suffix||c.suffix||''))));notice(result.candidates.length+' matching locations. Choose one, then use location.')}catch(e){notice(e.message,true)}};
$('close').onclick=async()=>{try{await request('/api/close',{});text('session-state','closed');notice('Review closed. Decisions remain in the annotation file.');for(const b of document.querySelectorAll('[data-action], [data-highlight-control], #reload, #close, #locate, #discard'))b.disabled=true}catch(e){notice(e.message,true)}};
reload().catch(e=>notice(e.message,true));
 });
}());
