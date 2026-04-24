import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import DoctorsTab from "../admin-orders/components/DoctorsTab";
import CreateDoctorModal from "../admin-orders/components/CreateDoctorModal";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function AdminDoctorsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("Admin");
  const [showCreate, setShowCreate] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const auth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin-login"); return; }

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/check-admin-status`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const check = await res.json() as { ok: boolean; is_admin: boolean; full_name?: string };
        if (!check.ok || !check.is_admin) { navigate("/admin-login"); return; }
        setAdminName(check.full_name ?? "Admin");
      } catch {
        navigate("/admin-login");
        return;
      }

      setLoading(false);
    };
    auth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/" className="cursor-pointer">
            <img
              src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
              alt="PawTenant"
              className="h-10 w-auto object-contain"
            />
          </Link>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <i className="ri-arrow-right-s-line"></i>
            <Link to="/admin-orders" className="text-gray-500 hover:text-[#1a5c4f] transition-colors cursor-pointer font-medium">
              Admin Dashboard
            </Link>
            <i className="ri-arrow-right-s-line"></i>
            <span className="text-gray-700 font-semibold">Provider Management</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:block text-sm text-gray-600 font-semibold">{adminName}</span>
          <Link
            to="/admin-orders"
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-[#1a5c4f] hover:border-[#1a5c4f] transition-colors cursor-pointer font-semibold"
          >
            <i className="ri-arrow-left-line text-xs"></i>
            Back to Dashboard
          </Link>
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); navigate("/admin-login"); }}
            className="whitespace-nowrap flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
          >
            <i className="ri-logout-box-line"></i>
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-1">Provider Management</p>
            <h1 className="text-2xl font-extrabold text-gray-900">Provider Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Create accounts, assign licensed states, and manage provider availability.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors"
          >
            <i className="ri-user-add-line"></i>
            Add New Provider
          </button>
        </div>

        {/* Quick Guide */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[
            {
              icon: "ri-user-add-line",
              title: "Create Provider Account",
              desc: "Click \"Add Provider\" to create a new provider account. They'll receive login credentials by email.",
              color: "bg-[#f0faf7] border-[#c3e8df]",
              textColor: "text-[#1a5c4f]",
            },
            {
              icon: "ri-map-pin-line",
              title: "Assign Licensed States",
              desc: "Expand any provider row and click \"Edit\" next to Licensed States to configure which states they can accept cases from.",
              color: "bg-sky-50 border-sky-200",
              textColor: "text-sky-700",
            },
            {
              icon: "ri-toggle-line",
              title: "Activate / Deactivate",
              desc: "Use the toggle switch on each provider row to instantly activate or deactivate their ability to receive new case assignments.",
              color: "bg-amber-50 border-amber-200",
              textColor: "text-amber-700",
            },
          ].map((card) => (
            <div key={card.title} className={`rounded-xl border p-4 ${card.color}`}>
              <div className={`flex items-center gap-2 mb-2 ${card.textColor}`}>
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${card.icon} text-base`}></i>
                </div>
                <p className="text-xs font-bold uppercase tracking-wider">{card.title}</p>
              </div>
              <p className={`text-xs leading-relaxed ${card.textColor} opacity-80`}>{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Success toast */}
        {createMsg && (
          <div className="mb-5 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-center gap-3">
            <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base flex-shrink-0"></i>
            <p className="text-sm text-[#1a5c4f] font-semibold">{createMsg}</p>
          </div>
        )}

        {/* Provider Management Table */}
        <DoctorsTab
          key={refreshKey}
          onProviderAdded={() => {
            setRefreshKey((k) => k + 1);
          }}
        />

        {/* Email notification info panel */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 flex items-center justify-center bg-[#f0faf7] rounded-xl flex-shrink-0">
              <i className="ri-mail-send-line text-[#1a5c4f] text-lg"></i>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 mb-1">Automatic Email Notifications</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                When a case is assigned to a provider (manually from the admin dashboard or automatically after checkout),
                they receive an instant email from <strong>hello@pawtenant.com</strong> with the patient&apos;s details,
                order ID, and a link to view the case in their portal.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "New case assignment email",
                  "Patient name + state included",
                  "Order confirmation ID included",
                  "Portal access link",
                ].map((point) => (
                  <span key={point} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#e8f5f1] text-[#1a5c4f] rounded-full text-xs font-semibold">
                    <i className="ri-checkbox-circle-fill text-xs"></i>
                    {point}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateDoctorModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            setCreateMsg(`${result.full_name} (${result.email}) — provider created and invite sent.`);
            setTimeout(() => setCreateMsg(""), 7000);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
