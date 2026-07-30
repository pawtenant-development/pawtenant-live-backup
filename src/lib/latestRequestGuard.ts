// ADMIN-ORDER-PENDING-DELIVERY-REOPEN-NOTIFICATIONS-REALTIME-001 §9
//
// Monotonic request-generation guard: only the NEWEST in-flight request may
// commit its result.
//
// WHY THIS EXISTS AS ITS OWN MODULE
// ---------------------------------
// The Admin Orders aggregates (monthly banner, faceted counts) are refetched on
// filter changes AND on every mutation, so overlapping requests are normal. A
// slow earlier response landing after a fast later one publishes counts that do
// not match the filters on screen — the "counts change from a broad dataset to a
// much smaller one" flicker.
//
// The order-list loader already solves this with an inline `loadSeqRef` counter
// (ADMIN-ORDERS-DATASET-FLICKER-P0-001). This is that same rule, extracted so it
// can be UNIT TESTED by resolving two requests in reverse order — §9 requires
// proof, and an inline ref inside a 200KB component cannot be exercised directly.
//
// WHY NOT AbortController
// -----------------------
// Aborting would also be correct for the network, but these callers go through
// supabase-js RPC/COUNT helpers that do not expose a signal, and an aborted
// request still has to be prevented from committing. A generation check covers
// both the abortable and non-abortable cases with one rule, and — unlike an
// effect-cleanup `cancelled` boolean — it also protects requests started OUTSIDE
// an effect (i.e. from a mutation handler), which is exactly where the stale KPI
// bug lived.

/** Monotonic token source. Not React-specific; hold one per logical dataset. */
export interface RequestGuard {
  /** Begin a request. Returns the generation id to pass to `isLatest`. */
  begin: () => number;
  /** True only if `gen` is still the most recently begun generation. */
  isLatest: (gen: number) => boolean;
  /** Most recently issued generation (for assertions/tests). */
  current: () => number;
}

export function createRequestGuard(): RequestGuard {
  let seq = 0;
  return {
    begin: () => ++seq,
    isLatest: (gen: number) => gen === seq,
    current: () => seq,
  };
}

/**
 * Run `work` under a guard and hand the result to `commit` ONLY if no newer
 * request started meanwhile.
 *
 * Errors are swallowed for superseded requests: a stale request failing is not
 * an error the operator needs to see, because its result was going to be
 * discarded anyway. The newest request's failure IS surfaced via `onError`.
 */
export async function runLatest<T>(
  guard: RequestGuard,
  work: () => Promise<T>,
  commit: (value: T) => void,
  onError?: (err: unknown) => void,
): Promise<void> {
  const gen = guard.begin();
  try {
    const value = await work();
    if (guard.isLatest(gen)) commit(value);
  } catch (err) {
    if (guard.isLatest(gen)) onError?.(err);
  }
}
