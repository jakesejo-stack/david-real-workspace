import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const bundlePath = new URL('public/assets/index-p3-2.js', root);
let bundle = await readFile(bundlePath, 'utf8');
const marker = '\n/* DAVID_CALL_CENTER_UPGRADE */';
if (!bundle.includes(marker)) {
  const end = bundle.lastIndexOf('_u();');
  if (end < 0) throw Error('Recovered original boot entry was not found; refusing an unsafe patch.');
  const injection = `
/* DAVID_CALL_CENTER_UPGRADE */
const davidLegacyRender = ct;
const davidLegacyDesk = davidManualDesk;
const davidCallCenterUpgrade = installCallCenterUpgrade({
 state:g, escape:I, toast:re, refresh:Pe, render:()=>ct(),
 loadTask:()=>davidLoadDeskTask(), startTaskCall:()=>davidStartTaskTwilio(), legacyDesk:()=>davidLegacyDesk()
});
ct = function(){
 const result=davidLegacyRender();
 davidCallCenterUpgrade.afterRender();
 if(result && typeof result.then==='function')return result.then(value=>{davidCallCenterUpgrade.afterRender();return value});
 return result;
};
davidManualDesk = function(){return davidCallCenterUpgrade.renderDesk()};
`;
  bundle = 'import {installCallCenterUpgrade} from "/david-modules/call-center-upgrade.mjs";\n' + bundle.slice(0, end) + injection + bundle.slice(end);
}
await mkdir(new URL('dist/', root), {recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/assets/index-p3-2.js',root),bundle);
let html = await readFile(new URL('index.html',root),'utf8');
html = html.replace('</head>','<link rel="stylesheet" href="/call-center-upgrade.css"></head>');
await writeFile(new URL('dist/index.html',root),html);
console.log('Recovered frontend built; serverless backend is not included. Production deployment remains blocked.');
