-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 7)
--
-- Caught by re-running the security advisor after the work was done:
-- `tg_partner_invoice_line_single_active` is SECURITY DEFINER, and PostgreSQL
-- grants EXECUTE on a new function to PUBLIC by default, so it appeared as
-- anon-executable over /rest/v1/rpc.
--
-- Calling it outside a trigger would fail on the unset trigger context, so it
-- was not exploitable — but "not exploitable today" is not the standard. A
-- trigger fires as the table owner regardless of grants, so revoking EXECUTE
-- costs nothing and removes the surface.
revoke all on function public.tg_partner_invoice_line_single_active() from public, anon, authenticated;
revoke all on function public.tg_partner_recon_append_only() from public, anon, authenticated;
