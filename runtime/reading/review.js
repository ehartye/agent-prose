// Common review primitives. Authored content is always text; domain controllers own decisions.
(function () {
  'use strict';
  const modes = new Map();
  // A host-only cookie also follows review servers when their local port changes.
  const themeCookie = 'prose-review-theme';
  function savedTheme() {
    try {
      const value = document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(themeCookie+'='))?.slice(themeCookie.length+1);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch { return 'system'; }
  }
  function applyTheme(theme) {
    if(theme==='system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme=theme;
  }
  applyTheme(savedTheme());
  function settings() {
    const button=document.getElementById('review-settings-button');
    const dialog=document.getElementById('review-settings');
    const appearance=document.getElementById('review-appearance');
    const status=document.getElementById('review-settings-status');
    button.addEventListener('click',()=>{
      appearance.value=savedTheme();
      status.textContent='';
      dialog.showModal();
    });
    document.getElementById('review-settings-close').addEventListener('click',()=>dialog.close());
    appearance.addEventListener('change',()=>{
      const theme=appearance.value;
      if(!['system','light','dark'].includes(theme))return;
      applyTheme(theme);
      document.dispatchEvent(new Event('prose-theme-change'));
      try {
        document.cookie=themeCookie+'='+(theme==='system'?'':theme)+'; Path=/; Max-Age='+(theme==='system'?'0':'31536000')+'; SameSite=Strict'+(location.protocol==='https:'?'; Secure':'');
      } catch { /* The current page still uses the chosen appearance. */ }
      status.textContent=savedTheme()===theme?'Appearance saved.':'Appearance changed for this page; browser settings prevented saving it.';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',settings,{once:true});
  else settings();
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style') throw new Error('no style attributes');
      else if (k === 'value' || k === 'disabled' || k === 'hidden' || k === 'checked') el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return el;
  }
  const btn = (text, onClick, cls, extra, ...kids) => h('button', { type: 'button', class: cls || '', text, on: { click: onClick }, ...(extra || {}) }, ...kids);
  function notice(message, hint, tone = 'error') {
    const el=document.getElementById('notice');
    el.replaceChildren(h('div',{class:'msg'},message,hint?h('span',{class:'hint',text:hint}):null),btn('Dismiss',()=>{el.hidden=true;},'link'));
    el.dataset.tone=tone;el.hidden=false;
  }
  function queueItem({who,where,status,tag,state='',letter='',current=false,label,onClick,attrs={}}) {
    return btn('',onClick,'qitem'+(tag?' qitem-passage':''),{'aria-current':current?'true':undefined,...(label?{'aria-label':label}:{}),...attrs},
      h('span',{class:'state '+state,'data-l':letter,'aria-hidden':'true'}),
      h('span',{class:'qtext'},h('span',{class:'who',text:who}),h('span',{class:'where',text:where}),tag?h('span',{class:'qstatus'},h('span',{class:'queue-tag',text:tag}),h('span',{'data-state':status,text:status})):h('span',{class:'qstatus',text:status})));
  }
  function disclosure(label,props,...children) {
    return h('details',{...(props||{}),class:'review-disclosure'+(props?.class?' '+props.class:'')},h('summary',{text:label}),h('div',{class:'disclosure-body'},...children));
  }
  window.ProseReview=Object.freeze({h,button:btn,notice,queueItem,disclosure,
    registerMode(name,start){if(modes.has(name))throw Error('Duplicate review mode');modes.set(name,start);},
    startMode(name){const start=modes.get(name);if(!start)throw Error('Unknown review mode');start();}
  });
}());
