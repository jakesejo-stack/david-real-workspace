import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDavidLogin } from '../src/david-verified-login.mjs';

const workerId = '710d1add-2765-4fee-9429-491aef5f32c0';
const userId = '5ab1bbb2-de11-46ca-ac37-b8751e7f9403';

function fakeClient({
  role = 'worker',
  active = true,
  email = 'jakesejo@gmail.com',
  verified = true,
  userPresent = true,
  memberError = null,
  identityError = null,
  authError = null,
  snapshot = { active: true, role: 'worker', worker_id: workerId, expires_at: '2026-10-28T23:00:00Z' },
  snapshotError = null,
} = {}) {
  const user = userPresent ? {
    id: userId,
    email,
    email_confirmed_at: verified ? '2026-10-28T00:00:00Z' : null,
  } : null;
  const calls = [];
  const db = {
    calls,
    auth: {
      async getUser() { calls.push('getUser'); return { data: { user }, error: authError }; },
    },
    from(table) {
      calls.push(table);
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          if (table === 'david_members') {
            return { data: role ? { role, display_name: 'Pilot' } : null, error: memberError };
          }
          return {
            data: active === null ? null : { worker_id: workerId, active },
            error: identityError,
          };
        },
      };
    },
    async rpc(name) {
      calls.push(name);
      return { data: snapshot, error: snapshotError };
    },
  };
  return db;
}

test('signed-out users never query role, identity, or code', async () => {
  const db = fakeClient({ userPresent: false });
  assert.deepEqual(await verifyDavidLogin(db), { state: 'signed_out' });
  assert.deepEqual(db.calls, ['getUser']);
});

test('auth.getUser failure is fail-closed', async () => {
  const db = fakeClient({ authError: { message: 'network' } });
  assert.equal((await verifyDavidLogin(db)).state, 'error');
  assert.deepEqual(db.calls, ['getUser']);
});

test('unverified email denied before DB queries', async () => {
  const db = fakeClient({ verified: false });
  assert.equal((await verifyDavidLogin(db)).state, 'not_approved');
  assert.deepEqual(db.calls, ['getUser']);
});

test('missing membership denied', async () => {
  assert.equal((await verifyDavidLogin(fakeClient({ role: null }))).state, 'not_approved');
});

test('revoked worker denied even with an earlier active code snapshot', async () => {
  const db = fakeClient({ active: false });
  assert.equal((await verifyDavidLogin(db)).state, 'not_approved');
  assert.ok(!db.calls.includes('david_operator_portal_snapshot'));
});

test('admin role with unallowlisted Google email denied', async () => {
  const db = fakeClient({ role: 'admin', email: 'random@example.com' });
  assert.equal((await verifyDavidLogin(db)).state, 'not_approved');
});

test('admin allowlist cannot bypass server-side code session', async () => {
  const db = fakeClient({ role: 'admin', email: 'soulflame.mitko@gmail.com', snapshot: { active: false, reason: 'code_required' } });
  assert.equal((await verifyDavidLogin(db)).state, 'code_required');
});

test('worker with active member but no code must still enter a code', async () => {
  const db = fakeClient({ snapshot: { active: false, reason: 'code_required' } });
  assert.equal((await verifyDavidLogin(db)).state, 'code_required');
  assert.ok(db.calls.includes('david_operator_portal_snapshot'));
});

test('active worker with a matching server code session is ready', async () => {
  const result = await verifyDavidLogin(fakeClient());
  assert.equal(result.state, 'ready');
  assert.equal(result.user.email, 'jakesejo@gmail.com');
  assert.equal(result.workerId, workerId);
  assert.equal(result.role, 'worker');
});

test('server snapshot for a different worker is rejected', async () => {
  const db = fakeClient({ snapshot: { active: true, role: 'worker', worker_id: 'another-worker' } });
  assert.equal((await verifyDavidLogin(db)).state, 'not_approved');
});

test('server snapshot with different role is rejected', async () => {
  const db = fakeClient({ snapshot: { active: true, role: 'admin', worker_id: workerId } });
  assert.equal((await verifyDavidLogin(db)).state, 'not_approved');
});

test('snapshot network errors fail closed', async () => {
  const db = fakeClient({ snapshotError: { message: 'timeout' } });
  assert.equal((await verifyDavidLogin(db)).state, 'error');
});

test('database RLS read errors fail closed', async () => {
  const db = fakeClient({ memberError: { message: 'RLS denied' } });
  assert.equal((await verifyDavidLogin(db)).state, 'error');
});

test('legacy mode must be explicitly requested, never the default', async () => {
  const db = fakeClient({ snapshot: { active: false, reason: 'code_required' } });
  const result = await verifyDavidLogin(db, { requireCodeSession: false });
  assert.equal(result.state, 'ready');
  assert.ok(!db.calls.includes('david_operator_portal_snapshot'));
});
