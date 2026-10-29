import test from 'node:test';
import assert from 'node:assert/strict';
import {workerLabel,getApprovedWorkers,createWorkerTask,assignCompany} from '../src/admin-worker-picker.mjs';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const raw=[
 {user_id:a,email:'first@example.com',name:'Alex'},
 {user_id:b,email:'second@example.com',name:'Alex'}
];
test('same names display two different Gmail addresses',()=>{
 assert.notEqual(workerLabel(raw[0]),workerLabel(raw[1]));
});
test('approved list returns both verified identities',async()=>{
 const users=await getApprovedWorkers({rpc:async()=>({data:raw,error:null})});
 assert.equal(users.length,2);
 assert.equal(users[1].id,b);
});
test('task picks email by id; not by name',async()=>{
 const workers=await getApprovedWorkers({rpc:async()=>({data:raw,error:null})});
 let call;
 const db={rpc:async(name,args)=>{call={name,args};return {data:{ok:true},error:null};}};
 await createWorkerTask(db,workers,b,{title:'Contact company'});
 assert.equal(call.args.p_worker_email,'second@example.com');
});
test('blocked worker cannot be assigned from stale selection',async()=>{
 await assert.rejects(()=>assignCompany({},[{id:a,email:'first@example.com'}],'company',b));
});
