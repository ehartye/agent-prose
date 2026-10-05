import type { Command } from 'commander';
import { dirname, resolve } from 'node:path';
import { ProseError } from '../errors.ts';
import type { Io } from '../io.ts';
import { needProject } from '../project.ts';
import { importDialog } from '../dialog/import.ts';
import { applyDialog, recoverDialog, reviewDialog, undoDialog } from '../dialog/apply.ts';
import { reportRepetition } from '../dialog/repetition.ts';

export function registerDialogCommands(program:Command,io:Io):void {
  const dialog=program.command('dialog').description('Offline dialogue import, review, guarded source apply and undo');
  dialog.command('import').argument('<source>').requiredOption('--out <path>','new dialog YAML draft').requiredOption('--manifest <path>','new versioned source manifest').option('--root <path>','source root (default: source folder)').action((source:string,opts:{out:string;manifest:string;root?:string})=>io.emit(importDialog(source,opts)));
  dialog.command('review').argument('<draft>').requiredOption('--manifest <path>','import manifest').requiredOption('--id <slot>','exact source slot identity').option('--count <n>','candidate slots, 2 through 6').option('--directions <csv>','existing set rewrite directions').action((draft:string,opts:{manifest:string;id:string;count?:string;directions?:string})=>{
    if(opts.count&&!/^[2-6]$/.test(opts.count))throw new ProseError('E_USAGE','Count must be 2 through 6');
    const project=needProject(dirname(resolve(draft)));const set=reviewDialog(project,draft,opts.manifest,opts.id,{...(opts.count?{count:Number(opts.count)}:{}),...(opts.directions?{directions:opts.directions.split(',').map(s=>s.trim())}:{})});io.emit({project,set,next:`Rewrite only ${opts.id}; then prose set check ${set.id}, predict and record the owner's pick`});
  });
  dialog.command('apply').requiredOption('--manifest <path>','sealed source manifest').requiredOption('--sets <csv>','recorded picked set ids').option('--confirm <digest>','dry-run digest authorizing exactly this plan').option('--dir <dir>','prose project').action((opts:{manifest:string;sets:string;confirm?:string;dir?:string})=>io.emit(applyDialog(needProject(opts.dir??process.cwd()),opts.manifest,opts.sets.split(',').map(s=>s.trim()).filter(Boolean),opts.confirm)));
  dialog.command('undo').requiredOption('--id <id>','apply journal id').option('--dir <dir>','prose project').action((opts:{id:string;dir?:string})=>io.emit(undoDialog(needProject(opts.dir??process.cwd()),opts.id)));
  dialog.command('recover').requiredOption('--id <id>','interrupted apply journal id').requiredOption('--mode <mode>','complete the prepared plan or restore originals').option('--dir <dir>','prose project').action((opts:{id:string;mode:string;dir?:string})=>{if(opts.mode!=='complete'&&opts.mode!=='restore')throw new ProseError('E_USAGE','Recovery mode must be complete or restore');io.emit(recoverDialog(needProject(opts.dir??process.cwd()),opts.id,opts.mode));});
  dialog.command('repetition').argument('<files...>','dialog drafts or source manifests').option('--dir <dir>','prose project containing voice bibles').action((files:string[],opts:{dir?:string})=>io.emit(reportRepetition(needProject(opts.dir??process.cwd()),files)));
}
