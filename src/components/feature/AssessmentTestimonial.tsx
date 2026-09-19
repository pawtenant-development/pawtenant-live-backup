// Reusable assessment testimonial — ASSESSMENT-PRESENTATION-TRUST-001.
//
// Renders ONE short reassurance quote. Deliberately quiet: no star ratings, no
// photos, no award badges, no competitor branding. A testimonial must never
// compete with the question the customer is answering, so this is mounted at a
// small number of reassurance points, not on every screen.
//
// Placeholder safety: records marked `placeholder: true` render only when
// isPlaceholderContentAllowed() is true (TEST Supabase project). On LIVE the
// component renders nothing rather than showing synthetic content. See
// src/config/placeholderContent.ts for the second (build-time) layer.

import { isPlaceholderContentAllowed } from "../../config/placeholderContent";
import {
  ASSESSMENT_TESTIMONIALS,
  visibleTestimonials,
  type AssessmentTestimonial as Testimonial,
} from "../../data/assessmentTestimonials";

interface Props {
  /** Which reassurance point this is — picks a stable quote, never random. */
  index: number;
  className?: string;
  /** Test seam. Defaults to the real environment gate. */
  allowPlaceholders?: boolean;
  /** Test seam. Defaults to the shipped record set. */
  records?: Testimonial[];
}

export default function AssessmentTestimonial({
  index,
  className = "",
  allowPlaceholders,
  records = ASSESSMENT_TESTIMONIALS,
}: Props) {
  const allowed = allowPlaceholders ?? isPlaceholderContentAllowed();
  const pool = visibleTestimonials(allowed, records);
  if (pool.length === 0) return null;

  const t = pool[index % pool.length];
  const isPlaceholder = t.placeholder;

  return (
    <figure
      className={`rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 sm:px-5 ${className}`}
      // Reassurance content is supplementary to the question being answered.
      aria-label="What other applicants say"
    >
      {isPlaceholder && (
        // Visible internal marker. This is what makes a leak obvious to a human
        // reviewer as well as to the build guard.
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-900">
          <i className="ri-flask-line text-[11px]" aria-hidden="true"></i>
          TEST placeholder — not a real review
        </p>
      )}
      <blockquote className="text-[13px] leading-relaxed text-slate-700">
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-2 text-[11px] font-semibold text-slate-500">
        {t.name}
        {t.context ? <span className="font-normal text-slate-400"> · {t.context}</span> : null}
      </figcaption>
    </figure>
  );
}
