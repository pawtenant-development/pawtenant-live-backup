/**
 * VisitorSoundMonitor — thin bootstrap for the admin-wide visitor
 * alert singleton.
 *
 * The data lifecycle (subscription, dedupe state, baseline window,
 * sound + badge + desktop notify fanout) lives in
 * src/lib/visitorMonitor.ts. This component only decides "are we on
 * an admin route — yes or no" and calls startVisitorMonitor() /
 * stopVisitorMonitor() accordingly.
 *
 * Why a JS singleton instead of React refs:
 *   The previous design kept dedupe state in component refs. If the
 *   component ever remounted (StrictMode double-invoke, parent
 *   re-mount during the GeoGate spinner, route-shaped key changes),
 *   baseline state was lost and subscription lifecycle hiccupped.
 *   Symptom: the chime appeared to only start after the admin opened
 *   the Communications → Live Visitors panel, because that's the
 *   second subscriber to liveVisitorsPoll and its mount forced a
 *   snapshot delivery. Moving state to module scope makes the monitor
 *   completely independent of React's render lifecycle.
 *
 * Mount sites: AdminApp (admin subdomain) + AdminChatGate (public-site
 * /admin* routes). Both pass through here. The component returns null.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  startVisitorMonitor,
  stopVisitorMonitor,
} from "../../lib/visitorMonitor";

function shouldRun(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (pathname.startsWith("/admin")) return true;
  // Admin subdomain — AdminApp mounts at "/" too.
  const host = window.location.hostname.toLowerCase();
  return host.startsWith("admin.") || host === "admin.pawtenant.com";
}

export default function VisitorSoundMonitor() {
  const { pathname } = useLocation();
  const active = shouldRun(pathname);

  useEffect(() => {
    if (!active) {
      stopVisitorMonitor();
      return;
    }
    startVisitorMonitor();
    // No cleanup on unmount — the singleton lives across React
    // remounts. We only stop when `active` flips to false (admin left
    // the admin route surface), which the effect above handles on the
    // next run. This is intentional: it prevents the brief moment
    // between an unmount and the next mount from dropping the
    // subscription and losing in-flight visitor events.
  }, [active]);

  return null;
}
