import { loadDocument } from '../document.ts';
import { loadVoices, voiceFor } from '../voice.ts';
import { words } from '../text.ts';
import { readManifest } from './import.ts';

/** Observations across explicitly selected files; refrains remain visible, never silently deduplicated. */
export function reportRepetition(project:string,files:string[]) {
  type Location={file:string;manifest?:string;slot:string;line:number;speaker:string;text:string};
  const voices=loadVoices(project);const locations=files.flatMap<Location>(file=>{
    if(/\.json$/i.test(file)){const m=readManifest(file);return m.slots.map(s=>({file:s.file,manifest:file,slot:s.id,line:(m.files.find(f=>f.file===s.file)?.snapshot.slice(0,s.locator.start).split('\n').length??1),speaker:s.speaker,text:s.original}));}
    return loadDocument(file).blocks.filter(b=>['line','choice','bark'].includes(b.kind)).map(b=>({file,manifest:undefined,slot:String(b.meta?.node??b.meta?.pool??b.line),line:b.line,speaker:b.speaker??'unknown',text:b.text}));
  });
  const exact=new Map<string,typeof locations>();for(const l of locations)exact.set(l.text,[...(exact.get(l.text)??[]),l]);
  const duplicates=[...exact].filter(([,ls])=>ls.length>1).map(([text,locations])=>({text,locations}));
  const catchphrases=voices.flatMap(voice=>voice.catchphrases.map(phrase=>{
    const selected=locations.filter(l=>voiceFor(voices,l.speaker)?.id===voice.id);const denominator=selected.reduce((n,l)=>n+words(l.text).length,0);
    const matched=selected.flatMap(l=>{const text=l.text.toLocaleLowerCase(),needle=phrase.toLocaleLowerCase();let count=0,pos=0;while((pos=text.indexOf(needle,pos))>=0){count++;pos+=needle.length;}return count?[{...l,count}]:[];});
    const occurrences=matched.reduce((n,l)=>n+l.count,0),per1000=denominator?occurrences*1000/denominator:0;
    return {voice:voice.id,phrase,occurrences,words:denominator,per1000,locations:matched,...(voice.catchphraseMaxPer1000!==undefined?{ownerThreshold:voice.catchphraseMaxPer1000,aboveOwnerThreshold:per1000>voice.catchphraseMaxPer1000}:{}),basis:'Observed occurrences; intentional refrains and shared references remain included'};
  }));
  return {files,slots:locations.length,duplicates,catchphrases};
}
