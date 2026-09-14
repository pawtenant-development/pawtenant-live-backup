// Partner Portal — invite-only workspace for a partner organization.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002, simplified by
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 into the first-release
// shape: Orders · Accounts · New Order, plus the profile essentials (who is
// signed in, which organization, sign out).
//
// ACCESS MODEL
//   Individual authenticated users, never a shared partner password. An admin
//   invites an address; the invitation binds to the authenticated user the
//   first time that person opens this page, and `public.partner_users` is the
//   only thing that says which organization they belong to.
//
//   The isolation is enforced in the DATABASE, not here. Every read on this
//   page is a SECURITY DEFINER projection filtered by `current_partner_id()`;
//   the underlying partner tables stay admin-only under RLS, so a partner
//   session that queried them directly would see zero rows. Nothing on this
//   page sends a partner id, so there is nothing to forge.
//
// WHAT A PARTNER NEVER SEES HERE
//   Another partner's orders, PawTenant direct orders, provider identity,
//   provider earnings, PawTenant margin, internal audit notes, admin
//   communications, other customers, service-role tables, credentials.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import PartnerOrderWizard from "../../components/partner/PartnerOrderWizard";
import PartnerPortalOrders, { type PortalDraft } from "./components/PartnerPortalOrders";
import PartnerPortalAccounts from "./components/PartnerPortalAccounts";
import { partnerRoleLabel } from "../../lib/partnerRoles";

export interface PartnerPortalContext {
  partner_id: string;
  display_name: string;
  legal_name: string | null;
  status: string;
  intake_mode: string;
  allowed_services: string[] | null;
  allowed_states: string[] | null;
  role: string | null;
  rates: { service: string; amount_cents: number; currency: string; version: number }[];
}

type Phase = "loading" | "signed_out" | "no_access" | "ready";
type Tab = "orders" | "accounts" | "new";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "orders", label: "Orders", icon: "ri-file-list-3-line" },
  { key: "accounts", label: "Accounts", icon: "ri-bank-card-line" },
  { key: "new", label: "New Order", icon: "ri-add-line" },
];

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f8f7f4]">{children}</div>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) {
      // Deliberately generic: never reveal whether an address exists.
      setError("That email and password combination was not recognized.");
      return;
    }
    onSignedIn();
  };

  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-900 text-center">Partner Portal</h1>
          <p className="text-sm text-gray-500 text-center mt-1.5 mb-6">
            Sign in with the account PawTenant invited.
          </p>
          <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input type="email" required autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
              <input type="password" required autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900" />
            </div>
            <button type="submit" disabled={busy}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 cursor-pointer">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-xs text-gray-400 text-center">
              First time here? Use the link in your invitation email to set a password.
            </p>
          </form>
        </div>
      </div>
    </Shell>
  );
}

export default function PartnerPortalPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ctx, setCtx] = useState<PartnerPortalContext | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [resumeDraft, setResumeDraft] = useState<PortalDraft | null>(null);
  const [ordersReload, setOrdersReload] = useState(0);
  const [accessError, setAccessError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setPhase("signed_out");
      return;
    }
    setUserEmail(sess.session.user.email ?? null);
    // Binds an outstanding invitation to this authenticated user on first
    // visit, and records the access on every visit. A revoked user is refused
    // here, by the database, not by hiding a button.
    const { error: acceptErr } = await supabase.rpc("partner_portal_accept_invitation");
    if (acceptErr) {
      setAccessError(acceptErr.message);
      setPhase("no_access");
      return;
    }
    const { data, error } = await supabase.rpc("partner_portal_context");
    if (error || !data) {
      setAccessError(error?.message ?? "Partner context unavailable.");
      setPhase("no_access");
      return;
    }
    setCtx(data as PartnerPortalContext);
    setPhase("ready");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setCtx(null);
    setPhase("signed_out");
  };

  const startNewOrder = (draft: PortalDraft | null = null) => {
    setResumeDraft(draft);
    setTab("new");
  };

  const leaveWizard = () => {
    setResumeDraft(null);
    setOrdersReload((n) => n + 1);
    setTab("orders");
  };

  if (phase === "loading") {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-3xl text-gray-400"></i>
        </div>
      </Shell>
    );
  }

  if (phase === "signed_out") return <SignIn onSignedIn={() => void load()} />;

  if (phase === "no_access") {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
              <i className="ri-lock-line text-xl text-amber-600"></i>
            </div>
            <h1 className="text-lg font-bold text-gray-900">No partner access</h1>
            <p className="text-sm text-gray-500 mt-2">
              This account is not an active partner portal user. If your access was recently granted or
              changed, ask your PawTenant contact to check the invitation.
            </p>
            {accessError && <p className="text-xs text-gray-400 mt-3 break-words">{accessError}</p>}
            <button type="button" onClick={signOut}
              className="mt-6 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Partner Portal</p>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">{ctx?.display_name}</h1>
          </div>
          {/* Profile essentials: who is signed in, as what, and sign out. */}
          <div className="flex items-center gap-3 min-w-0" data-partner-profile>
            <div className="min-w-0 text-right hidden sm:block">
              <p className="text-xs font-semibold text-gray-800 truncate">{userEmail ?? "—"}</p>
              <p className="text-[11px] text-gray-500">{partnerRoleLabel(ctx?.role)}</p>
            </div>
            <button type="button" onClick={signOut}
              className="px-3.5 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
              Sign out
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Partner portal">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => (t.key === "new" ? startNewOrder(null) : setTab(t.key))}
                aria-current={tab === t.key ? "page" : undefined}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                  tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                <i className={t.icon}></i>{t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === "orders" && ctx && (
          <PartnerPortalOrders ctx={ctx} reloadToken={ordersReload} onNewOrder={startNewOrder} />
        )}
        {tab === "accounts" && <PartnerPortalAccounts />}
        {tab === "new" && ctx && (
          <PartnerOrderWizard
            mode="partner"
            lockedPartner={{ id: ctx.partner_id, display_name: ctx.display_name, allowed_services: ctx.allowed_services }}
            rates={ctx.rates}
            allowDraft
            initialDraft={resumeDraft}
            onSubmitted={() => { /* the success screen owns the next step */ }}
            onCancel={leaveWizard}
            onDraftSaved={() => setOrdersReload((n) => n + 1)}
          />
        )}
      </main>
    </Shell>
  );
}
