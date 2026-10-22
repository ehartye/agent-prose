import { buildProgram } from '../src/cli.ts';
const dimensions = ['vocabulary', 'syntax', 'organization', 'knowledge', 'reasoning', 'task'];
export function assessmentInput(count = 10) {
  return {
    schema: 'prose/assessment-input@1', title: 'Ten passages: evidence and explanation',
    reader: { language: 'en-US', schoolGrade: 9, profile: 'Average U.S. high school freshman', priorKnowledge: 'Can compare quantities; introductory subject knowledge.', task: 'Independent reading and explanation of the main claim.', supports: [] },
    passages: Array.from({ length: count }, (_, index) => {
      const claim = `Passage ${index + 1} distinguishes a reported pattern from its cause.`;
      const text = [claim, ...Array.from({ length: 18 }, () => 'The narrator reports what happened but leaves the reason uncertain. A clear explanation must preserve that uncertainty and identify which evidence supports the claim.')].join('\n\n');
      return { id: `p${index + 1}`, title: `Passage ${index + 1}`, text,
        report: index === count - 1 ? null : {
          origin: 'agent', recommendation: index % 3 === 0 ? 'revise' : 'ready', summary: `Review the language in passage ${index + 1}, retaining the distinction between observation and explanation.`,
          criteria: dimensions.map(criterion => ({ criterion, rating: 'light', evidence: [claim], reason: 'The distinction is explicit, but an introductory reader may need a local explanation.', action: 'Keep the qualification and clarify the referent.' })),
          proposals: [{ kind: 'text-edit', location: 'Opening sentence', description: 'Retain the causal qualification while clarifying the actor.', before: claim, after: `Passage ${index + 1} reports a pattern; it does not establish its cause.` }],
          checks: ['No numerical readability diagnostic was run.'], limits: ['Synthetic interface fixture; not learner testing.'],
        },
      };
    }),
  };
}
export async function assessmentCommand(args: string[]): Promise<any> {
  let value: unknown;
  await buildProgram({ emit: item => { value = item; } }).parseAsync(['node', 'prose', 'assessment', ...args]);
  return value;
}
