// The dialog YAML schema and the graph type the IR carries. Kept apart from the parser so the IR never imports one.
import { z } from 'zod';

const Choice = z.strictObject({
  text: z.string().min(1), to: z.string().min(1),
  condition: z.string().min(1).optional(), menu: z.string().min(1).optional(), comment: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
});
const Node = z.strictObject({
  id: z.string().min(1), speaker: z.string().min(1), text: z.string().min(1),
  variants: z.array(z.string().min(1)).optional(), comment: z.string().min(1).optional(),
  choices: z.array(Choice).optional(), next: z.string().min(1).optional(), end: z.boolean().optional(),
  limit: z.number().int().positive().optional(), sourceKind: z.enum(['bubble','label','reply-label','headline']).optional(),
  revisit: z.enum(['intentional','rotate']).optional(),
});
const Bark = z.strictObject({
  pool: z.string().min(1), speaker: z.string().min(1), context: z.string().min(1),
  cooldown: z.number().nonnegative().optional(), lines: z.array(z.string().min(1)).min(1),
});
export const DialogSchema = z.strictObject({
  form: z.string().optional(), register: z.string().optional(), target: z.unknown().optional(), wpm: z.unknown().optional(),
  start: z.string().optional(),
  entries: z.array(z.string().min(1)).min(1).optional(),
  nodes: z.array(Node).default([]), barks: z.array(Bark).default([]),
});

export type DialogNode = z.infer<typeof Node>;
export type DialogGraph = z.infer<typeof DialogSchema> & {
  /** First-wins line per node id. */
  nodeLines: Record<string, number>;
  /** Line of each node by its index in `nodes`, so a duplicate id reports its own line. */
  nodeLineByIndex: number[];
  barkLines: Record<string, number>;
};
