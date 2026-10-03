import { readFileSync } from 'node:fs';
import { fixture } from './helpers.ts';

export const textOf = (name: string) => readFileSync(fixture(`verse/${name}`), 'utf8').replaceAll('\r\n', '\n');
/** A verse draft from its form and body. */
export const verse = (form: string, body: string, front = '') => `---\nform: ${form}\n${front}---\n${body}\n`;

/** A villanelle built from its refrains: A1 b A2 / a b A1 / a b A2 / a b A1 / a b A2 / a b A1 A2. */
const A1 = 'The light returns along the shore';
const A2 = 'We wait for what was lost before';
const VILLANELLE_A = ['Beneath the gulls, beside the door', 'Between the ropes and the rusted floor', 'Behind the nets, the weathered four', 'Above the boats, the water roar', 'Beyond the pier, the cold and more'];
const VILLANELLE_B = ['We keep the lamp beside the night', 'The harbour sleeps in silver white', 'A single sail goes out of sight', 'The windows shine with borrowed bright', 'The fishing fleet is gone in flight', 'And nothing now is quite as right'];
export function villanelle(opts: { drop?: number; refrain12?: string } = {}): string {
  const a = VILLANELLE_A;
  const b = VILLANELLE_B;
  const lines = [A1, b[0]!, A2, a[0]!, b[1]!, A1, a[1]!, b[2]!, A2, a[2]!, b[3]!, opts.refrain12 ?? A1, a[3]!, b[4]!, A2, a[4]!, b[5]!, A1, A2];
  if (opts.drop !== undefined) lines.splice(opts.drop, 1);
  const out: string[] = [];
  let at = 0;
  for (const n of [3, 3, 3, 3, 3, 4]) { out.push(lines.slice(at, at + n).join('\n')); at += n; }
  return verse('villanelle', out.join('\n\n'));
}

/** A sestina on six end words rotating per the form; each line is a filler phrase plus its end word. */
const SESTINA_WORDS = ['stone', 'river', 'bread', 'lamp', 'salt', 'door'];
const ROTATION = [[0, 1, 2, 3, 4, 5], [5, 0, 4, 1, 3, 2], [2, 5, 3, 0, 1, 4], [4, 2, 1, 5, 0, 3], [3, 4, 0, 2, 5, 1], [1, 3, 5, 4, 2, 0]];
const ENVOI = ['Between the river and the salt', 'the lamp is lit above the bread', 'the door is closed against the stone'];
export function sestina(opts: { swap?: { line: number; word: string }; envoi?: string[]; drop?: boolean } = {}): string {
  const lines: string[] = [];
  ROTATION.forEach((row, r) => row.forEach((w, k) => lines.push(`She walked on in the ${['early', 'cold', 'quiet', 'long', 'thin', 'late'][k]} hours of day ${r + 1} toward the ${SESTINA_WORDS[w]}`)));
  lines.push(...(opts.envoi ?? ENVOI));
  if (opts.swap) lines[opts.swap.line - 1] = lines[opts.swap.line - 1]!.replace(/\w+$/, opts.swap.word);
  if (opts.drop) lines.splice(20, 1);
  const out: string[] = [];
  const stanzaLines = lines.slice(0, lines.length - 3);
  for (let i = 0; i < stanzaLines.length; i += 6) out.push(stanzaLines.slice(i, i + 6).join('\n'));
  out.push(lines.slice(-3).join('\n'));
  return verse('sestina', out.join('\n\n'));
}
