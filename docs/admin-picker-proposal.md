# Admin worker Gmail selector

Source module: src/admin-worker-picker.mjs. Tests: tests/admin-worker-picker.test.mjs.

The module loads active workers via the existing admin-only daily_workers RPC. It displays Name plus email and assigns by account ID. It also uses the existing secure task and company assignment RPCs.

Integration requirement: mount into Admin / Tasks / Choose and Admin / Companies / Choose in the ORIGINAL Vite frontend. The repository only has a recovered compiled frontend and does not currently support safe direct deployment. Verify authenticated preview before production. Run node --test tests/admin-worker-picker.test.mjs.
