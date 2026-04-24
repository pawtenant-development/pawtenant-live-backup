/**
 * ContactRequestsTab — admin inbox for website contact-form submissions
 * captured into public.contact_submissions.
 *
 * Reads:
 *   - supabase.from("contact_submissions").select(...) with optional status
 *     filter. Anon SELECT allowed by migration policy
 *     contact_submissions_read_all.
 *
 * Writes:
 *   - supabase.from("contact_submissions").update(...) to flip status
 *     (new → viewed | resolved) and set resolved_at. Anon UPDATE allowed
 *     by contact_submissions_update_all — guarded at UI level.
 *
 * Keep UI deliberately lightweight: table + detail drawer. Fits inside the
 * admin-orders shell (renders under AdminSidebar + header).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { sendContactReply } from "../../../lib/contactSubmit";
import { getAdminIdentity } from "../../../lib/adminIdentity";

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  source_page: string | null;
  status: string;
  assigned_admin_id: string | null;
  created_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface ContactReplyRow {
  id: string;
  contact_submission_id: string;
  admin_email: string | null;
  admin_name: string | null;
  message: string;
  email_sent: boolean;
  email_error: string | null;
  sent_at: string | null;
  created_at: string;
}

type StatusFilter = "all" | "new" | "viewed" | "resolved";

const POLL_INTERVAL_MS = 30_000;
const STATUS_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  new: {
    label: "New",
    color: "bg-amber-50 text-amber-800 border border-amber-200",
    icon: "ri-mail-unread-line",
  },
  viewed: {
    label: "Viewed",
    color: "bg-[#e8f0f9] text-[#3b6ea5] border border-[#c9dcf0]",
    icon: "ri-mail-open-line",
  },
  resolved: {
    label: "Resolved",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: "ri-check-double-line",
  },
};

export default function ContactRequestsTab() {
  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [replies, setReplies] = useState<ContactReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const { data, error: qErr } = await supabase
          .from("contact_submissions")
          .select(
            "id, name, email, phone, subject, message, source_page, status, assigned_admin_id, created_at, resolved_at, metadata",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (!mountedRef.current) return;
        if (qErr) {
          setError(qErr.message);
          return;
        }
        const rows = (data ?? []) as ContactSubmission[];
        setItems((prev) => {
          const prevJson = JSON.stringify(prev);
          const nextJson = JSON.stringify(rows);
          return prevJson === nextJson ? prev : rows;
        });
        setError(null);
      } catch (e) {
        if (mountedRef.current) {
          setError((e as Error)?.message ?? "Failed to load contact requests");
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load(false);
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      void load(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const counts = useMemo(() => {
    let n = 0;
    let v = 0;
    let r = 0;
    for (const i of items) {
      if (i.status === "new") n++;
      else if (i.status === "viewed") v++;
      else if (i.status === "resolved") r++;
    }
    return { all: items.length, new: n, viewed: v, resolved: r };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${i.name ?? ""} ${i.email ?? ""} ${i.phone ?? ""} ${i.subject ?? ""} ${i.message ?? ""} ${i.source_page ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, statusFilter]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  async function markStatus(id: string, next: "viewed" | "resolved") {
    if (updating) return;
    setUpdating(true);
    try {
      const patch: {
        status: string;
        resolved_at?: string | null;
      } = { status: next };
      if (next === "resolved") {
        patch.resolved_at = new Date().toISOString();
      } else {
        patch.resolved_at = null;
      }
      const { error: uErr } = await supabase
        .from("contact_submissions")
        .update(patch)
        .eq("id", id);
      if (uErr) throw uErr;
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: next,
                resolved_at: next === "resolved" ? new Date().toISOString() : null,
              }
            : i,
        ),
      );
    } catch (e) {
      setError((e as Error)?.message ?? "Failed to update status");
    } finally {
      if (mountedRef.current) setUpdating(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const loadReplies = useCallback(async (submissionId: string) => {
    setRepliesLoading(true);
    try {
      const { data, error: qErr } = await supabase
        .from("contact_submission_replies")
        .select(
          "id, contact_submission_id, admin_email, admin_name, message, email_sent, email_error, sent_at, created_at",
        )
        .eq("contact_submission_id", submissionId)
        .order("created_at", { ascending: true });
      if (qErr) throw qErr;
      if (!mountedRef.current) return;
      setReplies((data ?? []) as ContactReplyRow[]);
    } catch {
      if (mountedRef.current) setReplies([]);
    } finally {
      if (mountedRef.current) setRepliesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setReplies([]);
      return;
    }
    void loadReplies(selectedId);
    const t = setInterval(() => {
      if (!mountedRef.current) return;
      void loadReplies(selectedId);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadReplies]);

  async function handleReplySent() {
    if (selectedId) await loadReplies(selectedId);
    // Bump row status to viewed if still new after reply sent.
    const row = items.find((i) => i.id === selectedId);
    if (row && row.status === "new") {
      setItems((prev) =>
        prev.map((i) =>
          i.id === row.id ? { ...i, status: "viewed" } : i,
        ),
      );
    }
  }

  async function openDetail(row: ContactSubmission) {
    setSelectedId(row.id);
    if (row.status === "new") {
      void markStatus(row.id, "viewed");
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 py-20 flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Website contact-form submissions. Replies go to
        <span className="font-semibold text-gray-700"> hello@pawtenant.com</span>
        {" "}as well.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <i className="ri-error-warning-line text-red-600 text-base mt-0.5"></i>
          <p className="text-sm text-red-700 font-semibold">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all",      label: "All",      count: counts.all },
              { key: "new",      label: "New",      count: counts.new },
              { key: "viewed",   label: "Viewed",   count: counts.viewed },
              { key: "resolved", label: "Resolved", count: counts.resolved },
            ] as { key: StatusFilter; label: string; count: number }[]).map((p) => {
              const active = statusFilter === p.key;
              const alertTint = p.key === "new" && p.count > 0 && !active;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setStatusFilter(p.key)}
                  className={`whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    active
                      ? p.key === "new"
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-[#3b6ea5] border-[#3b6ea5] text-white"
                      : alertTint
                        ? "bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400"
                        : "bg-white border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
                  }`}
                >
                  {p.label}
                  <span
                    className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-4 px-1.5 rounded-full text-[10px] ${
                      active
                        ? "bg-white/20"
                        : alertTint
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 sm:w-72">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, message…"
                className="w-full pl-9 pr-3 py-2 bg-[#f8f7f4] border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#3b6ea5]"
              />
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              title="Refresh"
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-[#3b6ea5] hover:border-[#3b6ea5] transition-colors cursor-pointer font-semibold disabled:opacity-50"
            >
              <i className={`ri-refresh-line text-xs ${refreshing ? "animate-spin" : ""}`}></i>
              <span className="hidden sm:inline">{refreshing ? "Loading…" : "Refresh"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-240px)]">
          <div className="px-4 py-2.5 bg-[#f8f7f4] border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {filtered.length}{" "}
              {filtered.length === 1 ? "Submission" : "Submissions"}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">Newest first</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400 font-medium">
                No contact submissions match the current filters.
              </div>
            ) : (
              filtered.map((row) => {
                const active = row.id === selectedId;
                const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.new;
                const isNew = row.status === "new";
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void openDetail(row)}
                    className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${
                      active
                        ? "bg-[#e8f0f9]"
                        : isNew
                          ? "bg-amber-50/30 hover:bg-amber-50"
                          : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p
                        className={`text-sm truncate ${
                          isNew ? "font-extrabold text-gray-900" : "font-bold text-gray-900"
                        }`}
                      >
                        {row.name || "Anonymous"}
                      </p>
                      <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                        {fmtRelative(row.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-1">{row.email}</p>
                    {row.subject && (
                      <p className="text-xs text-gray-700 font-semibold truncate mb-1">
                        {row.subject}
                      </p>
                    )}
                    <p
                      className={`text-xs line-clamp-2 mb-2 break-words ${
                        isNew ? "text-gray-800" : "text-gray-600"
                      }`}
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {safeSlice(row.message, 180)}
                    </p>
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${style.color}`}
                      >
                        <i className={style.icon}></i>
                        {style.label}
                      </span>
                      {row.source_page && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          <i className="ri-link"></i>
                          {row.source_page}
                        </span>
                      )}
                      {row.phone && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          <i className="ri-phone-line"></i>
                          {row.phone}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 min-h-[420px]">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <i className="ri-inbox-line text-gray-300 text-xl"></i>
              </div>
              <p className="text-sm font-semibold text-gray-500">Select a submission</p>
              <p className="text-xs text-gray-400 mt-1">
                Pick a row on the left to view the full message and actions.
              </p>
            </div>
          ) : (
            <SubmissionDetail
              row={selected}
              replies={replies}
              repliesLoading={repliesLoading}
              updating={updating}
              onResolve={() => void markStatus(selected.id, "resolved")}
              onReopen={() => void markStatus(selected.id, "viewed")}
              onCopy={copy}
              onReplySent={handleReplySent}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SubmissionDetail({
  row,
  replies,
  repliesLoading,
  updating,
  onResolve,
  onReopen,
  onCopy,
  onReplySent,
}: {
  row: ContactSubmission;
  replies: ContactReplyRow[];
  repliesLoading: boolean;
  updating: boolean;
  onResolve: () => void;
  onReopen: () => void;
  onCopy: (text: string) => void;
  onReplySent: () => void;
}) {
  const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.new;
  const mailto = (() => {
    const subj = encodeURIComponent(
      row.subject ? `Re: ${row.subject}` : "Your PawTenant message",
    );
    return `mailto:${row.email}?subject=${subj}`;
  })();

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-1">
            Contact Submission
          </p>
          <h2 className="text-lg font-extrabold text-gray-900">
            {row.name || "Anonymous"}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Received {fmtAbsolute(row.created_at)}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${style.color}`}
        >
          <i className={style.icon}></i>
          {style.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 pb-5 border-b border-gray-100">
        <MetaCell
          label="Email"
          value={row.email}
          icon="ri-mail-line"
          copyable
          onCopy={onCopy}
        />
        <MetaCell
          label="Phone"
          value={row.phone || "—"}
          icon="ri-phone-line"
          copyable={!!row.phone}
          onCopy={onCopy}
        />
        <MetaCell
          label="Subject"
          value={row.subject || "—"}
          icon="ri-price-tag-3-line"
        />
        <MetaCell
          label="Page"
          value={row.source_page || "—"}
          icon="ri-link"
        />
      </div>

      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">
        Message
      </p>
      <div
        className="bg-[#f8f7f4] border border-gray-100 rounded-xl px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words mb-5"
        style={{ overflowWrap: "anywhere" }}
      >
        {row.message}
      </div>

      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">
            Metadata
          </p>
          <pre className="bg-[#f8f7f4] border border-gray-100 rounded-xl px-4 py-3 text-[11px] text-gray-700 overflow-x-auto mb-5">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={mailto}
          className="inline-flex items-center gap-1.5 bg-[#3b6ea5] text-white text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-[#2e5a87] cursor-pointer transition-colors"
        >
          <i className="ri-reply-line text-xs"></i>
          Reply via Email
        </a>
        <button
          type="button"
          onClick={() => onCopy(row.email)}
          className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg hover:text-[#3b6ea5] hover:border-[#3b6ea5] cursor-pointer transition-colors"
        >
          <i className="ri-file-copy-line text-xs"></i>
          Copy Email
        </button>
        {row.phone && (
          <a
            href={`tel:${row.phone}`}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg hover:text-[#3b6ea5] hover:border-[#3b6ea5] cursor-pointer transition-colors"
          >
            <i className="ri-phone-line text-xs"></i>
            Call
          </a>
        )}
        {row.status !== "resolved" ? (
          <button
            type="button"
            onClick={onResolve}
            disabled={updating}
            className="inline-flex items-center gap-1.5 bg-white border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i
              className={`${updating ? "ri-loader-4-line animate-spin" : "ri-check-double-line"} text-xs`}
            ></i>
            Mark Resolved
          </button>
        ) : (
          <button
            type="button"
            onClick={onReopen}
            disabled={updating}
            className="inline-flex items-center gap-1.5 bg-white border border-amber-200 text-amber-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i
              className={`${updating ? "ri-loader-4-line animate-spin" : "ri-refresh-line"} text-xs`}
            ></i>
            Reopen
          </button>
        )}
      </div>

      <RepliesSection
        submission={row}
        replies={replies}
        repliesLoading={repliesLoading}
        mailto={mailto}
        onReplySent={onReplySent}
      />
    </div>
  );
}

function RepliesSection({
  submission,
  replies,
  repliesLoading,
  mailto,
  onReplySent,
}: {
  submission: ContactSubmission;
  replies: ContactReplyRow[];
  repliesLoading: boolean;
  mailto: string;
  onReplySent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<null | {
    emailSent: boolean;
    emailError?: string;
  }>(null);

  // Reset draft state when switching submissions.
  useEffect(() => {
    setDraft("");
    setSending(false);
    setSendError(null);
    setLastResult(null);
  }, [submission.id]);

  const canSend = draft.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    setLastResult(null);
    try {
      const admin = await getAdminIdentity().catch(() => ({
        id: null,
        email: null,
        name: null,
      }));
      const result = await sendContactReply({
        submission_id: submission.id,
        message: draft.trim(),
        admin_id: admin.id ?? null,
        admin_email: admin.email ?? null,
        admin_name: admin.name ?? null,
      });
      setLastResult({
        emailSent: result.emailSent,
        emailError: result.emailError,
      });
      setDraft("");
      onReplySent();
    } catch (e) {
      setSendError((e as Error)?.message ?? "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
          Replies ({replies.length})
        </p>
        {repliesLoading && (
          <i className="ri-loader-4-line animate-spin text-gray-400 text-xs"></i>
        )}
      </div>

      {replies.length > 0 && (
        <div className="space-y-2 mb-4">
          {replies.map((r) => (
            <div
              key={r.id}
              className="bg-[#f8f7f4] border border-gray-100 rounded-xl px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[11px] font-bold text-gray-700">
                  {r.admin_name || r.admin_email || "Admin"}
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.email_sent
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                    title={r.email_error ?? undefined}
                  >
                    <i
                      className={
                        r.email_sent
                          ? "ri-mail-send-line"
                          : "ri-mail-close-line"
                      }
                    ></i>
                    {r.email_sent ? "Sent" : "Saved (email skipped)"}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                    {fmtRelative(r.sent_at ?? r.created_at)}
                  </span>
                </div>
              </div>
              <p
                className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words"
                style={{ overflowWrap: "anywhere" }}
              >
                {r.message}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${submission.email}…`}
          rows={4}
          maxLength={10_000}
          disabled={sending}
          className="w-full text-sm text-gray-800 px-4 py-3 focus:outline-none resize-y disabled:bg-gray-50 disabled:text-gray-400"
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#f8f7f4] border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            Sends from <span className="font-semibold">noreply@pawtenant.com</span>, replies route to <span className="font-semibold">hello@pawtenant.com</span>.
          </p>
          <div className="flex items-center gap-2">
            <a
              href={mailto}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-[#3b6ea5] cursor-pointer"
              title="Open in local mail client (fallback)"
            >
              <i className="ri-external-link-line"></i>
              mailto
            </a>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="whitespace-nowrap inline-flex items-center gap-1.5 bg-[#3b6ea5] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg hover:bg-[#2e5a87] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <i
                className={`${
                  sending
                    ? "ri-loader-4-line animate-spin"
                    : "ri-send-plane-line"
                } text-xs`}
              ></i>
              {sending ? "Sending…" : "Send Reply"}
            </button>
          </div>
        </div>
      </div>

      {sendError && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          <i className="ri-error-warning-line mr-1"></i>
          {sendError} — you can still use{" "}
          <a href={mailto} className="underline font-bold">
            mailto fallback
          </a>
          .
        </div>
      )}
      {lastResult && !sendError && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            lastResult.emailSent
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}
        >
          <i
            className={`${
              lastResult.emailSent
                ? "ri-mail-send-line"
                : "ri-mail-close-line"
            } mr-1`}
          ></i>
          {lastResult.emailSent
            ? "Reply sent and logged."
            : `Reply saved but email not sent${lastResult.emailError ? ` (${lastResult.emailError})` : ""}.`}
        </div>
      )}
    </div>
  );
}

function MetaCell({
  label,
  value,
  icon,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  icon: string;
  copyable?: boolean;
  onCopy?: (text: string) => void;
}) {
  return (
    <div className="bg-[#f8f7f4] rounded-xl px-3 py-2.5 border border-gray-100">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
        <i className={icon}></i>
        {label}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-800 font-semibold truncate">{value}</p>
        {copyable && value !== "—" && onCopy && (
          <button
            type="button"
            onClick={() => onCopy(value)}
            title="Copy"
            className="text-gray-400 hover:text-[#3b6ea5] text-sm cursor-pointer flex-shrink-0"
          >
            <i className="ri-file-copy-line"></i>
          </button>
        )}
      </div>
    </div>
  );
}

function safeSlice(s: string, n: number): string {
  if (!s) return "";
  const arr = [...s];
  if (arr.length <= n) return s;
  return arr.slice(0, n - 1).join("") + "…";
}

function fmtRelative(ts: string | null): string {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAbsolute(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
