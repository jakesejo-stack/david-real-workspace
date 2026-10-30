import {mkdir,copyFile} from 'node:fs/promises';
// Restore ONLY public assets; do not manufacture missing server-side API handlers.
await mkdir('public/assets',{recursive:true});
await copyFile('recovery/compiled-frontend/assets/index-p3-2.js','public/assets/index-p3-2.js');
