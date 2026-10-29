import {approvedGoogleUser, response, jsonBody} from '../../_david_link_shared.js';

const sameOrigin = req => {
 const origin = String(req.headers.origin||'');
 const expected = String(process.env.PUBLIC_ORIGIN||'').replace(/\/$/,'');
 return !origin || (expected && origin === expected);
};
const goodId = s => typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const modes=['TODO','IN_PROGRESS','BLOCKED','REVIEW','DONE'];
const priority=['P0','P1','P2','P3'];
async function rpc(db,name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw error;
 if(data?.ok===false)throw Error('RPC validation rejected');
 return data;
}
export default async function handler(req,res){
 const action=String(req.query?.action||'');
 if(!['list','create','status','note'].includes(action))return response(res,404,{error:'not_found'});
 if(action==='list'&&req.method!=='GET')return response(res,405,{error:'method_not_allowed'});
 if(action!=='list'&&req.method!=='POST')return response(res,405,{error:'method_not_allowed'});
 if(!sameOrigin(req))return response(res,403,{error:'origin_not_allowed'});
 try{
  const ctx=await approvedGoogleUser(req);
  if(!ctx)return response(res,401,{error:'google_login_required'});
  const db=ctx.db;
  const portal=await rpc(db,'david_operator_portal_snapshot');
  if(portal?.active!==true || !['admin','worker'].includes(portal.role))
   return response(res,403,{error:'verified_operator_code_required',message:'Потвърди личния си Google/Operator код преди работа със задачите.'});
  const isAdmin=portal.role==='admin';
  if(action==='list'){
   const board=await rpc(db,isAdmin?'david_admin_task_board':'david_my_task_board');
   const notes=await rpc(db,'david_task_notes',{p_task_id:null,p_message:null});
   const tasks=Array.isArray(board?.tasks)?board.tasks:[];
   const allNotes=Array.isArray(notes?.comments)?notes.comments:[];
   const grouped=new Map();
   for(const item of allNotes){const id=item.task_id;if(!goodId(id))continue;const group=grouped.get(id)||[];group.push({message:item.message,author:item.author,created_at:item.created_at});grouped.set(id,group)}
   const safeTasks=tasks.map(t=>({
    id:t.id,title:t.title,description:t.description,priority:t.priority,status:t.status,source:t.source,
    email:isAdmin?t.email:undefined,created_at:t.created_at,notes:(grouped.get(t.id)||[]).slice(0,50)
   }));
   const workers=isAdmin && Array.isArray(board?.invites)?board.invites
     .filter(x=>typeof x.email==='string'&&x.email.length<256)
     .map(x=>({email:x.email,name:x.name||x.email,status:x.status})): [];
   return response(res,200,{ok:true,role:portal.role,tasks:safeTasks,workers});
  }
  const b=jsonBody(req);
  if(action==='create'){
   if(!isAdmin)return response(res,403,{error:'admin_required'});
   const email=String(b.email||'').trim().toLowerCase();
   const title=String(b.title||'').trim();
   const description=String(b.description||'');
   if(!/^[^@\s]{1,90}@[^@\s]{1,160}$/.test(email)||title.length<4||title.length>180||description.length>6000||!priority.includes(b.priority))
    return response(res,400,{error:'invalid_assignment'});
   const data=await rpc(db,'david_admin_create_assignment',{
    p_worker_email:email,p_title:title,p_description:description,p_priority:b.priority,p_due_at:null,p_source:'human'
   });
   return response(res,200,{ok:true,taskId:data.task_id});
  }
  if(!goodId(b.task_id))return response(res,400,{error:'invalid_task_id'});
  if(action==='status'){
   if(!modes.includes(b.status))return response(res,400,{error:'invalid_status'});
   await rpc(db,'david_update_assignment_status',{p_task_id:b.task_id,p_status:b.status});
   return response(res,200,{ok:true});
  }
  const message=String(b.message||'').trim();
  if(!message||message.length>1500)return response(res,400,{error:'invalid_note'});
  await rpc(db,'david_task_notes',{p_task_id:b.task_id,p_message:message});
  return response(res,200,{ok:true});
 }catch(error){
  // Do not expose SQL internals, auth identities or database details.
  const code=String(error?.code||'');
  return response(res,code==='42501'?403:503,{error:code==='42501'?'permission_denied':'tasks_unavailable'});
 }
}
