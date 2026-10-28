-- PILOT SECURITY GATE: workers must see assigned firms only.
-- Apply only when retiring the legacy shared/unassigned worker pickup pool.
-- Does not modify production until this branch is reviewed and deployed.
-- Admin visibility remains unchanged, inactive/guest users remain denied.
alter policy david_company_read on public.david_companies
using (
  david_internal.david_is_active_member()
  and (
    david_internal.david_is_admin()
    or (
      assigned_to=(select auth.uid())
      and exists (
        select 1 from public.david_members m
        where m.user_id=(select auth.uid()) and m.role='worker'
      )
    )
  )
);
