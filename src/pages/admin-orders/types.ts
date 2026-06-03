/**
 * Canonical admin-orders shared types.
 *
 * Extracted to break up the duplicate-Order / DoctorProfile / DoctorRow /
 * PendingApplication type mismatches that crept in as each component
 * declared its own slightly different local interface. Every field on
 * `Order` and `DoctorProfile` is the structural UNION of all observed
 * local shapes — meaning a row that satisfies any local interface also
 * satisfies the canonical one. Fields that may legitimately be absent
 * on certain code paths are kept optional + nullable.
 *
 * NOT consumed by the frozen mega-files
 * (OrderDetailModal.tsx, AnalyticsTab.tsx) per CLAUDE.md MERGE-FREEZE.
 * Those keep their own local Order. Call sites that cross into those
 * files cast at the boundary with `as unknown as Order`.
 */

// ── Attribution snapshot stored in orders.first_touch_json / last_touch_json
export interface AttributionSnapshot {
  channel?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  ref?: string | null;
  referrer?: string | null;
  landing_url?: string | null;
}

export interface OrderDocument {
  id: string;
  order_id: string;
  label: string;
  doc_type: string;
  file_url: string;
  uploaded_at: string;
  sent_to_customer: boolean;
  customer_visible: boolean;
}

export type EmailLogEntry = { type: string; sentAt: string; to: string; success: boolean };

// ── Canonical Order — superset of every local Order in admin-orders/
export interface Order {
  // Core columns present on every SELECT path
  id: string;
  confirmation_id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  state: string | null;
  plan_type: string | null;
  delivery_speed: string | null;
  selected_provider: string | null;
  price: number | null;
  payment_intent_id: string | null;
  payment_method: string | null;
  status: string;
  doctor_status: string | null;
  doctor_user_id: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  letter_url: string | null;
  signed_letter_url: string | null;
  patient_notification_sent_at: string | null;
  assessment_answers: Record<string, unknown> | null;
  created_at: string;
  ghl_synced_at: string | null;
  ghl_sync_error: string | null;
  last_contacted_at: string | null;
  referred_by: string | null;
  // Optional + nullable — present on some rows / SELECTs only
  ghl_contact_id?: string | null;
  email_log?: EmailLogEntry[] | null;
  sent_followup_at?: string | null;
  addon_services?: string[] | null;
  refunded_at?: string | null;
  refund_amount?: number | null;
  dispute_id?: string | null;
  dispute_status?: string | null;
  dispute_reason?: string | null;
  dispute_created_at?: string | null;
  fraud_warning?: boolean | null;
  fraud_warning_at?: string | null;
  subscription_status?: string | null;
  letter_type?: string | null;
  payment_failure_reason?: string | null;
  payment_failed_at?: string | null;
  seq_30min_sent_at?: string | null;
  seq_24h_sent_at?: string | null;
  seq_3day_sent_at?: string | null;
  followup_opt_out?: boolean | null;
  seq_opted_out_at?: string | null;
  broadcast_opt_out?: boolean | null;
  last_broadcast_sent_at?: string | null;
  source_system?: string | null;
  historical_import?: boolean | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  paid_at?: string | null;
  coupon_code?: string | null;
  coupon_discount?: number | null;
  first_touch_json?: AttributionSnapshot | null;
  last_touch_json?: AttributionSnapshot | null;
  // Customer-portal-only fields — read by CustomerPortalPreview + my-orders
  additional_documents_requested?: { types?: string[]; otherDescription?: string } | null;
  user_id?: string | null;
  documents?: OrderDocument[];
}

export type AvailabilityStatus = "active" | "at_capacity" | "inactive";

// ── Canonical DoctorProfile — superset of all admin-orders local shapes
export interface DoctorProfile {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  licensed_states: string[] | null;
  role: string | null;
  // Optional — some SELECTs / synthetic fallback profiles omit these
  custom_tab_access?: string[] | null;
  state_license_numbers?: Record<string, string> | null;
  npi_number?: string | null;
  license_number?: string | null;
  bio?: string | null;
  availability_status?: AvailabilityStatus | null;
  per_order_rate?: number | null;
  created_at?: string;
  photo_url?: string;
  lifecycle_status?: string | null;
  is_published?: boolean | null;
  // Provider account-readiness (portal access) — see migration
  // 20260605120000_provider_assignment_readiness.sql
  portal_first_accessed_at?: string | null;
  portal_last_accessed_at?: string | null;
  account_setup_completed_at?: string | null;
}

export interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  licensed_states: string[] | null;
  is_active: boolean | null;
  // Optional fields used by some DoctorsTab / ProviderDrawer flows
  state_license_numbers?: Record<string, string> | null;
  notes?: string | null;
  availability_status?: AvailabilityStatus | null;
  per_order_rate?: number | null;
  photo_url?: string;
  // Provider account-readiness. `assignment_ready` is computed in the
  // assignableProviders memo: legacy doctor_contacts (no portal account) are
  // always ready; doctor_profiles providers are ready only once they have
  // accessed the provider portal (portal_first_accessed_at != null).
  user_id?: string | null;
  portal_first_accessed_at?: string | null;
  assignment_ready?: boolean;
}

export interface WorkloadStats { active: number; completed: number; }

export interface DoctorRow {
  profile: DoctorProfile | null;
  contact: DoctorContact | null;
  email: string;
  name: string;
  workload: WorkloadStats;
}

// ── Application license row (OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2)
export interface ApplicationLicenseRow {
  state_code: string;
  credential: string;
  license_number: string;
}

// ── Canonical PendingApplication / ProviderApplication
export interface PendingApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  license_types: string | null;
  license_number: string | null;
  license_state: string | null;
  additional_states: string | null;
  years_experience: string | null;
  practice_name: string | null;
  practice_type: string | null;
  specializations: string | null;
  monthly_capacity: string | null;
  esa_experience: string | null;
  telehealth_ready: string | null;
  profile_url: string | null;
  bio: string | null;
  headshot_url: string | null;
  documents_urls: string[] | null;
  status: string;
  created_at: string;
  // Fields surfaced by ProviderApplicationModal (V2). Optional + nullable so
  // legacy rows that predate the V2 migration still satisfy the type.
  npi?: string | null;
  licenses?: ApplicationLicenseRow[] | null;
}
