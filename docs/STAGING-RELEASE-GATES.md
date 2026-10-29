# Staging only
This restores the Vite build using recovered compiled frontend and public operator modules.
It does **not** restore missing original API handlers nor validate auth/RLS or Twilio.
No production deploy. No Supabase schema writes. No LIVE_CALLS_ENABLED modification.
Required: full API inventory, OAuth two-role browser tests, negative authorization, zero-cost SQL QA passing, and verified webhooks before promotion.
