/**
 * Dedicated portal hostnames.
 *
 * Routing is activated only by an exact hostname match. Until a hostname is
 * attached to the Vercel project and DNS points at it, these checks are inert
 * and the existing pawtenant.com routes keep working.
 */
export const ADMIN_HOSTNAME = "admin.pawtenant.com";
export const CUSTOMER_HOSTNAME = "customer.pawtenant.com";
export const PARTNER_HOSTNAME = "partner.pawtenant.com";
export const PUBLIC_HOSTNAME = "pawtenant.com";

export type PortalHostname = "admin" | "customer" | "partner";

export function getPortalHostname(): PortalHostname | null {
  if (typeof window === "undefined") return null;
  switch (window.location.hostname.toLowerCase()) {
    case ADMIN_HOSTNAME:
      return "admin";
    case CUSTOMER_HOSTNAME:
      return "customer";
    case PARTNER_HOSTNAME:
      return "partner";
    default:
      return null;
  }
}

export function isAdminSubdomain(): boolean {
  return getPortalHostname() === "admin";
}

