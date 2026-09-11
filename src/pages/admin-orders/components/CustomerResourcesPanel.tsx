// CustomerResourcesPanel — Admin → Settings → Website Content →
// "Customer Resources → Planners". The owner replaces, previews, publishes,
// rolls back or disables the Pet Care Planner customers download from their
// portal — with no code change, no hardcoded URL, no SQL, no deployment and
// no per-order rewrite. ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001.
//
// Two distinct slots: the ESA planner and the PSD planner. Only the ESA slot
// is meant to be populated by this task; the PSD slot stays visibly inactive
// until the owner uploads AND explicitly publishes a PSD asset.
//
// Every write goes through an is_admin_staff()-gated SECURITY DEFINER RPC or
// the admin-upload-customer-resource edge function (which validates the PDF
// by content). Publishing carries the slot's lock_version, so a stale edit by
// a second admin is refused and the panel reloads instead of clobbering.
// Nothing here deletes a version or a storage object.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, getAdminUserToken } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const THUMB_BUCKET = "customer-resource-previews";

interface VersionRow {
  id: string;
  version: number;
  storage_bucket: string;
  storage_path: string;
  thumbnail_bucket: string | null;
  thumbnail_path: string | null;
  original_filename: string;
  byte_size: number;
  sha256: string;
  page_count: number | null;
  release_notes: string | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  uploaded_at: string;
  first_published_at: string | null;
  last_published_at: string | null;
  last_unpublished_at: string | null;
  superseded_by_version_id: string | null;
  retired_at: string | null;
  is_active: boolean;
  storage_object_exists: boolean;
}

interface SlotRow {
  resource_key: "esa_planner" | "psd_planner";
  service_family: "esa" | "psd";
  display_name: string;
  customer_subtitle: string;
  advertised: boolean;
  active_version_id: string | null;
  lock_version: number;
  published_at: string | null;
  published_by: string | null;
  unpublished_at: string | null;
  updated_at: string;
  versions: VersionRow[];
}

interface EventRow {
  id: number;
  resource_key: string;
  version_id: string | null;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface Overview {
  slots: SlotRow[];
  events: EventRow[];
}

const SLOT_LABEL: Record<SlotRow["resource_key"], string> = {
  esa_planner: "ESA planner",
  psd_planner: "PSD planner",
};

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function thumbUrl(v: VersionRow | null | undefined): string | null {
  if (!v?.thumbnail_bucket || !v.thumbnail_path) return null;
  try {
    return supabase.storage.from(v.thumbnail_bucket).getPublicUrl(v.thumbnail_path).data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

/** Fresh 5-minute admin preview URL for ANY version (draft or published). */
async function adminPreviewUrl(versionId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const token = await getAdminUserToken();
  if (!token) return { ok: false, error: "Your admin session has expired — please sign in again." };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-customer-resource-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
      body: JSON.stringify({ adminVersionId: versionId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
    if (res.ok && data.ok && data.signedUrl) return { ok: true, url: data.signedUrl };
    return { ok: false, error: data.error ?? `Preview failed (HTTP ${res.status})` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export default function CustomerResourcesPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error" | "info"; msg: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const showToast = (kind: "success" | "error" | "info", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 6000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("admin_customer_resources_overview");
    if (error) {
      setLoadError(error.code === "42501" ? "Admin staff only." : "Could not load customer resources.");
      setOverview(null);
    } else {
      setOverview((data ?? { slots: [], events: [] }) as Overview);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const publish = async (slot: SlotRow, v: VersionRow) => {
    const isRollback = !!slot.active_version_id && slot.versions.find((x) => x.id === slot.active_version_id)!.version > v.version;
    const verb = isRollback ? "Roll back to" : "Publish";
    if (!window.confirm(`${verb} version ${v.version} of the ${SLOT_LABEL[slot.resource_key]}?\n\nEligible paid ${slot.service_family.toUpperCase()} customers will see this version immediately. No order is changed.`)) return;
    setBusy(`publish:${v.id}`);
    const { data, error } = await supabase.rpc("admin_customer_resource_publish", {
      p_resource_key: slot.resource_key,
      p_version_id: v.id,
      p_expected_lock_version: slot.lock_version,
      p_note: null,
    });
    setBusy(null);
    const r = (data ?? {}) as { ok?: boolean; reason?: string; action?: string; unchanged?: boolean };
    if (error) { showToast("error", error.code === "42501" ? "Admin staff only." : "Publish failed."); return; }
    if (!r.ok) {
      if (r.reason === "stale") showToast("error", "Someone else changed this planner a moment ago. The panel has been refreshed — please review and try again.");
      else if (r.reason === "storage_object_missing") showToast("error", "That version's PDF is missing from storage, so it cannot be published.");
      else showToast("error", `Publish refused: ${r.reason ?? "unknown reason"}.`);
      await load();
      return;
    }
    showToast("success", r.unchanged ? `Version ${v.version} is already live.` : `${r.action === "rollback" ? "Rolled back to" : "Published"} version ${v.version}.`);
    await load();
  };

  const unpublish = async (slot: SlotRow) => {
    if (!window.confirm(`Disable the ${SLOT_LABEL[slot.resource_key]}?\n\nCustomers will see an honest "temporarily unavailable" state until a version is published again. Nothing is deleted.`)) return;
    setBusy(`unpublish:${slot.resource_key}`);
    const { data, error } = await supabase.rpc("admin_customer_resource_unpublish", {
      p_resource_key: slot.resource_key,
      p_expected_lock_version: slot.lock_version,
      p_note: null,
    });
    setBusy(null);
    const r = (data ?? {}) as { ok?: boolean; reason?: string };
    if (error) { showToast("error", "Disable failed."); return; }
    if (!r.ok) {
      showToast("error", r.reason === "stale" ? "Someone else changed this planner a moment ago. The panel has been refreshed." : `Disable refused: ${r.reason}.`);
      await load();
      return;
    }
    showToast("success", `${SLOT_LABEL[slot.resource_key]} disabled.`);
    await load();
  };

  const preview = async (v: VersionRow) => {
    setBusy(`preview:${v.id}`);
    const win = window.open("about:blank", "_blank");
    const r = await adminPreviewUrl(v.id);
    setBusy(null);
    if (r.ok && r.url) {
      if (win) win.location.href = r.url; else window.location.href = r.url;
    } else {
      win?.close();
      showToast("error", r.error ?? "Preview failed.");
    }
  };

  const replaceThumbnail = async (v: VersionRow, file: File) => {
    setBusy(`thumb:${v.id}`);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const path = `${v.storage_path.split("/")[0]}/${stamp}-v${v.version}-thumb.${ext}`;
    const { error: upErr } = await supabase.storage.from(THUMB_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (upErr) { setBusy(null); showToast("error", `Thumbnail upload failed: ${upErr.message}`); return; }
    const { data, error } = await supabase.rpc("admin_customer_resource_set_thumbnail", {
      p_version_id: v.id, p_thumbnail_bucket: THUMB_BUCKET, p_thumbnail_path: path,
    });
    setBusy(null);
    const r = (data ?? {}) as { ok?: boolean; reason?: string };
    if (error || !r.ok) { showToast("error", `Thumbnail could not be attached${r.reason ? ` (${r.reason})` : ""}.`); return; }
    showToast("success", `Thumbnail updated on version ${v.version}.`);
    await load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && !overview) {
    return <div className="text-sm text-gray-500 flex items-center gap-2"><i className="ri-loader-4-line animate-spin"></i>Loading customer resources…</div>;
  }
  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
        <span>{loadError}</span>
        <button type="button" onClick={() => void load()} className="text-xs font-bold underline cursor-pointer">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 border ${
          toast.kind === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : toast.kind === "error" ? "bg-red-50 border-red-200 text-red-800"
            : "bg-[#e8f0f9] border-[#dbe4f0] text-[#1e3a5f]"}`}>
          <i className={`${toast.kind === "success" ? "ri-checkbox-circle-fill" : toast.kind === "error" ? "ri-error-warning-fill" : "ri-information-fill"} mt-0.5`}></i>
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
        <p className="font-bold text-gray-800 mb-1">How this works</p>
        <p>
          Upload a new PDF (it is checked server-side: real PDF, no scripts, not encrypted, under 25 MB) → it appears as a <strong>draft</strong> version.
          Preview it, then <strong>Publish</strong>. Eligible paid customers see the published version immediately — no deployment, no order changes.
          Every earlier version stays here for audit and one-click roll back. <strong>Disable</strong> hides the planner until you publish again. Nothing is ever deleted from this screen.
        </p>
      </div>

      {(overview?.slots ?? []).map((slot) => {
        const active = slot.versions.find((v) => v.id === slot.active_version_id) ?? null;
        const isPsd = slot.resource_key === "psd_planner";
        const status = active
          ? { label: `Published · v${active.version}`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "ri-checkbox-circle-fill" }
          : slot.versions.length
            ? { label: "Disabled — nothing published", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: "ri-pause-circle-fill" }
            : { label: isPsd ? "Inactive — no PSD asset supplied yet" : "Inactive — no asset uploaded", cls: "bg-gray-100 text-gray-600 border-gray-200", icon: "ri-forbid-line" };
        return (
          <section key={slot.resource_key} className="border border-gray-200 rounded-2xl overflow-hidden" data-slot={slot.resource_key}>
            <header className="px-5 py-4 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3">
              <div className={`w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 ${isPsd ? "bg-amber-50 text-amber-600" : "bg-orange-50 text-orange-500"}`}>
                <i className="ri-book-open-line text-lg"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-gray-900">{SLOT_LABEL[slot.resource_key]} <span className="text-gray-400 font-semibold">· {slot.display_name}</span></h4>
                <p className="text-xs text-gray-500">Shown to paid <strong>{slot.service_family.toUpperCase()}</strong> customers only · “{slot.customer_subtitle}”</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${status.cls}`}>
                <i className={status.icon}></i>{status.label}
              </span>
            </header>

            <div className="px-5 py-4 space-y-5 bg-[#fcfcfd]">
              {isPsd && !slot.versions.length && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                  The PSD planner is a <strong>different document</strong> that has not been supplied yet. Customers see nothing for this slot, and no PSD page advertises a planner, until you upload and publish the real PSD asset here. Do not upload the ESA planner into this slot.
                </div>
              )}

              {/* Current / active version */}
              {active && (
                <div className="bg-white border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="w-20 flex-shrink-0 rounded-lg overflow-hidden ring-1 ring-gray-200 bg-gray-50">
                    <img
                      src={thumbUrl(active) ?? (isPsd ? "/assets/planner/psd-workbook-cover.jpg" : "/assets/planner/pet-care-planner-cover.jpg")}
                      alt=""
                      width={720}
                      height={920}
                      loading="lazy"
                      className="w-full h-auto block"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-gray-600 space-y-1">
                    <p className="text-sm font-extrabold text-gray-900">Currently live: version {active.version}</p>
                    <p><span className="text-gray-400">File</span> <span className="font-semibold text-gray-800 break-all">{active.original_filename}</span> · {fmtBytes(active.byte_size)} · {active.page_count ?? "?"} pages</p>
                    <p><span className="text-gray-400">Uploaded</span> {fmtDate(active.uploaded_at)} by {active.uploaded_by_email ?? "—"}</p>
                    <p><span className="text-gray-400">Published</span> {fmtDate(slot.published_at)}</p>
                    <p className="font-mono text-[10px] text-gray-400 break-all">sha256 {active.sha256}</p>
                    <p className="text-[10px] text-gray-400">{thumbUrl(active) ? "Custom thumbnail" : "Default cover thumbnail (upload one below to override)"}</p>
                    {!active.storage_object_exists && (
                      <p className="text-red-600 font-bold">⚠ The PDF for this version is missing from storage.</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button type="button" onClick={() => void preview(active)} disabled={busy !== null}
                        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#e8f0f9] text-[#1e3a5f] hover:bg-[#dbe4f0] cursor-pointer disabled:opacity-50">
                        <i className="ri-eye-line"></i>Preview PDF
                      </button>
                      <button type="button" onClick={() => void unpublish(slot)} disabled={busy !== null}
                        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer disabled:opacity-50">
                        <i className="ri-pause-circle-line"></i>Disable (unpublish)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload a new version */}
              <UploadForm slot={slot} disabled={busy !== null} onDone={(msg, ok) => { showToast(ok ? "success" : "error", msg); if (ok) void load(); }} />

              {/* Version history */}
              {slot.versions.length > 0 && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500 mb-2">Version history</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-bold">Ver.</th>
                          <th className="text-left px-3 py-2 font-bold">File</th>
                          <th className="text-left px-3 py-2 font-bold">Uploaded</th>
                          <th className="text-left px-3 py-2 font-bold">State</th>
                          <th className="text-right px-3 py-2 font-bold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slot.versions.map((v) => {
                          const activeVersionNo = active?.version ?? 0;
                          const state = v.is_active ? "Live"
                            : v.retired_at ? "Retired"
                            : !v.storage_object_exists ? "File missing"
                            : v.superseded_by_version_id ? "Superseded"
                            : v.first_published_at ? "Previously published"
                            : "Draft";
                          const stateCls = v.is_active ? "text-emerald-700 bg-emerald-50"
                            : state === "File missing" || state === "Retired" ? "text-red-700 bg-red-50"
                            : state === "Draft" ? "text-[#1e3a5f] bg-[#e8f0f9]" : "text-gray-600 bg-gray-100";
                          const canPublish = !v.is_active && !v.retired_at && v.storage_object_exists;
                          const isRollback = canPublish && activeVersionNo > v.version;
                          return (
                            <tr key={v.id} className="border-t border-gray-100 align-top" data-version={v.version}>
                              <td className="px-3 py-2 font-extrabold text-gray-900">v{v.version}</td>
                              <td className="px-3 py-2 text-gray-700">
                                <p className="font-semibold break-all">{v.original_filename}</p>
                                <p className="text-gray-400">{fmtBytes(v.byte_size)} · {v.page_count ?? "?"} pages{v.release_notes ? ` · ${v.release_notes}` : ""}</p>
                              </td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                                <p>{fmtDate(v.uploaded_at)}</p>
                                <p className="text-gray-400 break-all">{v.uploaded_by_email ?? "—"}</p>
                              </td>
                              <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full font-bold ${stateCls}`}>{state}</span></td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  <button type="button" onClick={() => void preview(v)} disabled={busy !== null || !v.storage_object_exists}
                                    className="whitespace-nowrap px-2.5 py-1 rounded-md font-bold bg-[#e8f0f9] text-[#1e3a5f] hover:bg-[#dbe4f0] cursor-pointer disabled:opacity-50">
                                    Preview
                                  </button>
                                  <label className={`whitespace-nowrap px-2.5 py-1 rounded-md font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                                    Thumbnail
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                      onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void replaceThumbnail(v, f); }} />
                                  </label>
                                  {canPublish && (
                                    <button type="button" onClick={() => void publish(slot, v)} disabled={busy !== null}
                                      className={`whitespace-nowrap px-2.5 py-1 rounded-md font-bold cursor-pointer disabled:opacity-50 ${isRollback ? "bg-amber-100 text-amber-900 hover:bg-amber-200" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                                      {isRollback ? "Roll back to this" : "Publish"}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* Audit trail */}
      {(overview?.events?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500 mb-2">Recent activity</p>
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-xs">
            {overview!.events.slice(0, 20).map((e) => (
              <li key={e.id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-gray-800 capitalize">{e.action}</span>
                <span className="text-gray-500">{SLOT_LABEL[e.resource_key as SlotRow["resource_key"]] ?? e.resource_key}</span>
                {typeof e.details?.version === "number" && <span className="text-gray-500">v{String(e.details.version)}</span>}
                <span className="text-gray-400 ml-auto whitespace-nowrap">{e.actor_email ?? "—"} · {fmtDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UploadForm({ slot, disabled, onDone }: { slot: SlotRow; disabled: boolean; onDone: (msg: string, ok: boolean) => void }) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!pdf) return;
    setUploading(true);
    try {
      const token = await getAdminUserToken();
      if (!token) { onDone("Your admin session has expired — please sign in again.", false); return; }
      const fd = new FormData();
      fd.append("resourceKey", slot.resource_key);
      fd.append("releaseNotes", notes.trim());
      fd.append("file", pdf, pdf.name);
      if (thumb) fd.append("thumbnail", thumb, thumb.name);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-upload-customer-resource`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: { version?: number }; pageCount?: number };
      if (!res.ok || !data.ok) { onDone(data.error ?? `Upload failed (HTTP ${res.status})`, false); return; }
      onDone(`Uploaded as draft version ${data.version?.version ?? "?"} (${data.pageCount ?? "?"} pages). Preview it, then Publish when ready.`, true);
      setPdf(null); setThumb(null); setNotes("");
      if (pdfRef.current) pdfRef.current.value = "";
      if (thumbRef.current) thumbRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500 mb-3">Upload a new version (saved as a draft — publishing is a separate step)</p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-[11px] font-bold text-gray-600 mb-1">Planner PDF <span className="text-gray-400 font-normal">(max 25 MB)</span></label>
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" disabled={disabled || uploading}
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-[#e8f0f9] file:text-[#1e3a5f] file:font-bold file:text-xs" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-600 mb-1">Thumbnail <span className="text-gray-400 font-normal">(optional · JPEG/PNG/WebP · max 2 MB)</span></label>
          <input ref={thumbRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading}
            onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:font-bold file:text-xs" />
        </div>
        <button type="button" onClick={() => void submit()} disabled={!pdf || disabled || uploading}
          className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#3b6ea5] text-white hover:bg-[#2d5a8e] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          {uploading ? <><i className="ri-loader-4-line animate-spin"></i>Checking & uploading…</> : <><i className="ri-upload-2-line"></i>Upload draft</>}
        </button>
      </div>
      <div className="mt-3">
        <label className="block text-[11px] font-bold text-gray-600 mb-1">Release notes <span className="text-gray-400 font-normal">(optional, internal)</span></label>
        <input type="text" value={notes} maxLength={300} disabled={disabled || uploading} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Added the disclaimer on page 2; fixed duplicate page 14"
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
      </div>
    </div>
  );
}
