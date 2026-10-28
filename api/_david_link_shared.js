import { createClient } from '@supabase/supabase-js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// Server-only helpers. None of these keys may be prefixed VITE_ or sent to the browser.
const needed = name => {
  const value = process.env[name];
  if (!value) throw Error('Missing server configuration: ' + name);
  return value;
};
const settings = { auth: { persistSession: false, autoRefreshToken: false } };
export function noCache(res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
}
export function response(res,status,body) { noCache(res); return res.status(status).json(body); }
export function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body==='object' && !Array.isArray(req.body)) return req.body;
  if (typeof req.body==='string' && req.body.length<=4096) {
    try { const b=JSON.parse(req.body); return b && typeof b==='object' && !Array.isArray(b) ? b : {}; } catch {}
  }
  return {};
}
export function bearer(req) {
  const s=req.headers.authorization||'';
  return /^Bearer [^ ]+$/i.test(s)?s.slice(7):'';
}
export function operatorClient(jwt) {
  return createClient(needed('SUPABASE_URL'),needed('SUPABASE_ANON_KEY'),{
    ...settings,global:{headers:{Authorization:'Bearer '+jwt}}
  });
}
export async function approvedGoogleUser(req) {
  const jwt=bearer(req);
  if (!jwt) return null;
  const db=operatorClient(jwt);
  const {data,error}=await db.auth.getUser(jwt);
  if (error || !data?.user?.id) return null;
  const providers=data.user.app_metadata?.providers||[];
  if (!providers.includes('google')) return null;
  return {db,user:data.user};
}
export function serviceClient() {
  return createClient(needed('SUPABASE_URL'),needed('SUPABASE_SERVICE_ROLE_KEY'),settings);
}
export function authorizedBridge(req) {
  const expected=needed('DAVID_BRIDGE_SHARED_SECRET');
  if (expected.length<32) throw Error('DAVID_BRIDGE_SHARED_SECRET is too short');
  const supplied=bearer(req);
  const a=Buffer.from(expected,'utf8'),b=Buffer.from(supplied,'utf8');
  return a.length===b.length && timingSafeEqual(a,b);
}
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newLinkCode() {
  let code='';
  for(let i=0;i<12;i++) code+=alphabet[randomInt(alphabet.length)];
  return '#'+code+'!';
}
export function validCode(code) {
  // Example format #1948a! is illustrative, never a shared production credential.
  // Use twelve cryptographically random alphabet chars between the delimiters.
  return typeof code==='string' && /^#[A-HJ-NP-Z2-9]{12}!$/.test(code.trim().toUpperCase());
}
export function codeDigest(code) {
  // Only high-entropy, 12-char cryptographically generated codes are accepted.
  // SQL david_generate_link_code stores exactly SHA-256(code), with no logging.
  if (!validCode(code)) throw Error('Invalid DAVID code format');
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
export function validExternalId(id) {
  return typeof id==='string' && /^[a-zA-Z0-9:._-]{1,256}$/.test(id);
}
