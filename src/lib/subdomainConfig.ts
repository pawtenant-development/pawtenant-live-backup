/**
 * Admin Subdomain Routing — Feature Flag
 *
 * Flip ADMIN_SUBDOMAIN_ENABLED to `true` once both of these are done:
 *   1. DNS CNAME: admin.pawtenant.com → your Vercel deployment
 *   2. Domain added in Vercel project settings (Settings → Domains)
 *
 * While false, all routes stay on pawtenant.com — zero behaviour change.
 */
export const ADMIN_SUBDOMAIN_ENABLED = false;

export const ADMIN_HOSTNAME = "admin.pawtenant.com";
export const PUBLIC_HOSTNAME = "pawtenant.com";

/**
 * Returns true only when the feature flag is on AND the current hostname
 * matches admin.pawtenant.com.
 */
export function isAdminSubdomain(): boolean {
  if (!ADMIN_SUBDOMAIN_ENABLED) return false;
  return typeof window !== "undefined" &&
    window.location.hostname === ADMIN_HOSTNAME;
}
