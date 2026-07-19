// PackageChips — package + RA-status chips for an Admin Orders row.
// ORDERS-RA-COMBO-CHIP-FILTER-001.
//
// Renders the product/package chip (ESA · PSD · ESA + RA · PSD + RA · RA Add-on
// · Unknown) and, for RA-related orders, a concise secondary RA-document state
// chip (Doc Missing · Doc Uploaded · Under Review · RA Completed) that reminds
// staff to check the Documents area. Classification is explicit-fields-only —
// never price (see ../orderPackage.ts).
import {
  classifyOrderPackage,
  packageChipMeta,
  raDocState,
  raDocChipMeta,
} from "../orderPackage";
import type { Order } from "../types";

interface Props {
  order: Order;
  /** True when a PAID standalone Additional-Documentation add-on request exists
   *  for this order (from order_additional_documentation_requests). */
  hasPaidAddon: boolean;
  /** "sm" = mobile card, "xs" = dense desktop row. */
  size?: "sm" | "xs";
}

export default function PackageChips({ order, hasPaidAddon, size = "sm" }: Props) {
  const cat = classifyOrderPackage(order, { hasPaidStandaloneAddon: hasPaidAddon });
  const pkg = packageChipMeta(cat);
  const doc = raDocChipMeta(raDocState(order, cat));

  const pad = size === "xs" ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]";
  const iconSz = size === "xs" ? "8px" : "9px";

  return (
    <>
      <span
        title={pkg.title}
        className={`inline-flex items-center gap-0.5 rounded font-extrabold ${pad} ${pkg.className}`}
      >
        {pkg.icon && <i className={pkg.icon} style={{ fontSize: iconSz }}></i>}
        {pkg.label}
      </span>
      {doc && (
        <span
          title="Reasonable Accommodation document status — open the order to review the Documents tab"
          className={`inline-flex items-center gap-0.5 rounded font-extrabold ${pad} ${doc.className}`}
        >
          <i className={doc.icon} style={{ fontSize: iconSz }}></i>
          {doc.label}
        </span>
      )}
    </>
  );
}
