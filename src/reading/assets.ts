import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One allowlist and runtime bundle for every prose review mode. Never join request paths to disk paths. */
export const REVIEW_PAGES = {
  index: { file: 'index.html', type: 'text/html; charset=utf-8' },
  app: { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  style: { file: 'style.css', type: 'text/css; charset=utf-8' },
  review: { file: 'review.js', type: 'text/javascript; charset=utf-8' },
  annotations: { file: 'annotations.js', type: 'text/javascript; charset=utf-8' },
} as const;
export type PageKey = keyof typeof REVIEW_PAGES;
/** The vendored fonts and their licences, by exact request path (a font fetch cannot carry the token header, so these are served without one).
 *  The files are read once at start from runtime/reading/fonts; nothing in a request is ever joined to a disk path. */
export const REVIEW_FONTS = {
  '/fonts/courier-prime-400.ttf': { file: 'fonts/courier-prime-400.ttf', type: 'font/ttf' },
  '/fonts/courier-prime-700.ttf': { file: 'fonts/courier-prime-700.ttf', type: 'font/ttf' },
  '/fonts/atkinson-400.ttf': { file: 'fonts/atkinson-400.ttf', type: 'font/ttf' },
  '/fonts/atkinson-700.ttf': { file: 'fonts/atkinson-700.ttf', type: 'font/ttf' },
  '/fonts/OFL-CourierPrime.txt': { file: 'fonts/OFL-CourierPrime.txt', type: 'text/plain; charset=utf-8' },
  '/fonts/OFL-Atkinson.txt': { file: 'fonts/OFL-Atkinson.txt', type: 'text/plain; charset=utf-8' },
} as const;
export type AssetPath = keyof typeof REVIEW_FONTS;

export const REVIEW_RUNTIME = join(import.meta.dirname, '..', '..', 'runtime', 'reading');
export const REVIEW_ROUTES: Readonly<Record<string,PageKey>> = Object.freeze({ '/app.js':'app', '/style.css':'style', '/review.js':'review', '/annotations.js':'annotations' });
export function reviewPage(mode: 'reading'|'annotations' = 'reading'): string {
  const page=readFileSync(join(REVIEW_RUNTIME,'index.html'),'utf8');
  return mode==='reading'?page:page.replace('<body>','<body data-review-mode="annotations">').replace('<title>Reading</title>','<title>Annotations | Prose review</title>');
}
export function reviewAssets(): Map<string,{type:string;body:Buffer}> {
  const result=new Map<string,{type:string;body:Buffer}>();
  for(const [path,key] of Object.entries(REVIEW_ROUTES)) {const spec=REVIEW_PAGES[key];result.set(path,{type:spec.type,body:readFileSync(join(REVIEW_RUNTIME,spec.file))});}
  for(const [path,spec] of Object.entries(REVIEW_FONTS))result.set(path,{type:spec.type,body:readFileSync(join(REVIEW_RUNTIME,spec.file))});
  return result;
}
