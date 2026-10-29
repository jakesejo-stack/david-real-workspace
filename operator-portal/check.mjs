import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder=mkdtempSync(join(tmpdir(),'soulflame-operator-'));
const files=['index.html','admin-dashboard.html','admin.html'];
for(const file of files){
 const html=readFileSync(new URL('./'+file,import.meta.url),'utf8');
 const m=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert(m,'Module script missing: '+file);
 const js=join(folder,file+'.mjs');writeFileSync(js,m[1]);
 const r=spawnSync(process.execPath,['--check',js],{encoding:'utf8'});
 assert.equal(r.status,0,'Syntax invalid '+file+' '+r.stderr);
 assert(html.includes('supabase-js'),'Original Google/Supabase auth not preserved: '+file);
 console.log('PASS: '+file+' valid module syntax');
}
const p=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert(p.includes('SoulFlame · DPP Operator Login'));
assert(p.includes('id="company-search"'));
assert(p.includes('david_operator_portal_snapshot'));
assert(p.includes("eq('worker_user_id',currentUser.id)"));
assert(!p.includes('>Company Info<'),'No separate Company Info menu');
const admin=readFileSync(new URL('./admin-dashboard.html',import.meta.url),'utf8');
assert(admin.includes('david_admin_dashboard_snapshot'));
assert(admin.includes('loadManualNotes'));
assert(admin.includes('worker_user_id'));
console.log('PASS: original UI, guarded Google session, private worker history and admin source');
