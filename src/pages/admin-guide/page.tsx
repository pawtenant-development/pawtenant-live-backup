import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

interface Section {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

export default function AdminGuidePage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("overview");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/doctor-login"); return; }
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select("is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof || !(prof as { is_admin: boolean }).is_admin) {
        navigate("/doctor-dashboard");
        return;
      }
      setVerified(true);
      setLoading(false);
    };
    check();
  }, [navigate]);

  const sections: Section[] = [
    {
      id: "overview",
      title: "Overview & Daily Checklist",
      icon: "ri-dashboard-line",
      content: (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">Daily Operations Checklist</h3>
            <div className="space-y-2">
              {[
                { task: "Check unassigned orders in Admin Portal → Orders tab", priority: "high" },
                { task: "Verify auto-assignment ran (no orders stuck &gt;2 hours unassigned)", priority: "high" },
                { task: "Review any orders in \'Pending Review\' status for more than 24 hours", priority: "med" },
                { task: "Check GHL for new doctor application submissions from the Join Our Network form", priority: "med" },
                { task: "Monitor for failed payment webhooks in Stripe dashboard", priority: "med" },
                { task: "Confirm at least one doctor is licensed per active state", priority: "low" },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${item.priority === "high" ? "bg-red-50 border-red-100" : item.priority === "med" ? "bg-amber-50 border-amber-100" : "bg-gray-50 border-gray-100"}`}>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5 border-2 ${item.priority === "high" ? "border-red-400" : item.priority === "med" ? "border-amber-400" : "border-gray-300"}`}></div>
                  <p className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: item.task }}></p>
                  <span className={`ml-auto flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${item.priority === "high" ? "bg-red-100 text-red-600" : item.priority === "med" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"}`}>
                    {item.priority === "high" ? "Critical" : item.priority === "med" ? "Daily" : "Weekly"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#f0faf7] rounded-xl p-5 border border-[#b8ddd5]">
            <p className="text-sm font-bold text-[#1a5c4f] mb-2">System Architecture Summary</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
              <div className="bg-white rounded-lg p-3 border border-[#b8ddd5]">
                <p className="font-bold text-gray-800 mb-1">GoHighLevel (GHL)</p>
                <p>Staff CRM, patient communication, email/SMS automation, doctor application intake, marketing workflows</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-[#b8ddd5]">
                <p className="font-bold text-gray-800 mb-1">Portal (this site)</p>
                <p>Doctor portal login, case management, order assignments, admin account management, secure document access</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "create-doctor",
      title: "Creating Doctor Accounts",
      icon: "ri-user-add-line",
      content: (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-1">Important Policy</p>
            <p className="text-sm text-amber-700">Doctors do NOT self-register. Admin creates all portal accounts. The public &quot;Join Our Network&quot; page is an application-only form — it does not create a login.</p>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">Step-by-Step: Creating a New Provider Account</h3>
            <div className="space-y-3">
              {[
                { num: 1, title: "Review the application in GHL", desc: "Doctor submits via /join-our-network. Review their credentials and approve in GHL. Note their email address." },
                { num: 2, title: "Go to Admin Portal → Providers tab", desc: "Navigate to /admin-orders and click the Providers tab in the top right." },
                { num: 3, title: "Click \"Create Account\"", desc: "Fill in Full Name, Title (e.g. PhD, LCSW), Phone, Email, and set a temporary password (min 8 characters). You can also grant Admin access here." },
                { num: 4, title: "Set Licensed States", desc: "Click Next to go to the Licensed States step. Select every state this doctor is licensed to practice in. This controls auto-assignment routing." },
                { num: 5, title: "Submit — the system does the rest", desc: "The portal creates their Supabase auth account AND updates the routing contacts list automatically. A GHL notification is triggered (set up the \'doctor_account_created\' workflow in GHL)." },
                { num: 6, title: "Deliver credentials securely", desc: "Send the email and temp password via a secure channel (NOT email). Options: encrypted DM, Signal, LastPass share, or a one-time-secret link." },
                { num: 7, title: "Doctor logs in at /doctor-login", desc: "They should change their password immediately from their profile page (/doctor-profile)." },
              ].map(step => (
                <div key={step.num} className="flex items-start gap-4 px-4 py-4 bg-white rounded-xl border border-gray-200">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f] text-white rounded-full text-sm font-extrabold flex-shrink-0">{step.num}</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{step.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "assign-orders",
      title: "Assigning Orders",
      icon: "ri-file-transfer-line",
      content: (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">Manual Assignment (Recommended for urgent/VIP cases)</h3>
            <div className="space-y-3">
              {[
                { step: "1", title: "Open Admin Portal → Orders tab", desc: "You&apos;ll see all orders with current assignment status. Orange badge = unassigned count." },
                { step: "2", title: "Find the order", desc: "Use the search bar (by name, email, order ID, or state) or filter by status." },
                { step: "3", title: "Use the \'Assign Doctor\' dropdown", desc: "Select a doctor from the dropdown. The system immediately calls the assign-doctor API, updates the order, sends a GHL notification (for email/SMS), and drops an in-portal notification for the doctor." },
                { step: "4", title: "Confirm \'Assigned & notified\' appears", desc: "Green confirmation text appears within a few seconds. If it shows an error, check that the doctor email exists in the routing contacts list." },
              ].map(step => (
                <div key={step.step} className="flex items-start gap-4 px-4 py-4 bg-white rounded-xl border border-gray-200">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f] text-white rounded-full text-sm font-extrabold flex-shrink-0">{step.step}</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{step.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: step.desc }}></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-900 mb-2">Auto-Assignment (runs every 15 minutes)</p>
            <p className="text-xs text-gray-500 mb-3">If an order is paid but unassigned for more than 1 hour, the system automatically picks the doctor licensed in that state with the fewest active cases.</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 font-mono text-xs">
              <p className="text-emerald-600">POST {supabaseUrl}/functions/v1/assign-doctor</p>
              <p className="text-gray-400 mt-1">{"{ \"confirmationId\": \"PT-XXXXX\", \"doctorEmail\": \"dr@example.com\" }"}</p>
            </div>
            <p className="text-xs text-gray-400 mt-2">GHL can also call this webhook directly to trigger assignment from a workflow.</p>
          </div>
        </div>
      ),
    },
    {
      id: "activate-deactivate",
      title: "Doctor Activation & Deactivation",
      icon: "ri-toggle-line",
      content: (
        <div className="space-y-5">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs font-bold text-red-700 mb-1">Security note</p>
            <p className="text-sm text-red-600">Deactivating a doctor prevents portal login immediately. Any active cases remain in the system but must be reassigned. Deactivation does NOT delete data.</p>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">How to Deactivate a Provider</h3>
            <div className="space-y-3">
              {[
                "Go to Admin Portal → Providers tab",
                "Find the doctor in the Portal Accounts section",
                "Click the green toggle next to their name — it turns gray (Inactive)",
                "The doctor will be redirected to /doctor-login if they try to access the portal",
                "Reassign their open cases to another doctor using the Orders tab",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
                  <div className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs font-extrabold text-gray-600 flex-shrink-0">{i + 1}</div>
                  <p className="text-sm text-gray-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-900 mb-2">Re-activating a Doctor</p>
            <p className="text-xs text-gray-500">Same process — click the gray toggle to turn it green. The doctor can log in again immediately.</p>
          </div>
        </div>
      ),
    },
    {
      id: "notifications",
      title: "Notifications & Alerts",
      icon: "ri-notification-3-line",
      content: (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "In-Portal Notification", icon: "ri-notification-3-line", color: "bg-[#f0faf7] border-[#b8ddd5]", textColor: "text-[#1a5c4f]", desc: "Automatically created when a case is assigned to a doctor with a portal account. Doctor sees a bell badge on their dashboard. Clicking opens the notification panel and marks it as read." },
              { title: "Email (via GHL)", icon: "ri-mail-send-line", color: "bg-sky-50 border-sky-200", textColor: "text-sky-700", desc: "GHL receives a \'doctor_assigned\' event webhook every time a case is assigned. Set up a GHL Email workflow on this event to send the doctor a case notification email." },
              { title: "SMS (via GHL)", icon: "ri-message-3-line", color: "bg-amber-50 border-amber-200", textColor: "text-amber-700", desc: "Same GHL \'doctor_assigned\' event. Add an SMS step to the same workflow. The doctor phone number is passed in the webhook payload as the \'phone\' field." },
            ].map(n => (
              <div key={n.title} className={`rounded-xl p-4 border ${n.color}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 flex items-center justify-center">
                    <i className={`${n.icon} ${n.textColor} text-base`}></i>
                  </div>
                  <p className={`text-sm font-bold ${n.textColor}`}>{n.title}</p>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{n.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-900 mb-3">GHL Setup: Doctor Case Notification Workflow</p>
            <div className="space-y-2">
              {[
                { step: "1", text: "In GHL → Automations → New Workflow" },
                { step: "2", text: "Trigger: \'Inbound Webhook\' — use your GHL webhook URL from the ghl-webhook-proxy edge function" },
                { step: "3", text: "Filter on event = \'doctor_assigned\'" },
                { step: "4", text: "Action: Send Email → use {{doctorName}}, {{confirmationId}}, {{patientName}}, {{patientState}} as merge fields" },
                { step: "5", text: "Action: Send SMS → same fields. Phone number is in {{contact.phone}}" },
                { step: "6", text: "Test by assigning an order in the portal and confirming GHL fires" },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full text-xs font-extrabold text-gray-600 flex-shrink-0">{s.step}</span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "payments",
      title: "Payments & Refunds",
      icon: "ri-bank-card-line",
      content: (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-900 mb-3">Where to Manage Payments</p>
            <p className="text-xs text-gray-500 mb-4">All payments are processed by Stripe. This portal does not handle payments directly — go to the Stripe Dashboard for everything financial.</p>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 bg-[#635bff] text-white text-sm font-bold rounded-xl hover:bg-[#5b52f0] cursor-pointer"
            >
              <i className="ri-external-link-line"></i>
              Open Stripe Dashboard
            </a>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">Issuing a Refund (via Admin Portal)</h3>
            <div className="space-y-3">
              {[
                { step: "1", text: "Admin Portal → Payments tab → find the charge" },
                { step: "2", text: "Click the orange \'Refund\' button next to the charge" },
                { step: "3", text: "Choose Full or Partial refund, enter reason and optional internal note" },
                { step: "4", text: "Click \'Issue Refund\' — Stripe processes it immediately" },
                { step: "5", text: "✅ The portal automatically fires a GHL refund notification webhook — no extra steps needed" },
                { step: "6", text: "Confirmation shows \'Customer notification sent to GHL\' — GHL handles the email/SMS" },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
                  <div className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-xs font-extrabold text-gray-600 flex-shrink-0">{s.step}</div>
                  <p className="text-sm text-gray-700">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 mb-1">No-Risk Guarantee Policy</p>
            <p className="text-sm text-amber-700">PawTenant offers a no-risk guarantee. If a refund is requested within the policy window, process it in Stripe without escalation. Check the /no-risk-guarantee page for current policy terms.</p>
          </div>
        </div>
      ),
    },
    {
      id: "ghl-refund-workflow",
      title: "GHL Refund Email Workflow",
      icon: "ri-refund-2-line",
      content: (
        <div className="space-y-5">
          <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
            <div className="flex items-start gap-3">
              <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base mt-0.5 flex-shrink-0"></i>
              <div>
                <p className="text-sm font-bold text-[#1a5c4f] mb-1">Automatic Trigger — No Code Needed</p>
                <p className="text-xs text-[#2d7a6a] leading-relaxed">
                  Every time a refund is issued via the Admin Portal, the system <strong>automatically</strong> fires a webhook to GHL with{" "}
                  <code className="bg-[#d4ede8] px-1 py-0.5 rounded text-xs">event: &quot;refund_issued&quot;</code>.
                  You just need to set up the GHL workflow once to handle it.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-base font-extrabold text-gray-900 mb-3">Step-by-Step: Create the GHL Refund Email Workflow</h3>
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Open GHL → Automation → New Workflow",
                  desc: "Go to your PawTenant GHL sub-account. Click Automation in the left sidebar, then click + New Workflow.",
                  badge: null,
                },
                {
                  step: "2",
                  title: "Set Trigger: Inbound Webhook",
                  desc: "Click + Add Trigger → choose \"Inbound Webhook\". GHL will generate a trigger URL — copy it. (Alternatively, use your existing main webhook URL if you route on event type.)",
                  badge: null,
                },
                {
                  step: "3",
                  title: "Add a Filter on the Event Field",
                  desc: "In the trigger settings, add a filter: Field = event, Operator = equals, Value = refund_issued. This ensures only refund webhooks trigger this workflow, not all webhooks.",
                  badge: "Critical",
                },
                {
                  step: "4",
                  title: "Add Action: Send Email",
                  desc: "Click + Add Action → Send Email. Write a refund confirmation email. Use the merge fields below to personalize it.",
                  badge: null,
                },
                {
                  step: "5",
                  title: "Optional: Add Action: Send SMS",
                  desc: "Add a second action for SMS if you want a text confirmation. The phone number is available in the contact record from previous syncs.",
                  badge: null,
                },
                {
                  step: "6",
                  title: "Publish the workflow",
                  desc: "Click Publish (top right). Test by issuing a small refund on a test order in the portal and verifying the workflow fires in GHL execution history.",
                  badge: null,
                },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-4 px-4 py-4 bg-white rounded-xl border border-gray-200">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#1a5c4f] text-white rounded-full text-sm font-extrabold flex-shrink-0">{s.step}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{s.title}</p>
                      {s.badge && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">{s.badge}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook payload reference */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Webhook Payload — Available Merge Fields</p>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { field: "{{email}}", desc: "Customer email address" },
                  { field: "{{firstName}}", desc: "Customer first name" },
                  { field: "{{lastName}}", desc: "Customer last name" },
                  { field: "{{fullName}}", desc: "Full name (first + last)" },
                  { field: "{{confirmationId}}", desc: "Order ID (e.g. PT-12345)" },
                  { field: "{{refundAmountFormatted}}", desc: "Refund amount (e.g. $129.00)" },
                  { field: "{{refundReason}}", desc: "Reason (Customer Request, etc.)" },
                  { field: "{{refundIssuedAt}}", desc: "Date refund was issued" },
                  { field: "{{orderTotal}}", desc: "Original order total ($)" },
                  { field: "{{planType}}", desc: "ESA plan purchased" },
                  { field: "{{patientState}}", desc: "Customer state abbreviation" },
                  { field: "{{refundNote}}", desc: "Internal note (if any was added)" },
                ].map((f) => (
                  <div key={f.field} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <code className="text-xs font-mono font-bold text-[#1a5c4f] bg-[#f0faf7] px-1.5 py-0.5 rounded min-w-[170px]">{f.field}</code>
                    <span className="text-xs text-gray-500">{f.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Email template example */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Sample Email Template</p>
            </div>
            <div className="px-5 py-4 font-mono text-xs text-gray-700 space-y-2 leading-relaxed bg-gray-50">
              <p className="font-bold text-gray-800">Subject: Your PawTenant Refund of {"{{refundAmountFormatted}}"} Has Been Processed</p>
              <p className="mt-3">Hi {"{{firstName}}"},</p>
              <p className="mt-2">We've processed your refund of <strong>{"{{refundAmountFormatted}}"}</strong> for order <strong>{"{{confirmationId}}"}</strong>.</p>
              <p>Reason: {"{{refundReason}}"}</p>
              <p className="mt-2">Refunds typically appear on your statement within <strong>5–10 business days</strong>, depending on your bank or card issuer.</p>
              <p className="mt-2">If you have any questions, reply to this email or contact our support team.</p>
              <p className="mt-3">The PawTenant Team</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
              <div>
                <p className="text-xs font-bold text-amber-800 mb-0.5">Using the Existing Main Webhook vs. a New Trigger URL</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  The refund event fires to the same <strong>main webhook URL</strong> as all other events. You can either:
                  (A) Create a new inbound webhook trigger in GHL specifically for refunds, or
                  (B) Add a branch/filter to your existing main workflow that routes on <code className="bg-amber-100 px-1 rounded">event = refund_issued</code>.
                  Option B is cleaner if you manage all PawTenant events in one workflow.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "ghl-boundary",
      title: "GHL vs. Portal: What Lives Where",
      icon: "ri-git-branch-line",
      content: (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">This table clarifies what to do in GHL vs. the secure portal. When in doubt: if it involves auth/data/documents → use the portal. If it involves messaging/CRM/marketing → use GHL.</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <div className="px-4 py-3">Task</div>
              <div className="px-4 py-3 border-l border-gray-100">Do in GHL</div>
              <div className="px-4 py-3 border-l border-gray-100">Do in Portal</div>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { task: "Create a doctor login account", ghl: "—", portal: "Admin Portal → Providers → Create Account" },
                { task: "Activate/deactivate a doctor", ghl: "—", portal: "Admin Portal → Providers → toggle" },
                { task: "Assign a case to a doctor", ghl: "Via assign-doctor webhook OR", portal: "Admin Portal → Orders → dropdown" },
                { task: "Send doctor email when assigned", ghl: "doctor_assigned workflow", portal: "Auto in-portal notification" },
                { task: "Send doctor SMS when assigned", ghl: "doctor_assigned workflow (SMS step)", portal: "— (SMS is GHL only)" },
                { task: "Patient intake form", ghl: "— (or GHL form)", portal: "Assessment page (/apply-page)" },
                { task: "Patient email communication", ghl: "Automation workflows", portal: "— (portal not for patient comms)" },
                { task: "Doctor application intake", ghl: "Join Our Network form → GHL CRM", portal: "— (application only, no account)" },
                { task: "Marketing campaigns", ghl: "All marketing lives here", portal: "—" },
                { task: "View ESA letter PDFs", ghl: "—", portal: "Admin Orders → Docs column" },
                { task: "Process refunds", ghl: "— (trigger refund notification)", portal: "Stripe Dashboard (not portal)" },
                { task: "Check doctor earnings", ghl: "Track in GHL CRM", portal: "— (not yet implemented)" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-3 text-xs">
                  <div className="px-4 py-3 font-medium text-gray-800">{row.task}</div>
                  <div className="px-4 py-3 border-l border-gray-100 text-gray-600">{row.ghl}</div>
                  <div className="px-4 py-3 border-l border-gray-100 text-gray-600">{row.portal}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      icon: "ri-tools-line",
      content: (
        <div className="space-y-4">
          {[
            {
              q: "Doctor says they can&apos;t log in",
              a: "1) Check they&apos;re using /doctor-login (not the customer login). 2) Check their account is Active in Providers tab. 3) Have them try password reset — go to /doctor-login and click forgot password. 4) If account was deactivated, re-activate in the portal.",
            },
            {
              q: "Order is stuck unassigned",
              a: "1) Check if any doctor is licensed in that state (Providers tab → State Coverage). 2) If no coverage: add a doctor to that state. 3) Manually assign via Admin Orders. 4) Auto-assign runs every 15 min — it won&apos;t fire if no licensed doctor exists.",
            },
            {
              q: "Doctor is not receiving email/SMS on assignment",
              a: "1) Check GHL has the \'doctor_assigned\' workflow active. 2) Verify the doctor&apos;s phone number is in their routing contact record (Providers tab). 3) Check GHL execution history for that contact. 4) The in-portal notification still fires even if GHL fails.",
            },
            {
              q: "Case was assigned to wrong doctor",
              a: "Use the Assign Doctor dropdown in Orders tab to reassign. This fires all notifications again for the new doctor.",
            },
            {
              q: "\"Admin access required\" error when creating a doctor",
              a: "Your account must have is_admin = true in doctor_profiles. Contact your Supabase admin to set this. Only existing admins can create new admins.",
            },
            {
              q: "Auto-assignment not firing",
              a: "Auto-assignment requires a pg_cron job in Supabase (every 15 minutes). Verify the cron job is active in Supabase → Database → Extensions → pg_cron. The job should call the assigned_doctor_auto function.",
            },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-900 mb-2" dangerouslySetInnerHTML={{ __html: item.q }}></p>
              <p className="text-xs text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: item.a }}></p>
            </div>
          ))}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  if (!verified) return null;

  const currentSection = sections.find(s => s.id === activeSection) ?? sections[0];

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/admin-orders" className="whitespace-nowrap flex items-center gap-1.5 text-sm font-semibold text-[#1a5c4f] hover:underline cursor-pointer">
            <i className="ri-arrow-left-line"></i> Back to Admin Portal
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-1">Internal Document</p>
          <h1 className="text-2xl font-extrabold text-gray-900">PawTenant Admin Operations Runbook</h1>
          <p className="text-sm text-gray-500 mt-1">Practical guide for PawTenant staff managing day-to-day portal operations.</p>
        </div>

        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Sidebar */}
          <div className="lg:w-56 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-24">
              <div className="px-3 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Sections</p>
              </div>
              <nav className="p-2 space-y-0.5">
                {sections.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`whitespace-nowrap w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer text-sm ${
                      activeSection === section.id
                        ? "bg-[#1a5c4f] text-white font-bold"
                        : "text-gray-600 hover:bg-gray-50 font-medium"
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <i className={`${section.icon} text-sm`}></i>
                    </div>
                    <span className="truncate">{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
                  <i className={`${currentSection.icon} text-[#1a5c4f] text-lg`}></i>
                </div>
                <h2 className="text-lg font-extrabold text-gray-900">{currentSection.title}</h2>
              </div>
              {currentSection.content}
            </div>

            {/* Last updated */}
            <p className="text-xs text-gray-400 text-center mt-4">
              Runbook last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · For questions contact your portal admin
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
