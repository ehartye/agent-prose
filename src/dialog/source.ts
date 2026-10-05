import { parse, parseExpressionAt } from 'acorn';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { ProseError } from '../errors.ts';

export type DataPath = (string | number)[];
export interface Leaf { path: DataPath; value: string; start: number; end: number }
export interface Source { file: string; text: string; data: unknown; leaves: Leaf[]; unsupported: Array<{ path: DataPath; expression: string }> }
// Acorn's discriminated AST spans many node types. All fields are checked by the literal reader below.
type Ast = any;
const keyOf = (n: Ast): string => n.type === 'Identifier' ? n.name : String(n.value);
const clean = (n: Ast): unknown => Array.isArray(n) ? n.map(clean) : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).filter(([k]) => !['start', 'end', 'loc', 'range', 'raw'].includes(k)).map(([k,v]) => [k,clean(v)])) : n;
const signatures: Record<string,string[]> = {
  L: ['(id,kind,text,tags={})=>Object.freeze({id,kind,text,...tags})'],
  f: ['flag=>({flag})', '(flag,is)=>(is===undefined?{flag}:{flag,is})'],
  X: ['(id,a,b,first,second,tags={})=>Object.freeze({id,a,b,lines:Object.freeze([Object.freeze({speaker:a,text:first}),Object.freeze({speaker:b,text:second})]),...tags})'],
  person: ['(id,name,role,appears)=>Object.freeze({id,name,role,kind:"character",portrait:id,voice:`${id}-voice`,appears})'],
};
export function readSource(file: string, text: string): Source {
  const result: Source = { file,text,data:null,leaves:[],unsupported:[] };
  const bad = (n: Ast, path: DataPath) => { result.unsupported.push({ path, expression: text.slice(n.start,n.end).slice(0,160) }); return null; };
  if (/\.ya?ml$/i.test(file)) {
    const doc = parseDocument(text);
    if (doc.errors.length) throw new ProseError('E_PARSE', doc.errors[0].message);
    const walk = (n: unknown, path: DataPath): void => {
      if (isScalar(n) && typeof n.value === 'string' && n.range) result.leaves.push({ path,value:n.value,start:n.range[0],end:n.range[1] });
      if (isMap(n)) for (const p of n.items) { if (!isScalar(p.key) || typeof p.key.value !== 'string') throw new ProseError('E_SCHEMA','Dialogue keys must be strings'); walk(p.value,[...path,p.key.value]); }
      if (isSeq(n)) n.items.forEach((v,i)=>walk(v,[...path,i]));
    };
    result.data = doc.toJS({ maxAliasCount: 0 }); walk(doc.contents,[]); return result;
  }
  const env = new Map<string,Ast>(); const approved = new Set<string>(); const visiting = new Set<string>();
  const literal = (n: Ast, path: DataPath): unknown => {
    if (!n) return null;
    if (n.type === 'Literal' && !n.regex && typeof n.value !== 'bigint') { if (typeof n.value === 'string') result.leaves.push({path,value:n.value,start:n.start,end:n.end}); return n.value; }
    if (n.type === 'TemplateLiteral' && n.expressions.length === 0) { const value=n.quasis[0].value.cooked; result.leaves.push({path,value,start:n.start,end:n.end}); return value; }
    if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal' && typeof n.argument.value === 'number') return -n.argument.value;
    if (n.type === 'Identifier' && env.has(n.name) && !visiting.has(n.name)) { visiting.add(n.name); const v=literal(env.get(n.name),path); visiting.delete(n.name); return v; }
    if (n.type === 'ArrayExpression') return n.elements.map((v:Ast,i:number)=>literal(v,[...path,i]));
    if (n.type === 'ObjectExpression') {
      const out: Record<string,unknown> = Object.create(null);
      for (const p of n.properties) {
        if (p.type === 'SpreadElement') { const v=literal(p.argument,path); if (!v || typeof v !== 'object' || Array.isArray(v)) return bad(p,path); Object.assign(out,v); continue; }
        if (p.computed || p.kind !== 'init' || p.method) return bad(p,path);
        const k=keyOf(p.key); if (Object.hasOwn(out,k) || ['__proto__','prototype','constructor'].includes(k)) throw new ProseError('E_SCHEMA',`Duplicate or unsafe key ${k}`);
        out[k]=literal(p.value,[...path,k]);
      }
      return out;
    }
    if (n.type === 'CallExpression') {
      if (n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.object.name === 'Object' && n.callee.property.name === 'freeze' && n.arguments.length === 1 && !env.has('Object')) return literal(n.arguments[0],path);
      if (n.callee.type === 'Identifier' && approved.has(n.callee.name)) {
        const args=n.arguments; const name=n.callee.name;
        if (name === 'L' && args.length >= 3 && args.length <= 4) return {id:literal(args[0],[...path,'id']),kind:literal(args[1],[...path,'kind']),text:literal(args[2],[...path,'text']),...(args[3]?literal(args[3],path) as object:{})};
        if (name === 'f' && args.length >= 1 && args.length <= 2) return {flag:literal(args[0],[...path,'flag']),...(args[1]?{is:literal(args[1],[...path,'is'])}:{})};
        if (name === 'X' && args.length >= 5 && args.length <= 6) return {id:literal(args[0],[...path,'id']),a:literal(args[1],[...path,'a']),b:literal(args[2],[...path,'b']),lines:[{speaker:literal(args[1],[...path,'lines',0,'speaker']),text:literal(args[3],[...path,'lines',0,'text'])},{speaker:literal(args[2],[...path,'lines',1,'speaker']),text:literal(args[4],[...path,'lines',1,'text'])}],...(args[5]?literal(args[5],path) as object:{})};
        if (name === 'person' && args.length === 4) { const id=literal(args[0],[...path,'id']); return {id,name:literal(args[1],[...path,'name']),role:literal(args[2],[...path,'role']),kind:'character',portrait:id,voice:`${id}-voice`,appears:literal(args[3],[...path,'appears'])}; }
      }
    }
    return bad(n,path);
  };
  try {
    if (/\.json$/i.test(file)) { JSON.parse(text.replace(/^\uFEFF/,'')); result.data=literal(parseExpressionAt(text, text.startsWith('\uFEFF')?1:0,{ecmaVersion:'latest'}),[]); return result; }
    if (!/\.(?:mjs|js|cjs)$/i.test(file)) throw new ProseError('E_USAGE','Supported dialogue sources are JSON, YAML and static JavaScript');
    const ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}) as Ast;
    const exported: string[]=[];
    for (const st of ast.body) {
      const d=st.type==='ExportNamedDeclaration'?st.declaration:st;
      if (d?.type==='VariableDeclaration') for (const v of d.declarations) {
        if (v.id.type !== 'Identifier') continue;
        if (env.has(v.id.name)) throw new ProseError('E_SCHEMA',`Duplicate declaration ${v.id.name}`);
        env.set(v.id.name,v.init);
        if (st.type==='ExportNamedDeclaration') exported.push(v.id.name);
      }
    }
    for (const [name,sigs] of Object.entries(signatures)) if (env.has(name) && sigs.some(s=>JSON.stringify(clean(parseExpressionAt(s,0,{ecmaVersion:'latest'})))===JSON.stringify(clean(env.get(name))))) approved.add(name);
    const names=exported.filter(n=>/^(BRIDGE_DIALOG|POOLS|EXCHANGES|STATUS_LINES|DIALOG|SPEAKERS|LIMITS|LINE_MAX|LABEL_MAX|AMBIENT_LINE_MAX)$/.test(n));
    if (!names.some(n=>!/(?:MAX|LIMITS|SPEAKERS)$/.test(n))) throw new ProseError('E_SCHEMA','No supported exported dialogue data found');
    result.data=Object.fromEntries(names.map(n=>[n,literal(env.get(n),[n])])); return result;
  } catch (e) { if (e instanceof ProseError) throw e; throw new ProseError('E_PARSE',`Cannot read static dialogue: ${(e as Error).message}`); }
}
export function valueAt(data: unknown, path: DataPath): unknown { let x: any=data; for (const k of path) { if (x === null || typeof x !== 'object' || !Object.hasOwn(x,k)) throw new ProseError('E_SCHEMA','Missing structural dialogue path'); x=x[k]; } return x; }
export function patchSource(source: Source, edits: Array<{path:DataPath;old:string;text:string}>): string {
  const seen=new Set<string>(); const patches=edits.map(e=>{
    const key=JSON.stringify(e.path); if (seen.has(key)) throw new ProseError('E_CONFLICT','Duplicate literal edit'); seen.add(key);
    const matches=source.leaves.filter(l=>JSON.stringify(l.path)===key); if (matches.length !== 1 || matches[0].value !== e.old) throw new ProseError('E_CONFLICT','Source locator or old text changed');
    const l=matches[0]; if (source.leaves.filter(x=>x.start===l.start&&x.end===l.end).length!==1) throw new ProseError('E_SCHEMA','A shared literal cannot be changed independently'); const raw=source.text.slice(l.start,l.end); let replacement=JSON.stringify(e.text);
    if (/\.(?:m?js|cjs)$/i.test(source.file) && raw[0] === "'") replacement="'"+e.text.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+"'";
    return { ...l,replacement };
  }).sort((a,b)=>b.start-a.start);
  for(let i=1;i<patches.length;i++)if(patches[i].end>patches[i-1].start)throw new ProseError('E_SCHEMA','Overlapping literal edits');
  let text=source.text; for (const p of patches) text=text.slice(0,p.start)+p.replacement+text.slice(p.end);
  const parsed=readSource(source.file,text); for(const e of edits) if(valueAt(parsed.data,e.path)!==e.text) throw new ProseError('E_SCHEMA','Replacement did not preserve parsed text'); return text;
}
