// Product-side DAVID OS adapter. SERVER ONLY: never bundle this into /work client.
// Ownership: Mitko DAVID OS. This is a handoff, not an active DAVID OS deployment.
// It MUST be called only AFTER DAVID has authenticated the requesting user.
// On success the host must persist a separate, secure HttpOnly operator session.
const CODE_FORMAT = /^#[A-HJ-NP-Z2-9]{12}!$/;
const EXTERNAL_ID = /^[a-zA-Z0-9:._-]{1,256}$/;
const ROLES = new Set(['worker','admin','manager']);

export class DavidBridgeError extends Error {
  constructor(publicCode, status) {
    super(publicCode);
    this.name = 'DavidBridgeError';
    this.status = status;
  }
}

export async function redeemDppCode({
  code, authenticatedDavidUserId, bridgeSecret,
  callDeskOrigin = 'https://david-real-workspace.vercel.app',
  fetchFn = fetch
}) {
  if (typeof authenticatedDavidUserId !== 'string' ||
      !EXTERNAL_ID.test(authenticatedDavidUserId)) {
    throw new DavidBridgeError('DAVID_LOGIN_REQUIRED', 401);
  }
  const formatted = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!CODE_FORMAT.test(formatted)) {
    throw new DavidBridgeError('INVALID_CODE_FORMAT', 400);
  }
  if (typeof bridgeSecret !== 'string' || bridgeSecret.length < 32) {
    throw new DavidBridgeError('DPP_LINK_NOT_CONFIGURED', 503);
  }
  if (callDeskOrigin !== 'https://david-real-workspace.vercel.app') {
    // Do not redirect one-time codes to an attacker-controlled host.
    throw new DavidBridgeError('UNAPPROVED_CALLDESK_ORIGIN', 503);
  }
  let res;
  try {
    res = await fetchFn(callDeskOrigin + '/api/integrations/david/redeem', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + bridgeSecret,
        'cache-control': 'no-store'
      },
      body: JSON.stringify({
        code: formatted,
        external_user_id: authenticatedDavidUserId
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store'
    });
  } catch {
    throw new DavidBridgeError('CALLDESK_UNAVAILABLE', 503);
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new DavidBridgeError('CODE_INVALID_EXPIRED_OR_REVOKED', 403);
    }
    if (res.status === 429) throw new DavidBridgeError('TOO_MANY_ATTEMPTS', 429);
    throw new DavidBridgeError('CALLDESK_UNAVAILABLE', 503);
  }
  const result = await res.json().catch(() => null);
  if (!result || result.active !== true ||
      !result.worker_id || !result.organization_id ||
      !ROLES.has(result.role) ||
      result.external_user_id !== authenticatedDavidUserId) {
    throw new DavidBridgeError('UNVERIFIED_OPERATOR_IDENTITY', 403);
  }
  // Not an authenticated session by itself; host must persist this record in
  // its own HttpOnly server session and revalidate active status via /me.
  return Object.freeze({
    worker_id: result.worker_id,
    organization_id: result.organization_id,
    role: result.role,
    external_user_id: result.external_user_id
  });
}

export async function verifyDppStaffSession({
  authenticatedDavidUserId, bridgeSecret,
  callDeskOrigin = 'https://david-real-workspace.vercel.app',
  fetchFn = fetch
}) {
  if (!EXTERNAL_ID.test(authenticatedDavidUserId || '') ||
      !bridgeSecret || bridgeSecret.length < 32 ||
      callDeskOrigin !== 'https://david-real-workspace.vercel.app') {
    throw new DavidBridgeError('SESSION_NOT_AUTHORIZED', 401);
  }
  let res;
  try {
    res = await fetchFn(callDeskOrigin + '/api/integrations/david/me', {
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + bridgeSecret,
        'x-david-external-user-id': authenticatedDavidUserId
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
      redirect: 'error'
    });
  } catch {
    throw new DavidBridgeError('CALLDESK_UNAVAILABLE', 503);
  }
  if (!res.ok) throw new DavidBridgeError(
    res.status === 403 ? 'WORKER_REVOKED' : 'CALLDESK_UNAVAILABLE',
    res.status === 403 ? 403 : 503
  );
  const result = await res.json().catch(() => null);
  if (!result || result.active !== true ||
      !result.worker_id || !result.organization_id) {
    throw new DavidBridgeError('WORKER_REVOKED', 403);
  }
  return result;
}
