import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApplication,submitApplication,adminCreateCompanyTask,
 saveTaskContact,myCompanies,companyDetail,OUTCOMES} from '../src/operator-company-workflows.mjs';

test('operator must provide name, country, languages and E.164 phone',()=>{
 assert.throws(()=>validateApplication({name:'A',country:'BG',languages:[],phone:'123'}));
 assert.deepEqual(validateApplication({
  name:'  Ivan Ivanov ',country:' Bulgaria ',languages:['Bulgarian','English','English'],
  phone:'+359888123456'}),{
  name:'Ivan Ivanov',country:'Bulgaria',languages:['Bulgarian','English'],
  phone:'+359888123456'
 });
});
test('candidate application uses server RPC, never issues admin permissions',async()=>{
 let rpc;
 const db={rpc:async(name,args)=>{rpc={name,args};return {data:{ok:true,status:'pending'},error:null}}};
 await submitApplication(db,{name:'Ivan Ivanov',country:'Bulgaria',languages:['Bulgarian'],phone:'+359888123456'});
 assert.equal(rpc.name,'david_operator_submit_application');
 assert.equal(rpc.args.p_full_name,'Ivan Ivanov');
});
test('atomic admin assignment uses operator UUID and company UUID',async()=>{
 let args;
 const db={rpc:async(name,data)=>{args={name,data};return {data:{ok:true,task_id:'x'},error:null}}};
 await adminCreateCompanyTask(db,{workerId:'worker-uuid',companyId:'company-uuid',title:'Contact'});
 assert.equal(args.name,'david_admin_create_company_task');
 assert.equal(args.data.p_worker_user_id,'worker-uuid');
 assert.equal(args.data.p_company_id,'company-uuid');
 assert.equal(args.data.p_title,'Contact');
});
test('failed admin assignment rejects rather than reporting success',async()=>{
 const db={rpc:async()=>({data:{ok:false},error:null})};
 await assert.rejects(()=>adminCreateCompanyTask(db,{workerId:'w',companyId:'c',title:'Contact'}));
});
test('manual interaction is not labelled as verified Twilio call',async()=>{
 let result;
 const db={rpc:async(name,args)=>{result={name,args};return {data:{ok:true,source:'operator_self_reported'},error:null}}};
 const r=await saveTaskContact(db,{taskId:'task-uuid',outcome:'no_answer',notes:'No answer',confirmed:true});
 assert.equal(result.args.p_contact_confirmed,true);
 assert.equal(r.source,'operator_self_reported');
 assert.equal(OUTCOMES.callback,'Ще се обадят отново');
});
test('my company search and detail are scoped by dedicated SQL 018 RPCs',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});
  if(name==='david_worker_my_companies')return {data:[{company_id:'company-uuid',company_name:'Example',last_outcome:'note'}],error:null};
  return {data:{ok:true,company:{name:'Example'},tasks:[],my_history:[]},error:null};
 },from:()=>{throw Error('Browser must not directly read unscoped company table')}};
 const companies=await myCompanies(db,'Spain');
 const detail=await companyDetail(db,'company-uuid');
 assert.equal(companies[0].company_name,'Example');
 assert.equal(companies[0].last_outcome,'note');
 assert.equal(detail.company.name,'Example');
 assert.equal(calls[0].name,'david_worker_my_companies');
 assert.equal(calls[0].args.p_query,'Spain');
 assert.equal(calls[1].name,'david_worker_company_detail');
 assert.equal(calls[1].args.p_company_id,'company-uuid');
});
test('server denies worker access to another company without fallback',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'Company not in your own work history'}})};
 await assert.rejects(()=>companyDetail(db,'other-company'),/Company not in your own work history/);
});
test('invalid worker task response does not silently become empty',async()=>{
 const {myTasks}=await import('../src/operator-company-workflows.mjs');
 await assert.rejects(()=>myTasks({rpc:async()=>({data:{ok:true,tasks:[]},error:null})}),/Невалиден списък/);
});
