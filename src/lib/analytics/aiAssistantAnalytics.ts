/**
 * aiAssistantAnalytics.ts — read-only aggregation for AI Assistant Trust Card
 * button clicks.
 *
 * Source: public.events rows where event_name = 'ai_assistant_prompt_click'
 * (emitted by src/components/feature/AIAssistantTrustCard.tsx). The relevant
 * fields live in the JSONB `props` column:
 *   props->>assistant         chatgpt | claude | perplexity | gemini
 *   props->>page_path         the page the card was on
 *   props->>service_type      general | esa | psd | comparison
 *   props->>prompt_type       prefilled_link | copy_prompt
 *   props->>destination_host  chatgpt.com | claude.ai | www.perplexity.ai | gemini.google.com
 *   props->>clipboard_status  copied | fallback | failed   (Gemini only)
 *
 * public.events has RLS that blocks ALL direct client SELECTs, so reads go
 * through the admin-gated SECURITY DEFINER RPC get_ai_assistant_clicks
 * (migration 20260628140000) — the same pattern as get_visitor_source_data.
 * The RPC returns the flattened JSON fields scoped to the date window; this
 * module aggregates them client-side.
 */

import { supabase } from "@/lib/supabaseClient";

export const AI_ASSISTANT_EVENT = "ai_assistant_prompt_click";

export const AI_ASSISTANTS = ["chatgpt", "claude", "perplexity", "gemini"] as const;
export type AiAssistant = (typeof AI_ASSISTANTS)[number];

export const AI_SERVICE_TYPES = ["general", "esa", "psd", "comparison"] as const;
export type AiServiceType = (typeof AI_SERVICE_TYPES)[number];

/** One flattened click row (the JSON fields we care about). */
export interface AiAssistantClickRow {
  assistant: string | null;
  service_type: string | null;
  prompt_type: string | null;
  page_path: string | null;
  clipboard_status: string | null;
}

export interface AiAssistantTopPage {
  page_path: string;
  clicks: number;
  /** Most-clicked assistant on this page. */
  topAssistant: string;
  /** Dominant service_type seen for this page. */
  serviceType: string;
}

export interface AiAssistantAnalytics {
  totalClicks: number;
  /** Keyed by assistant — always includes all four keys (0 when none). */
  byAssistant: Record<string, number>;
  /** Keyed by service_type — always includes all four keys (0 when none). */
  byServiceType: Record<string, number>;
  topPages: AiAssistantTopPage[];
  geminiClipboard: { copied: number; fallback: number; failed: number };
  byPromptType: { prefilled_link: number; copy_prompt: number };
}

/** Safe upper bound on rows pulled for client-side aggregation. */
const ROW_LIMIT = 20000;

function zeroByAssistant(): Record<string, number> {
  return AI_ASSISTANTS.reduce<Record<string, number>>((acc, k) => ((acc[k] = 0), acc), {});
}
function zeroByServiceType(): Record<string, number> {
  return AI_SERVICE_TYPES.reduce<Record<string, number>>((acc, k) => ((acc[k] = 0), acc), {});
}

/** Pick the key with the highest count (ties broken by first-seen order). */
function topKey(counts: Record<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bestN) {
      best = k;
      bestN = counts[k];
    }
  }
  return best;
}

/**
 * Aggregate raw click rows into the panel's view model. Exported so the shape
 * can be unit-tested / reused without a network round-trip.
 */
export function aggregateAiAssistantClicks(rows: AiAssistantClickRow[]): AiAssistantAnalytics {
  const byAssistant = zeroByAssistant();
  const byServiceType = zeroByServiceType();
  const geminiClipboard = { copied: 0, fallback: 0, failed: 0 };
  const byPromptType = { prefilled_link: 0, copy_prompt: 0 };

  // page_path -> { clicks, perAssistant, perService }
  const pages = new Map<
    string,
    { clicks: number; perAssistant: Record<string, number>; perService: Record<string, number> }
  >();

  for (const r of rows) {
    const assistant = (r.assistant || "").toLowerCase();
    const service = (r.service_type || "").toLowerCase();
    const promptType = (r.prompt_type || "").toLowerCase();
    const page = r.page_path || "(unknown)";
    const clip = (r.clipboard_status || "").toLowerCase();

    if (assistant in byAssistant) byAssistant[assistant] += 1;
    if (service in byServiceType) byServiceType[service] += 1;
    if (promptType === "prefilled_link") byPromptType.prefilled_link += 1;
    else if (promptType === "copy_prompt") byPromptType.copy_prompt += 1;
    if (clip === "copied") geminiClipboard.copied += 1;
    else if (clip === "fallback") geminiClipboard.fallback += 1;
    else if (clip === "failed") geminiClipboard.failed += 1;

    let entry = pages.get(page);
    if (!entry) {
      entry = { clicks: 0, perAssistant: {}, perService: {} };
      pages.set(page, entry);
    }
    entry.clicks += 1;
    if (assistant) entry.perAssistant[assistant] = (entry.perAssistant[assistant] || 0) + 1;
    if (service) entry.perService[service] = (entry.perService[service] || 0) + 1;
  }

  const topPages: AiAssistantTopPage[] = [...pages.entries()]
    .map(([page_path, e]) => ({
      page_path,
      clicks: e.clicks,
      topAssistant: topKey(e.perAssistant) || "—",
      serviceType: topKey(e.perService) || "—",
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return {
    totalClicks: rows.length,
    byAssistant,
    byServiceType,
    topPages,
    geminiClipboard,
    byPromptType,
  };
}

/**
 * Fetch + aggregate AI assistant clicks for an inclusive date window.
 * `fromIso` / `toIso` are ISO timestamps (e.g. the Analytics tab's
 * rangeFrom.toISOString()).
 */
export async function fetchAiAssistantAnalytics(
  fromIso: string,
  toIso: string,
): Promise<AiAssistantAnalytics> {
  const { data, error } = await supabase.rpc("get_ai_assistant_clicks", {
    p_from: fromIso,
    p_to: toIso,
    p_limit: ROW_LIMIT,
  });

  if (error) throw error;
  return aggregateAiAssistantClicks((data ?? []) as AiAssistantClickRow[]);
}
