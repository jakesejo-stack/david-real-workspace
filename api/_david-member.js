import {createClient} from '@supabase/supabase-js';
export async function requireMember(req){
 const url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)throw Object.assign(Error('Database configuration missing'),{status:503});
 const token=/^Bearer (.+)$/.exec(String(req.headers.authorization||''))?.[1];
 if(!token)throw Object.assign(Error('Google login required'),{status:401});
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user?.id||!user.email_confirmed_at||!user.app_metadata?.providers?.includes('google'))throw Object.assign(Error('Verified Google login required'),{status:401});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:member,error:memberError}=await admin.from('david_members').select('role').eq('user_id',user.id).maybeSingle();
 if(memberError||!member)throw Object.assign(Error('Approved DAVID member required'),{status:403});
 return {user,admin};
}
