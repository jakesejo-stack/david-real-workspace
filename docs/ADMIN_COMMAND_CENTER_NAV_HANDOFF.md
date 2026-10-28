# DAVID Admin Command Center: original sidebar integration handoff

The owner-approved Google-only analytics dashboard is live at:
https://soulflame-dpp-operator-portal.vercel.app/admin-dashboard.html

The existing DAVID Real Workspace sidebar already renders the **Admin Panel** option
exclusively for the two allowed Admin Google addresses. The dashboard independently
requires server-side approval through `david_admin_dashboard_snapshot()`, so
Worker accounts cannot access dashboard data.

**Remaining original-app integration** (not deployed): when the full editable Vite
source has been recovered, change the existing Admin Panel navigation callback
to open the dashboard URL above. Keep every other sidebar action and Voice API
unchanged. A second Google login in the separate origin may be required.

The admin dashboard includes overview, analytics, call log, operators,
companies, manual CRM outcomes, support tickets, tasks, audit events,
and automatic refresh every 60 seconds while visible.

A safe deployment experiment for overlaying a patched `index.html` onto the
original production build was attempted **only as a preview**:
`dpl_22Zn56i4ehKg5iXkPLgTYFpRj6eU`. It **failed to build**
(`vite build` exited 127) because the full original source is unavailable.
It was not promoted to production. Do not claim the native sidebar redirect
has been published.

Native integration acceptance: Admin button from the original workspace
navigates to the dashboard, both approved Google Admin accounts can see
real numbers, Worker Google accounts receive a server-side 42501/deny,
and existing CRM/Voice routes remain unchanged.
