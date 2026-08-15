/**
 * useConversation — search + unified-thread data layer for the Command Center.
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
 *
 * Read-only. Every read goes through an RPC that is gated on `check_is_admin()`
 * — the SAME predicate the existing `communications` RLS policy already uses, so
 * no role gains visibility it did not have. A non-admin gets SQLSTATE 42501, not
 * an empty list, so an authorization failure is never mistaken for "no results".
 *
 * WHY AN RPC AND NOT A POSTGREST QUERY
 * ------------------------------------
 * The thread must union rows matched by NORMALISED PHONE with rows matched by
 * ORDER, ordered by one clock, keyset-paginated. PostgREST `.or()` across a
 * generated column plus a foreign key, with a compound cursor, is not
 * expressible without shipping the whole table to the browser and filtering
 * there — which would also hand every admin's browser rows it did not ask for.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { normalizeE164, type IdentityState } from "../../../../lib/conversationIdentity";

/** One row of the left-queue search result. */
export interface ConversationHit {
  contactE164: string | null;
  displayName: string | null;
  email: string | null;
  orderId: string | null;
  confirmationId: string | null;
  matchKind: "phone" | "email" | "name" | "order";
  identityState: IdentityState;
  candidateCount: number;
  lastAt: string | null;
  lastChannel: string | null;
  lastPreview: string | null;
  messageCount: number;
}

/** One event in the unified middle thread. */
export interface ThreadEvent {
  id: string;
  type: string;
  direction: string | null;
  body: string | null;
  subject: string | null;
  phoneFrom: string | null;
  phoneTo: string | null;
  contactE164: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  durationSeconds: number | null;
  status: string | null;
  sentBy: string | null;
  recordingUrl: string | null;
  twilioSid: string | null;
  providerEventId: string | null;
  ghlSyncState: string | null;
  ghlSyncErrorCode: string | null;
  ghlSyncAttempts: number | null;
  orderId: string | null;
  confirmationId: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
}

// deno-lint-ignore-file
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapHit(r: any): ConversationHit {
  return {
    contactE164: r.contact_e164 ?? null,
    displayName: r.display_name ?? null,
    email: r.email ?? null,
    orderId: r.order_id ?? null,
    confirmationId: r.confirmation_id ?? null,
    matchKind: (r.match_kind ?? "phone") as ConversationHit["matchKind"],
    identityState: (r.identity_state ?? "unknown") as IdentityState,
    candidateCount: Number(r.candidate_count ?? 0),
    lastAt: r.last_at ?? null,
    lastChannel: r.last_channel ?? null,
    lastPreview: r.last_preview ?? null,
    messageCount: Number(r.message_count ?? 0),
  };
}

function mapEvent(r: any): ThreadEvent {
  return {
    id: r.id,
    type: r.type,
    direction: r.direction ?? null,
    body: r.body ?? null,
    subject: r.subject ?? null,
    phoneFrom: r.phone_from ?? null,
    phoneTo: r.phone_to ?? null,
    contactE164: r.contact_e164 ?? null,
    emailFrom: r.email_from ?? null,
    emailTo: r.email_to ?? null,
    durationSeconds: r.duration_seconds ?? null,
    status: r.status ?? null,
    sentBy: r.sent_by ?? null,
    recordingUrl: r.recording_url ?? null,
    twilioSid: r.twilio_sid ?? null,
    providerEventId: r.provider_event_id ?? null,
    ghlSyncState: r.ghl_sync_state ?? null,
    ghlSyncErrorCode: r.ghl_sync_error_code ?? null,
    ghlSyncAttempts: r.ghl_sync_attempts ?? null,
    orderId: r.order_id ?? null,
    confirmationId: r.confirmation_id ?? null,
    failureCode: r.failure_code ?? null,
    failureReason: r.failure_reason ?? null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

export interface UseConversationSearchResult {
  query: string;
  setQuery: (v: string) => void;
  hits: ConversationHit[];
  searching: boolean;
  /** True once a search has actually run and returned nothing. */
  empty: boolean;
  /** Non-null when the RPC refused or failed — never conflated with "empty". */
  error: string | null;
  clear: () => void;
}

export function useConversationSearch(): UseConversationSearchResult {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ConversationHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic token. Without it a slow query for "620" can land AFTER a fast
  // query for "6202539921" and repaint the list with stale results — the classic
  // debounced-search race that shows the wrong customer's conversation.
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setHits([]); setSearching(false); setRan(false); setError(null);
      return;
    }
    setSearching(true);
    const mySeq = ++seqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc("admin_search_conversations", {
          p_query: q,
          p_limit: 40,
        });
        if (mySeq !== seqRef.current) return; // superseded by a newer keystroke
        if (rpcErr) {
          // 42501 is the admin gate refusing, not an empty result. Saying
          // "no results" here would tell an unauthorised viewer that the
          // customer does not exist, which is both wrong and a disclosure.
          setError(
            rpcErr.code === "42501"
              ? "You do not have permission to search communications."
              : rpcErr.message || "Search failed.",
          );
          setHits([]);
        } else {
          setError(null);
          setHits(((data ?? []) as unknown[]).map(mapHit));
        }
        setRan(true);
      } catch {
        if (mySeq !== seqRef.current) return;
        setError("Search failed. Check your connection and try again.");
        setHits([]); setRan(true);
      } finally {
        if (mySeq === seqRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const clear = useCallback(() => {
    seqRef.current++;            // invalidate any in-flight response
    setQuery(""); setHits([]); setRan(false); setError(null); setSearching(false);
  }, []);

  return {
    query, setQuery, hits, searching,
    empty: ran && !searching && hits.length === 0 && !error,
    error, clear,
  };
}

const PAGE = 50;

export interface UseThreadResult {
  events: ThreadEvent[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadOlder: () => void;
  refresh: () => void;
  /** Count of events that arrived since the last time the view was at bottom. */
  newSinceSeen: number;
  markSeen: () => void;
}

/**
 * Load one unified thread for a phone identity and/or a linked order.
 *
 * Both keys are passed when known: a customer's SMS lives under the phone, but
 * their order-confirmation EMAILS carry only `order_id` and no phone at all.
 * Passing one key alone silently drops half the history.
 */
export function useConversationThread(
  contactE164: string | null,
  orderId: string | null,
  pollMs = 30_000,
): UseThreadResult {
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSinceSeen, setNewSinceSeen] = useState(0);

  const seenTopRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const key = normalizeE164(contactE164) || null;
  const hasTarget = !!key || !!orderId;

  const fetchPage = useCallback(async (beforeAt: string | null, beforeId: string | null) => {
    const { data, error: rpcErr } = await supabase.rpc("admin_conversation_thread", {
      p_contact_e164: key,
      p_order_id: orderId,
      p_limit: PAGE,
      p_before_at: beforeAt,
      p_before_id: beforeId,
    });
    if (rpcErr) throw rpcErr;
    return ((data ?? []) as unknown[]).map(mapEvent);
  }, [key, orderId]);

  const load = useCallback(async (silent: boolean) => {
    if (!hasTarget) { setEvents([]); setHasMore(false); return; }
    if (!silent) setLoading(true);
    try {
      const page = await fetchPage(null, null);
      if (!mountedRef.current) return;
      setError(null);
      setHasMore(page.length === PAGE);
      setEvents((prev) => {
        // Count genuinely NEW events for the "new messages" indicator, keyed on
        // id rather than length: a page whose oldest row rolled off has the same
        // length as before but is not the same page.
        const prevIds = new Set(prev.map((e) => e.id));
        const fresh = page.filter((e) => !prevIds.has(e.id));
        if (prev.length > 0 && fresh.length > 0 && seenTopRef.current !== page[0]?.id) {
          setNewSinceSeen((n) => n + fresh.length);
        }
        return page;
      });
    } catch (e) {
      if (!mountedRef.current) return;
      const err = e as { code?: string; message?: string };
      setError(
        err.code === "42501"
          ? "You do not have permission to view this conversation."
          : err.message || "Could not load this conversation.",
      );
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [hasTarget, fetchPage]);

  useEffect(() => {
    setEvents([]); setNewSinceSeen(0); seenTopRef.current = null;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, orderId]);

  useEffect(() => {
    if (!hasTarget || pollMs <= 0) return;
    const t = window.setInterval(() => { void load(true); }, pollMs);
    return () => window.clearInterval(t);
  }, [hasTarget, pollMs, load]);

  const loadOlder = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    setLoadingMore(true);
    void (async () => {
      try {
        // Keyset cursor from the OLDEST loaded row. Offset pagination would
        // re-serve or skip rows every time a new message lands mid-scroll.
        const oldest = events[events.length - 1];
        const page = await fetchPage(oldest.createdAt, oldest.id);
        if (!mountedRef.current) return;
        setHasMore(page.length === PAGE);
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...page.filter((e) => !seen.has(e.id))];
        });
      } catch {
        if (mountedRef.current) setError("Could not load older messages.");
      } finally {
        if (mountedRef.current) setLoadingMore(false);
      }
    })();
  }, [events, hasMore, loadingMore, fetchPage]);

  const markSeen = useCallback(() => {
    seenTopRef.current = events[0]?.id ?? null;
    setNewSinceSeen(0);
  }, [events]);

  return {
    events, loading, loadingMore, hasMore, error,
    loadOlder, refresh: () => void load(true),
    newSinceSeen, markSeen,
  };
}
