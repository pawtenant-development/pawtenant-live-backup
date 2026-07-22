// PsdTaskInfographic — accessible HTML/CSS replacement for the broken
// "psd-depression-qualify.png" infographic (SEO-PSD-ESA-CONDITION-ARTICLE-BATCH-001).
//
// The source PNG contained visibly corrupted / duplicated text ("activities
// activities", "Harming kin meditins", malformed self-harm and dissociation
// wording). It is NOT shipped. This component recreates the CONCEPT as a
// responsive, screen-reader-friendly card grid using the existing PawTenant
// design system (orange / warm cream, ri-* icons already in the build subset,
// no text baked into an image, no external asset).
//
// Wording is deliberately careful and legally safe: these are EXAMPLES only, a
// service dog must be INDIVIDUALLY TRAINED, each task must relate directly to
// the handler's OWN disability, and suitability is individualized — no implication
// that every dog performs every task.

const tasks = [
  {
    icon: "ri-shield-cross-line",
    title: "Interrupting harmful or destructive behaviors",
    desc: "Recognizing an escalating behavior and physically interrupting it — for example, nudging or pawing to break a cycle of self-directed harm.",
  },
  {
    icon: "ri-focus-3-line",
    title: "Grounding and reality-orientation prompts",
    desc: "Using trained tactile contact to help a handler reorient during dissociation, flashbacks, or sensory overload.",
  },
  {
    icon: "ri-list-check-2",
    title: "Prompting activities of daily living",
    desc: "Cueing a handler to get out of bed, eat a meal, or begin a routine when depressive symptoms make starting difficult.",
  },
  {
    icon: "ri-route-line",
    title: "Guiding a handler to safety during dissociation",
    desc: "Leading a disoriented handler to a chosen safe place, or away from a hazard, when awareness is impaired.",
  },
  {
    icon: "ri-heart-pulse-line",
    title: "Deep pressure therapy during anxiety or panic",
    desc: "Applying trained body-weight pressure across the lap or chest to help the handler settle during a panic or anxiety episode.",
  },
  {
    icon: "ri-medicine-bottle-fill",
    title: "Medication reminders",
    desc: "Performing a trained behavior at set times to prompt the handler to take prescribed medication, or retrieving a medication container.",
  },
  {
    icon: "ri-walk-line",
    title: "Interrupting rumination or prolonged immobility",
    desc: "Nudging or leading a handler to move when they are stuck in rumination or unable to get going.",
  },
];

/**
 * PSD trained-task examples infographic. Renders a semantic heading + card grid
 * meant to sit inside an article's max-w container (no outer width wrapper of
 * its own). `id` anchors the section for the table of contents.
 */
export default function PsdTaskInfographic({ id = "psd-task-examples" }: { id?: string }) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2
        id={id}
        className="text-xl md:text-2xl font-extrabold text-gray-900 mt-12 mb-4 scroll-mt-28"
      >
        <span id={`${id}-heading`}>
          Examples of Tasks a Psychiatric Service Dog May Be Trained to Perform
        </span>
      </h2>
      <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-5">
        These are examples only. A psychiatric service dog must be{" "}
        <strong className="text-gray-800">individually trained</strong>, and each task must relate
        directly to the handler&apos;s own disability. Whether a specific task is appropriate — and
        whether a particular dog is suited to perform it — is an individualized decision. Not every
        dog can perform every task.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 my-5">
        {tasks.map((t) => (
          <div key={t.title} className="bg-[#fafafa] border border-gray-100 rounded-xl p-4">
            <p className="text-[13px] font-bold text-gray-900 mb-1 flex items-start gap-2">
              <i className={`${t.icon} text-orange-500 mt-0.5`}></i>
              {t.title}
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
          </div>
        ))}
      </div>

      <p className="text-xs md:text-[13px] text-gray-500 leading-relaxed mb-2">
        A psychiatric service dog is defined by trained work or tasks like these — not by a letter,
        vest, badge, ID card, or registration. Whether a task-trained dog is the right path is a
        clinical and individual decision made with a licensed professional.
      </p>
    </section>
  );
}
