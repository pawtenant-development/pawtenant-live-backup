// supabase/functions/migrate-provider-headshots/index.ts
//
// PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001
//
// ONE-SHOT MIGRATION HELPER. Copies existing provider headshots from
// email-derived object keys to neutral `<provider_uuid>/<version_uuid>.<ext>`
// keys and repoints every authoritative reference.
//
// WHY THIS EXISTS AS AN EDGE FUNCTION
// Copying storage bytes requires service-role storage access. Edge Functions
// receive SUPABASE_SERVICE_ROLE_KEY from their own environment, so the secret
// never has to be handled outside Supabase, never enters the repo, and never
// enters a developer's shell history.
//
// SAFETY PROPERTIES (deliberate — this function is short-lived and is deleted
// immediately after the migration is verified):
//   - NEVER deletes a storage object. Old objects are removed separately, only
//     after production has been verified on the new keys.
//   - Idempotent. A reference already on a neutral key is skipped, and a
//     destination object that already exists is not rewritten.
//   - Non-destructive to provider data: it writes ONLY photo_url columns.
//     Publication status, approval status, bios, NPI, licences and states are
//     never touched.
//   - Returns counts and neutral keys ONLY. No email address, no old key and no
//     provider name is ever included in the response body.
//   - Defaults to dry_run. `{"mode":"apply"}` is required to mutate anything.
//
// Bytes are preserved exactly: the object is downloaded and re-uploaded
// unmodified. No recompression, no resizing, no format conversion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BUCKET = "provider-headshots";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEUTRAL_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Object key from a public storage URL, or null. */
function keyFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/object\/public\/provider-headshots\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function extFor(mime: string | null, key: string): string {
  const m = (mime ?? "").toLowerCase();
  if (ALLOWED[m]) return ALLOWED[m];
  const raw = (key.split(".").pop() ?? "").toLowerCase();
  if (raw === "jpeg") return "jpg";
  return /^(jpg|png|webp|gif)$/.test(raw) ? raw : "jpg";
}

function contentTypeFor(mime: string | null, ext: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m && ALLOWED[m]) return m === "image/jpg" ? "image/jpeg" : m;
  return ext === "png"
    ? "image/png"
    : ext === "webp"
      ? "image/webp"
      : ext === "gif"
        ? "image/gif"
        : "image/jpeg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  let mode = "dry_run";
  try {
    const body = await req.json();
    if (body && typeof body.mode === "string") mode = body.mode;
  } catch {
    /* default dry_run */
  }
  const apply = mode === "apply";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const publicBase = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/`;

  // ── Build the work list from the three authoritative reference tables ──────
  const [apRes, dpRes, dcRes] = await Promise.all([
    admin.from("approved_providers").select("id, photo_url"),
    admin.from("doctor_profiles").select("id, photo_url, email"),
    admin.from("doctor_contacts").select("id, photo_url, email"),
  ]);
  if (apRes.error || dpRes.error || dcRes.error) {
    return json(
      { error: "reference read failed", detail: apRes.error?.message ?? dpRes.error?.message ?? dcRes.error?.message },
      500,
    );
  }

  type Row = { id: string; photo_url: string | null; email?: string | null };
  const ap = (apRes.data ?? []) as Row[];
  const dp = (dpRes.data ?? []) as Row[];
  const dc = (dcRes.data ?? []) as Row[];

  // oldKey -> owning provider uuid. Precedence: approved_providers, then
  // doctor_profiles, then doctor_contacts. Any of these is a non-PII internal id.
  const owner = new Map<string, string>();
  for (const r of dc) {
    const k = keyFromUrl(r.photo_url);
    if (k && !NEUTRAL_RE.test(k) && UUID_RE.test(r.id)) owner.set(k, r.id);
  }
  for (const r of dp) {
    const k = keyFromUrl(r.photo_url);
    if (k && !NEUTRAL_RE.test(k) && UUID_RE.test(r.id)) owner.set(k, r.id);
  }
  for (const r of ap) {
    const k = keyFromUrl(r.photo_url);
    if (k && !NEUTRAL_RE.test(k) && UUID_RE.test(r.id)) owner.set(k, r.id);
  }

  const results: Array<{
    newKey: string | null;
    bytesIn: number | null;
    bytesOut: number | null;
    byteMatch: boolean;
    copied: boolean;
    refsUpdated: { approved_providers: number; doctor_profiles: number; doctor_contacts: number };
    error?: string;
  }> = [];

  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let refsTotal = 0;

  for (const [oldKey, providerId] of owner.entries()) {
    try {
      const dl = await admin.storage.from(BUCKET).download(oldKey);
      if (dl.error || !dl.data) {
        failed++;
        results.push({
          newKey: null, bytesIn: null, bytesOut: null, byteMatch: false, copied: false,
          refsUpdated: { approved_providers: 0, doctor_profiles: 0, doctor_contacts: 0 },
          error: `download failed: ${dl.error?.message ?? "no data"}`,
        });
        continue;
      }
      const buf = await dl.data.arrayBuffer();
      const bytesIn = buf.byteLength;
      const ext = extFor(dl.data.type, oldKey);
      const contentType = contentTypeFor(dl.data.type, ext);
      const newKey = `${providerId.toLowerCase()}/${crypto.randomUUID()}.${ext}`;

      if (!apply) {
        results.push({
          newKey, bytesIn, bytesOut: null, byteMatch: false, copied: false,
          refsUpdated: { approved_providers: 0, doctor_profiles: 0, doctor_contacts: 0 },
        });
        skipped++;
        continue;
      }

      const up = await admin.storage
        .from(BUCKET)
        .upload(newKey, buf, { contentType, upsert: false, cacheControl: "31536000" });
      if (up.error) {
        failed++;
        results.push({
          newKey, bytesIn, bytesOut: null, byteMatch: false, copied: false,
          refsUpdated: { approved_providers: 0, doctor_profiles: 0, doctor_contacts: 0 },
          error: `upload failed: ${up.error.message}`,
        });
        continue;
      }

      // Verify the destination before repointing anything.
      const verify = await admin.storage.from(BUCKET).download(newKey);
      const bytesOut = verify.data ? (await verify.data.arrayBuffer()).byteLength : null;
      const byteMatch = bytesOut === bytesIn;
      if (!byteMatch) {
        failed++;
        results.push({
          newKey, bytesIn, bytesOut, byteMatch, copied: true,
          refsUpdated: { approved_providers: 0, doctor_profiles: 0, doctor_contacts: 0 },
          error: "byte size mismatch — references NOT updated",
        });
        continue;
      }

      const newUrl = `${publicBase}${newKey}`;
      const oldUrlLike = `%${oldKey}`;

      const [uAp, uDp, uDc] = await Promise.all([
        admin.from("approved_providers").update({ photo_url: newUrl }).like("photo_url", oldUrlLike).select("id"),
        admin.from("doctor_profiles").update({ photo_url: newUrl }).like("photo_url", oldUrlLike).select("id"),
        admin.from("doctor_contacts").update({ photo_url: newUrl }).like("photo_url", oldUrlLike).select("id"),
      ]);

      const refsUpdated = {
        approved_providers: uAp.data?.length ?? 0,
        doctor_profiles: uDp.data?.length ?? 0,
        doctor_contacts: uDc.data?.length ?? 0,
      };
      refsTotal += refsUpdated.approved_providers + refsUpdated.doctor_profiles + refsUpdated.doctor_contacts;
      copied++;
      results.push({ newKey, bytesIn, bytesOut, byteMatch, copied: true, refsUpdated });
    } catch (e) {
      failed++;
      results.push({
        newKey: null, bytesIn: null, bytesOut: null, byteMatch: false, copied: false,
        refsUpdated: { approved_providers: 0, doctor_profiles: 0, doctor_contacts: 0 },
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Response carries neutral keys and counts only — never an old key, an email
  // or a provider name.
  return json({
    mode: apply ? "apply" : "dry_run",
    bucket: BUCKET,
    legacyKeysFound: owner.size,
    copied,
    skippedDryRun: skipped,
    failed,
    referencesUpdated: refsTotal,
    results,
  });
});
