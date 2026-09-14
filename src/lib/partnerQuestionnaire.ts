/**
 * PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — the canonical parser for a
 * pasted partner questionnaire.
 *
 * A partner's staff copies a customer's completed mental-health questionnaire
 * out of their own system and pastes it into the New Partner Order form. The
 * text is stored VERBATIM on `orders.assessment_answers.partnerQuestionnaireText`
 * and is the clinical record. This module derives an ORDERED question/answer
 * representation from it so the admin screen, the provider screen and the
 * downloadable assessment can all number and lay out the same content.
 *
 * Contract — the three rules every consumer relies on:
 *   1. NOTHING IS DROPPED AND NOTHING IS INVENTED. Every non-blank source line
 *      lands in exactly one block (a question, an answer, or the "additional
 *      information" remainder), in source order. `questionnaireIsLossless()`
 *      proves it and `partner_submit_manual_order` re-checks it server-side
 *      before storing.
 *   2. NO CLINICAL JUDGEMENT. Answers are never summarised, rewritten,
 *      corrected or classified. Line breaks inside an answer are kept.
 *   3. UNCERTAIN TEXT IS SHOWN, NOT HIDDEN. Anything that does not look like a
 *      numbered question — a preamble, an un-numbered trailing note, a wholly
 *      unparseable paste — is returned in `additional` so the UI can render it
 *      as "Additional Questionnaire Information" instead of an empty section.
 *
 * The parser is deliberately pure (no imports, no I/O) so the same file can be
 * bundled into the web app and copied byte-for-byte into an edge function.
 */

export const PARTNER_QUESTIONNAIRE_FORMAT = "qa_blocks.v1" as const;

export interface QuestionnaireBlock {
  /** The number the partner's document used. Always present in this format. */
  number: number;
  /** The question text as written, joined across wrapped lines with a space. */
  question: string;
  /** The answer as written. Multi-line answers keep their line breaks. Empty when the
   *  document listed the question with no answer beneath it. */
  answer: string;
}

export interface ParsedQuestionnaire {
  format: typeof PARTNER_QUESTIONNAIRE_FORMAT;
  blocks: QuestionnaireBlock[];
  /** Non-question text, in source order: a preamble before question 1, or the
   *  whole paste when no numbered questions were recognised. */
  additional: string[];
  /** Count of non-blank source lines. */
  sourceLineCount: number;
}

const NEWLINE = "\n";

/** Normalise line endings and non-breaking spaces; keep blank lines. */
export function normaliseQuestionnaireText(raw: string): string {
  return String(raw ?? "").replace(/\r\n?/g, NEWLINE).replace(/ /g, " ");
}

// "1 How often…", "1. How…", "1) How…", "1: How…", "Q1. How…", "Q 1 How…", "#1 How…"
const QUESTION_START = /^\s*(?:q(?:uestion)?\s*)?#?(\d{1,3})\s*(?:[.)\]:\-–]\s*|\s+)(\S.*)$/i;

// The first word of a question, for numbered lines that carry no "?" ("11 In
// your own words, please describe…", "7 Describe how…", "9 Select all that
// apply."). A numbered ANSWER ("5 years or more", "6 hours on average",
// "2 dogs at home") starts with a noun, so it is read as an answer even when
// its number happens to be the next question number.
const QUESTION_OPENER =
  /^(how|what|when|where|which|who|whom|whose|why|do|does|did|are|is|was|were|have|has|had|can|could|would|should|will|please|describe|list|select|tell|explain|in|if|any|other|additional|rate|indicate|check|choose|provide|comments?|approximately|about)\b/i;

/** Does the text after a number read like a question rather than a numeric answer?
 *  An explicit question mark, or a question opener followed by at least one more word. */
function looksLikeQuestionText(text: string): boolean {
  const t = text.trim();
  if (/\?/.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 2 && QUESTION_OPENER.test(t);
}

/**
 * Parse a pasted questionnaire into ordered question/answer blocks.
 *
 * Recognised shapes (all seen in real partner exports):
 *   • "1 How often…?" / "1. …" / "1) …" / "Q1: …" with the answer on the
 *     following line(s) until the next numbered question.
 *   • A question that WRAPS onto a second line ("…mental health or" /
 *     "causing stress?") — joined while the question has no "?" yet and the
 *     next line supplies one.
 *   • Multi-line and wrapped answers, blank lines between blocks, semicolon-
 *     separated multi-select answers, narrative answers spanning several lines.
 *   • Numbers 1–13 or beyond; numbering must simply increase by one from the
 *     first recognised question, which is what stops "5 years" being read as
 *     question 5 in the middle of question 4's answer.
 */
export function parsePartnerQuestionnaire(raw: string): ParsedQuestionnaire {
  const text = normaliseQuestionnaireText(raw);
  const lines = text.split(NEWLINE).map((l) => l.replace(/\s+$/g, ""));
  const nonBlank = lines.filter((l) => l.trim() !== "");

  const blocks: QuestionnaireBlock[] = [];
  const additional: string[] = [];
  let preamble: string[] = [];
  let current: { number: number; question: string; answer: string[]; questionOpen: boolean } | null = null;
  let expectedNumber: number | null = null;

  const flush = () => {
    if (!current) return;
    blocks.push({
      number: current.number,
      question: current.question.trim(),
      answer: current.answer.join(NEWLINE).trim(),
    });
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // Blank lines separate blocks visually; inside an answer they are kept so a
      // multi-paragraph narrative keeps its shape. They never carry content.
      if (current && current.answer.length > 0 && !current.questionOpen) current.answer.push("");
      continue;
    }

    const m = trimmed.match(QUESTION_START);
    const n = m ? Number(m[1]) : NaN;
    const isStart =
      !!m &&
      Number.isFinite(n) &&
      (expectedNumber === null ? n >= 1 : n === expectedNumber) &&
      looksLikeQuestionText(m![2]);

    if (isStart) {
      flush();
      const qText = m![2].trim();
      current = { number: n, question: qText, answer: [], questionOpen: !/\?/.test(qText) };
      expectedNumber = n + 1;
      continue;
    }

    if (!current) {
      preamble.push(trimmed);
      continue;
    }

    // A wrapped question: the question has no "?" yet and this line ends with one.
    if (current.questionOpen && current.answer.length === 0 && /\?\s*$/.test(trimmed)) {
      current.question = `${current.question} ${trimmed}`;
      current.questionOpen = false;
      continue;
    }
    current.questionOpen = false;
    current.answer.push(line.replace(/^\s+/, ""));
  }
  flush();

  if (blocks.length === 0) {
    // Nothing recognised: the entire paste is shown, unchanged, as additional information.
    additional.push(...nonBlank.map((l) => l.trim()));
    preamble = [];
  } else if (preamble.length > 0) {
    additional.push(...preamble);
  }

  return { format: PARTNER_QUESTIONNAIRE_FORMAT, blocks, additional, sourceLineCount: nonBlank.length };
}

/** Strip a "Q"/"Question"/"#" prefix so "Q1. How…" and "1 How…" compare equal. */
function numberingKey(line: string): string {
  return line.replace(/^\s*(?:q(?:uestion)?\s*)?#?(?=\d)/i, "");
}

/** Letters and digits only — the comparison ignores punctuation and spacing,
 *  which the parser is allowed to normalise, and nothing else. */
function alnum(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

/**
 * TRUE when the parsed representation contains every non-blank source line and
 * exactly the source's letters and digits — nothing dropped, nothing invented.
 * `partner_submit_manual_order` repeats this same check in SQL before storing.
 */
export function questionnaireIsLossless(raw: string, parsed: ParsedQuestionnaire): boolean {
  const text = normaliseQuestionnaireText(raw);
  const sourceLines = text.split(NEWLINE).map((l) => l.trim()).filter((l) => l !== "");
  const bag = alnum(
    [...parsed.additional, ...parsed.blocks.flatMap((b) => [`${b.number} ${b.question}`, b.answer])].join(NEWLINE),
  );
  let sourceChars = 0;
  for (const l of sourceLines) {
    const key = alnum(numberingKey(l));
    sourceChars += key.length;
    if (key !== "" && !bag.includes(key)) return false;
  }
  return bag.length === sourceChars;
}

/**
 * The stored representation, when a submission carried one and it still
 * matches the raw text, or a fresh parse of the raw text. Consumers ALWAYS get
 * something renderable when raw text exists — an empty questionnaire section
 * with non-empty raw text is the defect this task repairs, so it cannot be
 * produced by this function.
 */
export function resolvePartnerQuestionnaire(
  answers: Record<string, unknown> | null | undefined,
): ParsedQuestionnaire | null {
  if (!answers || typeof answers !== "object") return null;
  const raw = (answers as Record<string, unknown>).partnerQuestionnaireText;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const stored = (answers as Record<string, unknown>).partnerQuestionnaireBlocks;
  if (Array.isArray(stored) && stored.length > 0) {
    const blocks: QuestionnaireBlock[] = [];
    let valid = true;
    for (const item of stored) {
      if (!item || typeof item !== "object") { valid = false; break; }
      const q = (item as Record<string, unknown>).question;
      const a = (item as Record<string, unknown>).answer;
      const n = (item as Record<string, unknown>).number;
      if (typeof q !== "string" || typeof a !== "string" || typeof n !== "number") { valid = false; break; }
      blocks.push({ number: n, question: q, answer: a });
    }
    const additionalRaw = (answers as Record<string, unknown>).partnerQuestionnaireAdditional;
    const additional = Array.isArray(additionalRaw)
      ? additionalRaw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
    if (valid && blocks.length > 0) {
      const candidate: ParsedQuestionnaire = {
        format: PARTNER_QUESTIONNAIRE_FORMAT,
        blocks,
        additional,
        sourceLineCount: normaliseQuestionnaireText(raw).split(NEWLINE).filter((l) => l.trim() !== "").length,
      };
      // A stored representation that no longer matches the raw text (edited in
      // place, truncated, tampered) is NOT trusted — the raw text wins.
      if (questionnaireIsLossless(raw, candidate)) return candidate;
    }
  }
  return parsePartnerQuestionnaire(raw);
}
