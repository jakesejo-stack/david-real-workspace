# DPP Center Admin V2 — Borko Original Call Desk integration handoff (29 Oct 2026)

## Current scope and no production claims
This repo is the **original BORISLAV-owned** `jakesejo-stack/david-real-workspace` (GitHub Write for SoulFlameAdmin). It is **not yet a complete source copy of the existing Vercel production** `https://david-real-workspace.vercel.app/`. Do NOT merge or connect this incomplete repo directly to production until the original editable Vite app, API routes, package lockfile, assets, and voice handlers are recovered and regression-tested. Do not turn on paid Twilio.

## Shared canonical tasks source of truth
Use Supabase project `lyyqfpbrgjsxdqukwurl`. Existing verified Google members and active link-code session are mandatory. Existing RPCs:
- `david_admin_task_board()`: owner task list;
- `david_my_task_board()`: worker-scoped tasks;
- `david_admin_create_assignment(p_worker_email,p_title,p_description,p_priority,p_due_at,p_source)`: only authorized owner; set `p_source='human'` for admin panel, never trust a posted source claim;
- `david_update_assignment_status(p_task_id,p_status)`: owner or assigned worker;
- `david_task_notes(p_task_id,p_message)`: verify portal session plus assigned worker/owner for notes.

**Never put service-role, Google tokens or one-time codes into frontend/ GitHub.** Expose these through same-origin, authenticated backend routes with RLS/Google+code checks; role must come from verified server state. Two GPT accounts may create tasks only using *their own separately authorized Supabase/OAuth connector* or another approved actor-scoped server integration. Do not share tokens or assume connecting one GPT grants the other permission.

## UI to mount in recovered original Vite source
Use `src/dppcenter-v2-taskboard.js` and `src/dppcenter-v2-taskboard.css`, mounted in existing authenticated worker workspace. DO NOT hardcode a mock worker role or replace existing Voice/CRM components. Put **„ЗАДАЧИ“ above „Моите фирми“**, preserve the white left menu, black central content. Host must inject a same-origin API adapter implementing:
```js
mountDppTaskCenter(document.querySelector('#operator-task-root'), {
  role: verifiedServerRole,
  workers: approvedWorkersFromServer,
  api: {
    listTasks: () => sameOriginGET('/api/dpp/tasks'), // returns {tasks:[{id,title,description,priority,status,notes:[]}...]}
    createTask: (payload) => sameOriginPOST('/api/dpp/tasks/create',payload),
    updateStatus: (id,status) => sameOriginPOST('/api/dpp/tasks/status',{task_id:id,status}),
    addNote: (id,message) => sameOriginPOST('/api/dpp/tasks/note',{task_id:id,message})
  }
});
```
**These four same-origin APIs are the integration contract and are NOT implemented in the incomplete original Vite source yet.** Never call the service key from the browser. Existing DAVID OS V2 endpoints are on another domain and cannot inherit Call Desk cookies. Only a recovered full-source integration can complete this.

## PWA shortcut
Name: `DppCenterAdmin`; source vector: `assets/dppcenteradmin-icon.svg`. Once original Vite source is restored, add a valid manifest, 192/512px raster PNG icons, route-scoped authenticated Admin start URL, Apple touch icon, and 'Add to Home Screen' install button. Keep the installed app behind Google+operator code. Native Chrome prompt is not guaranteed on all browsers; support manual add-to-home-screen.

## 20-min release checker
Workflow `.github/workflows/dpp-center-safe-deploy.yml` polls at 00/20/40 each hour. It DOES NOT deploy while any of these are missing:
1. `package.json`, `package-lock.json`, `index.html`, `vercel.json` from recovered original;
2. Borko's explicit release sign-off file `release/P0_SOURCE_RESTORED_APPROVED`;
3. successful `npm ci`, optional tests and `npm run build`;
4. `DPP_VERIFIED_VERCEL_DEPLOY_HOOK_URL` GitHub Actions secret, created by Borko in his Vercel account.
It skips old unchanged commits to avoid wasting builds. This is *not* a blind auto-deploy; Borko must approve original-source restoration and configure the secret. Prefer Vercel Git integration on reviewed main pushes for immediate deployment, with 20-min fallback.

## Tests / acceptance
- Account A and B are both verified owners and can create separate worker tasks; only assigned worker sees their own.
- Invalid Google / absent code receives 401/403.
- Notes persist and status updates appear on second device within 10 seconds.
- Admin mobile shortcut opens restricted Admin (white sidebar, dark canvas), not public dashboard.
- Original dial button, inbound/outbound webhooks, manual CRM outcomes and consent protections remain unchanged.
- Do not mark Twilio listening or call completed without real CallSid and approved test phone.
