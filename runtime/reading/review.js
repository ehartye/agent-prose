// Common review primitives. Authored content is always text; domain controllers own decisions.
(function () {
  'use strict';
  const modes = new Map();
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
  function queueItem({who,where,status,state='',letter='',current=false,label,onClick,attrs={}}) {
    return btn('',onClick,'qitem',{'aria-current':current?'true':undefined,...(label?{'aria-label':label}:{}),...attrs},
      h('span',{class:'state '+state,'data-l':letter,'aria-hidden':'true'}),
      h('span',{class:'qtext'},h('span',{class:'who',text:who}),h('span',{class:'where',text:where}),h('span',{class:'qstatus',text:status})));
  }
  function fontsFooter() {
    if(document.querySelector('.site-foot'))return;
    document.body.appendChild(h('footer',{class:'site-foot'},'Fonts: SIL OFL 1.1 - ',h('a',{href:'/fonts/OFL-CourierPrime.txt',text:'Courier Prime'}),' - ',h('a',{href:'/fonts/OFL-Atkinson.txt',text:'Atkinson Hyperlegible'})));
  }
  window.ProseReview=Object.freeze({h,button:btn,notice,queueItem,fontsFooter,
    registerMode(name,start){if(modes.has(name))throw Error('Duplicate review mode');modes.set(name,start);},
    startMode(name){const start=modes.get(name);if(!start)throw Error('Unknown review mode');start();}
  });
}());
