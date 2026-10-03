import type { DialogGraph } from './dialog-types.ts';
import type { Format } from './kinds.ts';

export type { Format };

/** Every unit a parser can emit. Groupings of kinds live in src/kinds.ts. */
export type BlockKind =
  | 'scene' | 'action' | 'line' | 'parenthetical' | 'transition' | 'centered' | 'lyric'
  | 'section' | 'synopsis' | 'page-break'
  | 'heading' | 'paragraph' | 'step' | 'list-item' | 'quote'
  | 'choice' | 'bark' | 'note';

export interface Block {
  kind: BlockKind;
  text: string;
  /** 1-based line in the source file where the block starts. */
  line: number;
  speaker?: string;
  meta?: Record<string, unknown>;
}

export interface Doc {
  path: string;
  format: Format;
  form: string;
  register?: string;
  meta: Record<string, unknown>;
  blocks: Block[];
  graph?: DialogGraph;
}
