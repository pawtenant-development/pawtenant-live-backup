/**
 * Wrap a Supabase recovery action URL in a PawTenant-owned, scanner-safe
 * interstitial. Email security scanners may follow links automatically; they
 * must land on PawTenant without consuming Supabase's single-use token.
 *
 * The action URL is carried in the fragment so it is never sent to PawTenant,
 * Vercel, or access logs. index.html scrubs it into window memory before any
 * analytics bootstrap can observe it. The reset page only follows it after an
 * explicit customer click.
 */
export function buildScannerSafeRecoveryUrl(
  actionLink: string,
  resetRedirect: string,
): string {
  const action = new URL(actionLink);
  if (action.protocol !== "https:" || action.pathname !== "/auth/v1/verify") {
    throw new Error("Unexpected recovery action URL");
  }
  if (action.searchParams.get("type") !== "recovery") {
    throw new Error("Unexpected recovery action type");
  }

  const landing = new URL(resetRedirect);
  if (landing.protocol !== "https:" || landing.pathname !== "/reset-password") {
    throw new Error("Unexpected recovery landing URL");
  }

  const bytes = new TextEncoder().encode(action.toString());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  landing.hash = `recovery_link=${encoded}`;
  return landing.toString();
}
