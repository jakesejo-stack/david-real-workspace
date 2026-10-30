import {readFile,writeFile,cp} from 'node:fs/promises';
let html=await readFile(new URL('../index.html',import.meta.url),'utf8');
html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>','<link rel="stylesheet" href="/call-center-upgrade.css"></head>');
html=html.replace('</body>','<div style="position:fixed;bottom:2px;left:4px;font:10px system-ui;z-index:100;background:#fff4cf;color:#6a5218;padding:3px 7px">QA · тестови данни · без реални обаждания</div><script type="module" src="/qa-ui.mjs"></script></body>');
await writeFile(new URL('../dist/qa.html',import.meta.url),html);
await cp(new URL('./ui.mjs',import.meta.url),new URL('../dist/qa-ui.mjs',import.meta.url));
