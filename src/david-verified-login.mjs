/**
 * Read-only, fail-closed DAVID authentication guard.
 *
 * Integrate into the ORIGINAL recovered Vite source before loading any Worker
 * or Admin CRM UI. The browser checks are UX guards only; Supabase RLS/RPC
 * remains the authority for data and changes.
 *
 * IMPORTANT: portal session and DAVID OS worker sessions are DIFFERENT.
 * Do not treat an OS code redemption as a portal session without a verified
 * server-side one-time handoff. Do not send tokens between domains.
 */

const ADMIN_EMAILS = new Set([
  'borquitokonsejo@gmail.com',
  'soulflame.mitko@gmail.com',
  'soulflame.dpp@gmail.com',
]);

const DENIED = Object.freeze({ state: 'not_approved' });

function fail(reason) {
  return { state: 'error', reason: String(reason || 'Unable to verify access') };
}

export async function verifyDavidLogin(supabase, options = {}) {
  if (!supabase?.auth?.getUser || typeof supabase?.from !== 'function') {
    return fail('Authenticated Supabase client is required');
  }

  // Code session is required by default for the future code-gated original.
  // Legacy behavior must be opted into explicitly, never implicitly.
  const requireCodeSession = options.requireCodeSession !== false;
  let auth;
  try {
    auth = await supabase.auth.getUser(); // Network-backed user verification.
  } catch {
    return fail('Google user verification failed');
  }
  if (auth?.error) return fail('Google user verification failed');
  const user = auth?.data?.user;
  if (!user?.id) return { state: 'signed_out' };
  if (!user?.email_confirmed_at) return DENIED;

  // These queries are governed by RLS; no client-asserted roles or IDs.
  let member, identity;
  try {
    [member, identity] = await Promise.all([
      supabase.from('david_members')
        .select('role,display_name').eq('user_id', user.id).maybeSingle(),
      supabase.from('david_worker_identities')
        .select('worker_id,active').eq('user_id', user.id).maybeSingle(),
    ]);
  } catch {
    return fail('Membership verification unavailable');
  }
  if (member?.error || identity?.error) {
    return fail('Membership verification unavailable');
  }
  const role = member?.data?.role;
  if (!['worker', 'admin'].includes(role) || identity?.data?.active !== true ||
    !identity?.data?.worker_id) return DENIED;
  if (role === 'admin' && !ADMIN_EMAILS.has(String(user.email || '').toLowerCase())) {
    return DENIED;
  }

  // An existing worker/admin role is NOT proof of successful code redemption.
  let portal = null;
  if (requireCodeSession) {
    if (typeof supabase.rpc !== 'function') return fail('Code session verifier unavailable');
    try {
      const result = await supabase.rpc('david_operator_portal_snapshot');
      if (result?.error) return fail('Code session verification failed');
      portal = result?.data;
    } catch {
      return fail('Code session verification failed');
    }
    if (!portal?.active) {
      return {
        state: portal?.reason === 'code_required' ? 'code_required' : 'not_approved',
      };
    }
    // The verified server snapshot must match this active identity exactly.
    if (portal.role !== role || portal.worker_id !== identity.data.worker_id) {
      return DENIED;
    }
  }

  return {
    state: 'ready',
    user: { id: user.id, email: user.email },
    role,
    workerId: identity.data.worker_id,
    displayName: member.data.display_name || '',
    portalExpiresAt: portal?.expires_at || null,
  };
}
