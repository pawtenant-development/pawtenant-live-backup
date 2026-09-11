-- ESA-PSD-PLANNERS-MARKETING-LIVE-001 — the PSD slot now carries its own
-- asset (the Psychiatric Service Dog Training Workbook), so it gets its real
-- customer-facing name and becomes ADVERTISED: an eligible paid PSD customer
-- with no published version sees an honest "temporarily unavailable" state
-- instead of nothing, because the public site now promises the workbook.
--
-- Idempotent; touches one row; no schema change; no order row.
update public.customer_resource_slots
   set display_name      = 'Psychiatric Service Dog Training Workbook by PawTenant',
       customer_subtitle = 'Included with your PSD package',
       advertised        = true,
       updated_at        = now()
 where resource_key = 'psd_planner'
   and (display_name <> 'Psychiatric Service Dog Training Workbook by PawTenant'
        or customer_subtitle <> 'Included with your PSD package'
        or advertised = false);

do $$
begin
  if not exists (select 1 from public.customer_resource_slots
                  where resource_key = 'psd_planner' and advertised
                    and display_name = 'Psychiatric Service Dog Training Workbook by PawTenant') then
    raise exception 'psd_planner slot was not updated';
  end if;
end $$;
