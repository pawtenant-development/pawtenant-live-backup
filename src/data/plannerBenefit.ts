// plannerBenefit — the SINGLE source of the marketing copy for the free
// customer resources included with paid packages:
//   * ESA — the "Pet Care Planner by PawTenant"
//   * PSD — the "Psychiatric Service Dog Training Workbook by PawTenant"
// ESA-PLANNER-CUSTOMER-RESOURCE-TEST-001 / ESA-PSD-PLANNERS-MARKETING-LIVE-001.
//
// SERVICE-AWARE BY CONSTRUCTION. Every surface asks `plannerBenefitFor(family)`
// or reads `PLANNER_MARKETING[family]`; nothing hardcodes the other family's
// wording. The PSD workbook became a published asset on 2026-09-11
// (PSD_PLANNER_PUBLISHED = true); flip it back to false only if the PSD slot
// is deliberately retired, and the PSD copy disappears everywhere at once.
//
// PRESENTATION-ONLY. Nothing here reaches a charge, Stripe, order, refund or
// payout path, and nothing here grants access — entitlement is decided by the
// database (customer_resource_entitlements) from the authoritative payment and
// service-family helpers. Copy always says ELIGIBLE customers receive the
// resource; no surface may promise it to every visitor.
//
// Compliance: the planner is an organizational aid — never medical care,
// veterinary advice, a clinical document, or part of the provider's
// evaluation. The PSD workbook is an educational planning and recordkeeping
// resource — it never certifies a dog, creates legal rights, guarantees public
// access or airline acceptance, or replaces professional training, veterinary
// care, medical advice or legal advice.

export type PlannerFamily = "esa" | "psd";

export const PLANNER_NAME = "Pet Care Planner by PawTenant";
export const PSD_WORKBOOK_NAME = "Psychiatric Service Dog Training Workbook by PawTenant";

/** The short benefit line for package cards and inclusion lists. */
export const ESA_PLANNER_BENEFIT_SHORT = "Free Pet Care Planner by PawTenant";
/** The supporting line — when the customer actually gets it. */
export const ESA_PLANNER_BENEFIT_TIMING = "Downloadable immediately after payment";
/** One-line form for feature arrays. */
export const ESA_PLANNER_BENEFIT_LINE = `${ESA_PLANNER_BENEFIT_SHORT} — downloadable immediately after payment`;
/** Alternate wording for "included with" lists. */
export const ESA_PLANNER_INCLUDED_LINE = "Free Pet Care Planner by PawTenant — included at no additional cost with your ESA package";

export const PSD_PLANNER_BENEFIT_SHORT = "Free PSD Training Workbook by PawTenant";
export const PSD_PLANNER_BENEFIT_LINE = `${PSD_PLANNER_BENEFIT_SHORT} — downloadable immediately after payment`;
export const PSD_PLANNER_INCLUDED_LINE = "Free Psychiatric Service Dog Training Workbook — included at no additional cost with your PSD package";

/** The on-site preview sections (one per family; other cards link here). */
export const PLANNER_PREVIEW_ANCHOR_ID = "pet-care-planner";
export const PLANNER_PREVIEW_HREF = `/esa-letter-cost#${PLANNER_PREVIEW_ANCHOR_ID}`;
export const PSD_WORKBOOK_ANCHOR_ID = "psd-training-workbook";
export const PSD_WORKBOOK_PREVIEW_HREF = `/psd-letter-cost#${PSD_WORKBOOK_ANCHOR_ID}`;

/** The non-clinical disclaimer shown wherever the ESA planner is described. */
export const PLANNER_DISCLAIMER =
  "For personal organization only. This planner does not replace professional veterinary or medical advice.";
/** The scope disclaimer shown wherever the PSD workbook is described. */
export const PSD_WORKBOOK_DISCLAIMER =
  "An educational planning and recordkeeping resource. It does not certify a service dog, does not create legal rights, does not guarantee public access or airline acceptance, and does not replace professional training, veterinary care, medical advice, or legal advice.";

/** True since the PSD workbook asset was supplied and published (2026-09-11). */
export const PSD_PLANNER_PUBLISHED = true;

/** The benefit line for a service family, or null when that family has no
 *  published resource to promise. */
export function plannerBenefitFor(family: PlannerFamily): string | null {
  if (family === "esa") return ESA_PLANNER_BENEFIT_LINE;
  return PSD_PLANNER_PUBLISHED ? PSD_PLANNER_BENEFIT_LINE : null;
}

export interface PlannerPreviewImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  label: string;
}

export interface PlannerMarketingContent {
  family: PlannerFamily;
  anchorId: string;
  eyebrow: string;
  heading: string;
  /** Always names ELIGIBLE customers — never "every visitor". */
  intro: string;
  benefits: string[];
  disclaimer: string;
  /** Extra scope statements rendered as a short list (PSD only). */
  scopeNotes: string[];
  /** New-visitor CTA (the relevant assessment). */
  ctaLabel: string;
  ctaHref: string;
  /** Where the eligible signed-in customer finds it. */
  portalHint: string;
  previews: PlannerPreviewImage[];
}

export const PLANNER_MARKETING: Record<PlannerFamily, PlannerMarketingContent> = {
  esa: {
    family: "esa",
    anchorId: PLANNER_PREVIEW_ANCHOR_ID,
    eyebrow: "Included free with every ESA package",
    heading: "A practical planner for life with your pet",
    intro:
      "Eligible PawTenant customers receive a downloadable Pet Care Planner to organize routines, feeding, veterinary information, vaccinations, medications, grooming, training goals, expenses, emergency contacts, and important care notes.",
    benefits: [
      "Keep pet, veterinarian, and emergency details together",
      "Track food, treats, vaccinations, medications, and refills",
      "Organize daily routines, grooming, and training progress",
      "Prepare an emergency and backup-care plan",
      "Record expenses, appointments, notes, and observations",
    ],
    disclaimer: `${PLANNER_DISCLAIMER} It is an organizational resource — not a clinical document and not part of your provider's evaluation.`,
    scopeNotes: [],
    ctaLabel: "Start Your ESA Assessment",
    ctaHref: "/assessment",
    portalHint: "Already a customer? It's waiting in My Orders under Included Resources the moment your payment is confirmed.",
    previews: [
      {
        src: "/assets/planner/pet-care-planner-cover.jpg",
        alt: "Cover of the Pet Care Planner by PawTenant showing a golden retriever and a tabby cat",
        width: 720,
        height: 920,
        label: "Cover",
      },
      {
        src: "/assets/planner/pet-care-planner-daily-checklist.jpg",
        alt: "Daily care checklist page from the Pet Care Planner with food, water, medication, exercise and play items",
        width: 720,
        height: 923,
        label: "Daily care checklist",
      },
      {
        src: "/assets/planner/pet-care-planner-calendar.jpg",
        alt: "Monthly pet calendar page from the Pet Care Planner for vet visits, grooming, medication and vaccinations",
        width: 720,
        height: 857,
        label: "Monthly pet calendar",
      },
    ],
  },
  psd: {
    family: "psd",
    anchorId: PSD_WORKBOOK_ANCHOR_ID,
    eyebrow: "Included free with every PSD package",
    heading: "Plan and document your service-dog training",
    intro:
      "Eligible PSD customers receive a downloadable owner-trainer workbook for task-training plans, public-access sessions, training hours, milestones, handler preparation, emergency planning, veterinary information, and progress reviews.",
    benefits: [
      "Task-training framework, session logs, and a 120-hour public-access tracker",
      "Weekly training logs, milestone checklist, and monthly progress reviews",
      "Handler preparation and regulation logs",
      "Emergency and backup-care plan, veterinary and medication summary",
      "ADA, state-law, and air-travel quick-reference worksheets to fill in",
    ],
    disclaimer: PSD_WORKBOOK_DISCLAIMER,
    scopeNotes: [
      "An educational planning and recordkeeping resource",
      "Does not certify a service dog",
      "Does not create legal rights",
      "Does not guarantee public access or airline acceptance",
      "Does not replace professional training, veterinary care, medical advice, or legal advice",
    ],
    ctaLabel: "Start Your PSD Assessment",
    ctaHref: "/psd-assessment",
    portalHint: "Already a customer? It's waiting in My Orders under Included Resources the moment your payment is confirmed.",
    previews: [
      {
        src: "/assets/planner/psd-workbook-cover.jpg",
        alt: "Cover of the Psychiatric Service Dog Training Workbook by PawTenant, owner-trainer edition, with a golden retriever in a service dog vest",
        width: 720,
        height: 938,
        label: "Cover",
      },
      {
        src: "/assets/planner/psd-workbook-public-access.jpg",
        alt: "Public Access Foundations checklist page from the PSD Training Workbook",
        width: 720,
        height: 944,
        label: "Public access foundations",
      },
      {
        src: "/assets/planner/psd-workbook-milestones.jpg",
        alt: "Milestone Checklist page from the PSD Training Workbook with fourteen dated training checkpoints",
        width: 720,
        height: 944,
        label: "Milestone checklist",
      },
    ],
  },
};

/** The two supplied marketing images for the general Pet Care Planner
 *  (ESA / general pet-care surfaces ONLY — never presented as PSD workbook pages). */
export const PLANNER_HERO_IMAGES = {
  /** Landscape collage — tablet and desktop. */
  collage: {
    src: "/assets/planner/pet-care-planner-collage.jpg",
    alt: "Complete Pet Care Planner by PawTenant — a 33-page all-in-one planner: pet profile, daily care checklist, routine, training goals, vaccination record and emergency checklist pages",
    width: 1536,
    height: 1024,
  },
  /** Portrait cover — phones, where the collage's page text would be illegible. */
  cover: {
    src: "/assets/planner/pet-care-planner-cover-page.jpg",
    alt: "Pet Care Planner by PawTenant cover — plan, track, care, love — with a golden retriever and a tabby cat",
    width: 1024,
    height: 1536,
  },
} as const;
