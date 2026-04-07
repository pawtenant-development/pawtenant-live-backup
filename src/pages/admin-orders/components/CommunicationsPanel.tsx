// CommunicationsPanel — Top-level feed of all SMS, calls & emails across every order
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface CommEntry {
  id: string;
  order_id: string | null;
  confirmation_id: string | null;
  type: string;
  direction: string;
  body: string | null;
  phone_from: string | null;
  phone_to: string | null;
  duration_seconds: number | null;
  status: string | null;
  twilio_sid: string | null;
  sent_by: string | null;
  recording_url: string | null;
  created_at: string;
}

interface EmailFlatEntry {
  id: string;
  order_id: string;
  confirmation_id: string;
  type: string;
  to: string;
  success: boolean;
  created_at: string;
  customer_name: string;
  customer_email: string;
}

interface Order {
  id: string;
  confirmation_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  state: string | null;
  status: string;
  payment_intent_id: string | null;
  doctor_email: string | null;
  doctor_user_id: string | null;
}

interface CommunicationsPanelProps {
  orders: Order[];
  onViewOrder: (order: Order) => void;
}

const EMAIL_TYPE_LABEL: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  order_confirmation:          { label: "Order Confirmation",        icon: "ri-mail-check-line",      color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7] border-[#b8ddd5]"   },
  payment_receipt:             { label: "Payment Receipt",           icon: "ri-receipt-line",          color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7] border-[#b8ddd5]"   },
  letter_ready:                { label: "Documents Ready",           icon: "ri-file-check-line",       color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"    },
  status_under_review:         { label: "Under Review Update",       icon: "ri-search-eye-line",       color: "text-sky-700",     bg: "bg-sky-50 border-sky-200"        },
  status_completed:            { label: "Status: Completed",         icon: "ri-checkbox-circle-line",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  provider_assigned_customer:  { label: "Provider Assigned (Patient)", icon: "ri-user-follow-line",   color: "text-violet-700",  bg: "bg-violet-50 border-violet-200"  },
  provider_assigned_provider:  { label: "Provider Assigned (Doctor)", icon: "ri-stethoscope-line",    color: "text-violet-700",  bg: "bg-violet-50 border-violet-200"  },
};

const TYPE_CONFIG: Record<string, {
  icon: string; label: string;
  bg: string; dot: string; textColor: string;
}> = {
  sms_outbound:      { icon: "ri-message-3-line",    label: "SMS Out",       bg: "bg-[#f0faf7] border-[#b8ddd5]",   dot: "bg-[#1a5c4f]",   textColor: "text-[#1a5c4f]"  },
  sms_inbound:       { icon: "ri-message-3-fill",    label: "SMS In",        bg: "bg-white border-gray-200",         dot: "bg-gray-400",    textColor: "text-gray-700"    },
  call_outbound:     { icon: "ri-phone-line",         label: "Call Out",      bg: "bg-sky-50 border-sky-200",         dot: "bg-sky-500",     textColor: "text-sky-700"     },
  call_inbound:      { icon: "ri-phone-fill",         label: "Call In",       bg: "bg-violet-50 border-violet-200",   dot: "bg-violet-500",  textColor: "text-violet-700"  },
  email_sequence:    { icon: "ri-mail-send-line",     label: "Auto-Sequence", bg: "bg-violet-50 border-violet-200",   dot: "bg-violet-500",  textColor: "text-violet-700"  },
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

const PAGE_SIZE = 30;

export default function CommunicationsPanel({ orders, onViewOrder }: CommunicationsPanelProps) {
  const [comms, setComms]               = useState<CommEntry[]>([]);
  const [emailEntries, setEmailEntries] = useState<EmailFlatEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [hasMore, setHasMore]           = useState(true);
  const [mainTab, setMainTab]           = useState<"sms_calls" | "emails">("sms_calls");
  const [typeFilter, setTypeFilter]     = useState<"all" | "sms" | "calls" | "sequence">("all");
  const [dirFilter, setDirFilter]       = useState<"all" | "outbound" | "inbound">("all");
  const [emailTypeFilter, setEmailTypeFilter] = useState<string>("all");
  const [search, setSearch]             = useState("");
  const [offset, setOffset]             = useState(0);

  // Build order lookup map
  const orderMap = new Map<string, Order>();
  orders.forEach((o) => orderMap.set(o.id, o));

  // ── Fetch emails from all orders' email_log ────────────────────────────────
  const loadEmails = useCallback(async () => {
    setLoadingEmails(true);
    const { data } = await supabase
      .from("orders")
      .select("id, confirmation_id, first_name, last_name, email, email_log")
      .not("email_log", "is", null)
      .order("created_at", { ascending: false })
      .limit(300);

    const flat: EmailFlatEntry[] = [];
    for (const row of data ?? []) {
      const log = (row.email_log ?? []) as Array<{ type: string; sentAt: string; to: string; success: boolean }>;
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email;
      for (const entry of log) {
        flat.push({
          id: `${row.id}-${entry.type}-${entry.sentAt}`,
          order_id: row.id,
          confirmation_id: row.confirmation_id,
          type: entry.type,
          to: entry.to,
          success: entry.success,
          created_at: entry.sentAt,
          customer_name: name,
          customer_email: row.email,
        });
      }
    }
    flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEmailEntries(flat);
    setLoadingEmails(false);
  }, []);

  const buildQuery = useCallback((from: number) => {
    let q = supabase
      .from("communications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (typeFilter === "sms")      q = q.in("type", ["sms_outbound", "sms_inbound"]);
    else if (typeFilter === "calls")    q = q.in("type", ["call_outbound", "call_inbound"]);
    else if (typeFilter === "sequence") q = q.eq("type", "email").ilike("sent_by", "Auto-Sequence%");
    // default "all": fetch SMS + calls + auto-sequence emails (exclude plain non-sequence emails)
    else q = q.or("type.in.(sms_outbound,sms_inbound,call_outbound,call_inbound),and(type.eq.email,sent_by.ilike.Auto-Sequence%)");

    if (dirFilter !== "all")    q = q.eq("direction", dirFilter);

    return q;
  }, [typeFilter, dirFilter]);

  const loadComms = useCallback(async () => {
    setLoading(true);
    setOffset(0);
    const { data, count } = await buildQuery(0);
    const entries = (data as CommEntry[]) ?? [];
    setComms(entries);
    setHasMore(entries.length < (count ?? 0));
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => { loadComms(); loadEmails(); }, [loadComms, loadEmails]);

  const loadMore = async () => {
    setLoadingMore(true);
    const newOffset = offset + PAGE_SIZE;
    const { data } = await buildQuery(newOffset);
    const entries = (data as CommEntry[]) ?? [];
    setComms((prev) => [...prev, ...entries]);
    setHasMore(entries.length === PAGE_SIZE);
    setOffset(newOffset);
    setLoadingMore(false);
  };

  // Real-time new entries
  useEffect(() => {
    const channel = supabase
      .channel("comms-panel-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communications" }, (payload) => {
        const entry = payload.new as CommEntry;
        // Include SMS, calls, and auto-sequence emails; exclude plain non-sequence emails
        const isSeqEmail = entry.type === "email" && (entry.sent_by ?? "").startsWith("Auto-Sequence");
        if (entry.type === "email" && !isSeqEmail) return;
        setComms((prev) => [entry, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Normalise: auto-sequence emails get a special display type
  const normalisedComms = comms.map((c) => {
    if (c.type === "email" && (c.sent_by ?? "").startsWith("Auto-Sequence")) {
      return { ...c, type: "email_sequence" };
    }
    return c;
  });

  const seqCount = normalisedComms.filter((c) => c.type === "email_sequence").length;

  // Client-side search filter for SMS/calls
  const filteredComms = normalisedComms.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const order = c.order_id ? orderMap.get(c.order_id) : null;
    return (
      (c.body ?? "").toLowerCase().includes(q) ||
      (c.phone_from ?? "").includes(q) ||
      (c.phone_to ?? "").includes(q) ||
      (c.confirmation_id ?? "").toLowerCase().includes(q) ||
      (c.sent_by ?? "").toLowerCase().includes(q) ||
      (order?.email ?? "").toLowerCase().includes(q) ||
      `${order?.first_name ?? ""} ${order?.last_name ?? ""}`.toLowerCase().includes(q)
    );
  });

  // Client-side search filter for emails
  const filteredEmails = emailEntries.filter((e) => {
    const matchesType = emailTypeFilter === "all" || e.type === emailTypeFilter;
    if (!matchesType) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.customer_name.toLowerCase().includes(q) ||
      e.customer_email.toLowerCase().includes(q) ||
      e.confirmation_id.toLowerCase().includes(q) ||
      e.to.toLowerCase().includes(q) ||
      (EMAIL_TYPE_LABEL[e.type]?.label ?? e.type).toLowerCase().includes(q)
    );
  });

  const smsCount   = comms.filter((c) => c.type === "sms_outbound" || c.type === "sms_inbound").length;
  const callsCount = comms.filter((c) => c.type === "call_outbound" || c.type === "call_inbound").length;

  const uniqueEmailTypes = [...new Set(emailEntries.map((e) => e.type))];

  return (
    <div className="space-y-5">
      {/* Header stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "SMS Sent",      value: comms.filter((c) => c.type === "sms_outbound").length,  icon: "ri-message-3-line",   color: "text-[#1a5c4f]",  bg: "bg-[#f0faf7]",   border: "border-[#b8ddd5]" },
          { label: "SMS Received",  value: comms.filter((c) => c.type === "sms_inbound").length,   icon: "ri-message-3-fill",   color: "text-gray-600",   bg: "bg-gray-50",     border: "border-gray-200" },
          { label: "Total Calls",   value: callsCount,                                              icon: "ri-phone-line",        color: "text-sky-600",    bg: "bg-sky-50",      border: "border-sky-200" },
          { label: "Emails Sent",   value: emailEntries.filter((e) => e.success).length,            icon: "ri-mail-send-line",    color: "text-amber-600",  bg: "bg-amber-50",    border: "border-amber-200" },
        ].map((s) => (
          <div key={s.label} className={`bg-white border ${s.border} rounded-xl p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 flex items-center justify-center ${s.bg} rounded-xl flex-shrink-0`}>
              <i className={`${s.icon} ${s.color} text-lg`}></i>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-gray-900 leading-none">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main tab switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button type="button" onClick={() => setMainTab("sms_calls")}
          className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 ${mainTab === "sms_calls" ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
          <i className="ri-chat-history-line"></i>
          SMS &amp; Calls <span className="text-xs opacity-60">({comms.length})</span>
        </button>
        <button type="button" onClick={() => { setMainTab("emails"); loadEmails(); }}
          className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer flex items-center gap-2 ${mainTab === "emails" ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
          <i className="ri-mail-line"></i>
          Emails <span className="text-xs opacity-60">({emailEntries.length})</span>
        </button>
      </div>

      {mainTab === "sms_calls" ? (
        <>
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex flex-col gap-3">
              {/* Row 1: Type + Direction filters */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Type filter */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  {[
                    { key: "all",      label: `All (${normalisedComms.length})` },
                    { key: "sms",      label: `SMS (${smsCount})` },
                    { key: "calls",    label: `Calls (${callsCount})` },
                    { key: "sequence", label: `Auto-Seq (${seqCount})` },
                  ].map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setTypeFilter(tab.key as typeof typeFilter)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${typeFilter === tab.key ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Direction filter */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  {[
                    { key: "all",      label: "Both" },
                    { key: "outbound", label: "Outbound" },
                    { key: "inbound",  label: "Inbound" },
                  ].map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setDirFilter(tab.key as typeof dirFilter)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${dirFilter === tab.key ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Row 2: Search + refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search message, phone, name..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
                  />
                </div>
                <button type="button" onClick={loadComms}
                  className="whitespace-nowrap w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex-shrink-0">
                  <i className="ri-refresh-line text-sm"></i>
                </button>
              </div>
            </div>
          </div>

          {/* SMS/Calls Feed */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
              </div>
            ) : filteredComms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                  <i className="ri-chat-history-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700">No communications yet</p>
                <p className="text-xs text-gray-400 mt-1">SMS and calls will appear here once sent or received</p>
              </div>
            ) : (
              <>
                <div className="hidden md:grid grid-cols-[28px_130px_1fr_150px_110px_90px_80px] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <span></span>
                  <span>Type</span>
                  <span>Message / Notes</span>
                  <span>Customer</span>
                  <span>Phone</span>
                  <span>Status</span>
                  <span>Time</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {filteredComms.map((entry) => {
                    const cfg   = TYPE_CONFIG[entry.type];
                    const order = entry.order_id ? orderMap.get(entry.order_id) : null;
                    const name  = order
                      ? [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email
                      : "Unknown";
                    const phone = entry.direction === "inbound"
                      ? (entry.phone_from ?? "—")
                      : (entry.phone_to ?? "—");
                    const isCall = entry.type === "call_outbound" || entry.type === "call_inbound";

                    return (
                      <div key={entry.id}
                        className={`grid grid-cols-1 md:grid-cols-[28px_130px_1fr_150px_110px_90px_80px] gap-3 md:gap-4 px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors ${isCall ? "border-l-2 border-sky-200" : ""}`}>
                        {/* Dot */}
                        <div className="hidden md:flex items-center justify-center">
                          <div className={`w-2 h-2 rounded-full ${cfg?.dot ?? "bg-gray-300"}`}></div>
                        </div>
                        {/* Type badge */}
                        <div>
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border w-fit ${cfg?.bg ?? "bg-gray-50 border-gray-200"} ${cfg?.textColor ?? "text-gray-500"}`}>
                            <i className={`${cfg?.icon ?? "ri-chat-1-line"} text-sm`}></i>
                            {cfg?.label ?? entry.type}
                          </div>
                        </div>
                        {/* Message */}
                        <div className="min-w-0">
                          {entry.body ? (
                            <p className="text-sm text-gray-700 truncate">{entry.body}</p>
                          ) : (
                            <p className="text-sm text-gray-400 italic">
                              {entry.type === "call_outbound" ? "Outbound call" : entry.type === "call_inbound" ? "Inbound call" : "No content"}
                            </p>
                          )}
                          {entry.recording_url && (
                            <a
                              href={entry.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-0.5 text-xs text-sky-600 hover:underline cursor-pointer"
                            >
                              <i className="ri-record-circle-line" style={{ fontSize: "10px" }}></i>Recording
                            </a>
                          )}
                          {entry.sent_by && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <i className="ri-user-line" style={{ fontSize: "10px" }}></i>{entry.sent_by}
                            </p>
                          )}
                        </div>
                        {/* Customer */}
                        {order ? (
                          <button type="button" onClick={() => onViewOrder(order)} className="text-left group cursor-pointer min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate group-hover:text-[#1a5c4f] transition-colors">{name}</p>
                            <p className="text-xs text-gray-400 font-mono truncate">{entry.confirmation_id}</p>
                            {order.state && <p className="text-xs text-gray-400">{order.state}</p>}
                          </button>
                        ) : (
                          <div className="min-w-0">
                            <p className="text-xs text-gray-400 italic">No order linked</p>
                            {entry.confirmation_id && (
                              <p className="text-xs font-mono text-gray-500">{entry.confirmation_id}</p>
                            )}
                          </div>
                        )}
                        {/* Phone */}
                        <p className="text-xs font-mono text-gray-600 truncate">{fmtPhone(phone)}</p>
                        {/* Status */}
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold w-fit ${
                          entry.status === "delivered" || entry.status === "sent"   ? "bg-[#f0faf7] text-[#1a5c4f]" :
                          entry.status === "failed"                                 ? "bg-red-50 text-red-600"       :
                          entry.status === "received"                               ? "bg-violet-50 text-violet-700" :
                          entry.status === "in_progress" || entry.status === "initiated" ? "bg-sky-50 text-sky-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {entry.status === "in_progress" ? "Active" :
                           entry.status === "initiated"   ? "Ringing" :
                           (entry.status ?? "—")}
                        </span>
                        {/* Time */}
                        <p className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(entry.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
                {hasMore && (
                  <div className="flex items-center justify-center py-4 border-t border-gray-100">
                    <button type="button" onClick={loadMore} disabled={loadingMore}
                      className="whitespace-nowrap flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 cursor-pointer disabled:opacity-50 transition-colors">
                      {loadingMore ? <><i className="ri-loader-4-line animate-spin"></i>Loading...</> : <><i className="ri-arrow-down-line"></i>Load More</>}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Email filter bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex flex-col gap-3">
              {/* Email type filter - select on mobile, pills on desktop */}
              <div className="flex items-center gap-2">
                {/* Mobile: dropdown */}
                <div className="flex sm:hidden relative flex-1">
                  <select
                    value={emailTypeFilter}
                    onChange={(e) => setEmailTypeFilter(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white cursor-pointer"
                  >
                    <option value="all">All Types ({emailEntries.length})</option>
                    {uniqueEmailTypes.map((t) => {
                      const cfg = EMAIL_TYPE_LABEL[t];
                      const count = emailEntries.filter((e) => e.type === t).length;
                      return <option key={t} value={t}>{cfg?.label ?? t} ({count})</option>;
                    })}
                  </select>
                  <i className="ri-arrow-down-s-line absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                </div>
                {/* Desktop: pills */}
                <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap overflow-x-auto">
                  <button type="button" onClick={() => setEmailTypeFilter("all")}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${emailTypeFilter === "all" ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                    All ({emailEntries.length})
                  </button>
                  {uniqueEmailTypes.map((t) => {
                    const cfg = EMAIL_TYPE_LABEL[t];
                    const count = emailEntries.filter((e) => e.type === t).length;
                    return (
                      <button key={t} type="button" onClick={() => setEmailTypeFilter(t)}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${emailTypeFilter === t ? "bg-white text-gray-800" : "text-gray-500 hover:text-gray-700"}`}>
                        {cfg?.label ?? t} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Search + refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email, order ID..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
                  />
                </div>
                <button type="button" onClick={loadEmails}
                  className="whitespace-nowrap w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors flex-shrink-0">
                  <i className="ri-refresh-line text-sm"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Emails table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingEmails ? (
              <div className="flex items-center justify-center py-16">
                <i className="ri-loader-4-line animate-spin text-2xl text-[#1a5c4f]"></i>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                  <i className="ri-mail-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700">No emails found</p>
                <p className="text-xs text-gray-400 mt-1">Emails are logged automatically when sent to customers and providers</p>
              </div>
            ) : (
              <>
                <div className="hidden md:grid grid-cols-[28px_160px_1fr_170px_90px_80px] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <span></span>
                  <span>Email Type</span>
                  <span>Customer</span>
                  <span>Sent To</span>
                  <span>Status</span>
                  <span>Time</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {filteredEmails.map((entry) => {
                    const cfg = EMAIL_TYPE_LABEL[entry.type] ?? { label: entry.type, icon: "ri-mail-line", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" };
                    const order = orderMap.get(entry.order_id);

                    return (
                      <div key={entry.id}
                        className="grid grid-cols-1 md:grid-cols-[28px_160px_1fr_170px_90px_80px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors">
                        <div className="hidden md:flex items-center justify-center">
                          <div className={`w-2 h-2 rounded-full ${entry.success ? "bg-[#1a5c4f]" : "bg-red-500"}`}></div>
                        </div>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border w-fit ${cfg.bg} ${cfg.color}`}>
                          <i className={`${cfg.icon} text-sm`}></i>
                          {cfg.label}
                        </div>
                        {order ? (
                          <button type="button" onClick={() => onViewOrder(order)} className="text-left group cursor-pointer min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate group-hover:text-[#1a5c4f] transition-colors">{entry.customer_name}</p>
                            <p className="text-xs text-gray-400 font-mono truncate">{entry.confirmation_id}</p>
                          </button>
                        ) : (
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{entry.customer_name}</p>
                            <p className="text-xs text-gray-400 font-mono truncate">{entry.confirmation_id}</p>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 truncate font-mono">{entry.to}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold w-fit ${entry.success ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-red-50 text-red-600"}`}>
                          <i className={entry.success ? "ri-checkbox-circle-fill" : "ri-close-circle-fill"} style={{ fontSize: "10px" }}></i>
                          {entry.success ? "Sent" : "Failed"}
                        </span>
                        <p className="text-xs text-gray-400 whitespace-nowrap">{fmtTime(entry.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
