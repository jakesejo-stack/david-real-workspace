import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskCallButton,resolveTaskForCall,selectionMatchesDaily,taskPhone} from '../public/david-modules/task-call.mjs';
const id='11111111-1111-4111-8111-111111111111';
const companyId='22222222-2222-4222-8222-222222222222';
function dbMock(task,company){
 const filters=[];
 return {filters,from(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},async maybeSingle(){return {data:table==='david_admin_tasks'?task:company,error:null}}};return q}};
}
test('Call destination resolves from the selected assigned company, never another task',async()=>{
 const db=dbMock({id,title:'Избраната задача',company_id:companyId,assigned_to:'worker',status:'TODO'},
  {id:companyId,company_name:'Избраната фирма',contact_phone:'+359888000000',calling_approved:true,do_not_call:false});
 const selected=await resolveTaskForCall(db,'worker',id);
 assert.equal(selected.phone,'+359888000000');
 assert.deepEqual(db.filters,[['david_admin_tasks','id',id],['david_admin_tasks','assigned_to','worker'],['david_companies','id',companyId],['david_companies','assigned_to','worker']]);
});
test('revoked, completed and blocked company tasks cannot provide a calling target',async()=>{
 await assert.rejects(resolveTaskForCall(dbMock(null,null),'worker',id));
 await assert.rejects(resolveTaskForCall(dbMock({id,status:'DONE'},null),'worker',id));
 await assert.rejects(resolveTaskForCall(dbMock({},null),'worker','not-a-uuid'));
 const result=await resolveTaskForCall(dbMock({id,company_id:companyId,status:'TODO'},
  {contact_phone:'+359888000000',calling_approved:true,do_not_call:true}),'worker',id);
 assert.equal(result.phone,'');
});
test('a selected task cannot silently dial a different daily task number',()=>{
 assert.equal(taskPhone({description:'Телефон: 0888000000'}),'+359888000000');
 assert.equal(selectionMatchesDaily({phone:'+359888000000'},{instructions:'+359888000001'}),false);
 assert.equal(selectionMatchesDaily({phone:''},{instructions:'+359888000000'}),false);
 assert.equal(selectionMatchesDaily({phone:'+359888000000'},{instructions:'0888000000'}),true);
});
test('every task has an accessible green Call button; click dispatches the selected ID',()=>{
 let event;
 const doc={createElement(){return {setAttribute(k,v){this[k]=v},addEventListener(k,fn){this[k]=fn}}},getElementById(){return {}},dispatchEvent(value){event=value}};
 const prior=globalThis.CustomEvent;globalThis.CustomEvent=class{constructor(type,opts){this.type=type;this.detail=opts.detail}};
 try{
  const button=createTaskCallButton(doc,{task_id:id,title:'Позвъни',status:'TODO'});
  assert.equal(button.className,'david-task-call');assert.equal(button.type,'button');assert.equal(button.disabled,false);
  assert.match(button['aria-label'],/Позвъни/);
  button.click({preventDefault(){},stopPropagation(){}});
  assert.equal(event.type,'david:task-call');assert.equal(event.detail.taskId,id);
  assert.equal(createTaskCallButton(doc,{id,status:'DONE'}).disabled,true);
 }finally{globalThis.CustomEvent=prior}
});
