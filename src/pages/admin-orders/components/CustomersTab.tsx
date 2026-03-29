import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CustomerDetailModal from "./CustomerDetailModal";

interface Order {
  id: string;
  confirmation_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  state: string | null;
  plan_type: string | null;
  price: number | null;
  status: string;
  doctor_status: string | null;
  payment_intent_id: string | null;
  created_at: string;
}

interface CustomerSummary {
  email: string;
  full_name: string;
  phone: string | null;
  state: string | null;
  orders: Order[];
  total_spent: number;
  last_order_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  processing: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
  "under-review": "bg-sky-100 text-sky-700",
};

export default function CustomersTab() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ email: string; fullName: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, confirmation_id, email, first_name, last_name, phone, state, plan_type, price, status, doctor_status, payment_intent_id, created_at")
        .order("created_at", { ascending: false });

      if (!data) { setLoading(false); return; }

      // Group by email — only count price when payment_intent_id confirms actual payment
      const map = new Map<string, CustomerSummary>();
      (data as Order[]).forEach((order) => {
        const key = order.email.toLowerCase();
        const existing = map.get(key);
        const fullName = [order.first_name, order.last_name].filter(Boolean).join(" ") || order.email.split("@")[0];
        // Only credit money if the order was actually paid
        const paidAmount = order.payment_intent_id ? (order.price ?? 0) : 0;
        if (!existing) {
          map.set(key, {
            email: order.email,
            full_name: fullName,
            phone: order.phone,
            state: order.state,
            orders: [order],
            total_spent: paidAmount,
            last_order_at: order.created_at,
          });
        } else {
          existing.orders.push(order);
          existing.total_spent += paidAmount;
          if (order.created_at > existing.last_order_at) {
            existing.last_order_at = order.created_at;
            if (!existing.phone && order.phone) existing.phone = order.phone;
            if (!existing.state && order.state) existing.state = order.state;
            if (existing.full_name === existing.email.split("@")[0] && fullName !== order.email.split("@")[0]) {
              existing.full_name = fullName;
            }
          }
        }
      });

      // Only show customers who have at least one paid order — unpaid leads belong in the Orders tab
      const sorted = Array.from(map.values())
        .filter((c) => c.orders.some((o) => !!o.payment_intent_id))
        .sort((a, b) => new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime());
      setCustomers(sorted);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.email.toLowerCase().includes(q) ||
      c.full_name.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.state ?? "").toLowerCase().includes(q)
    );
  });

  const handleExportCSV = () => {
    setExporting(true);
    try {
      const escapeCell = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;

      const headers = [
        "Full Name", "Email", "Phone", "State",
        "Total Orders", "Total Spent ($)", "Last Order Date",
        "Latest Order Status", "Plan Type", "Stripe Payment IDs"
      ];

      const rows = filtered.map((c) => {
        const latestOrder = c.orders.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        const stripeIds = c.orders
          .map((o) => o.payment_intent_id)
          .filter(Boolean)
          .join("; ");

        return [
          c.full_name,
          c.email,
          c.phone ?? "",
          c.state ?? "",
          String(c.orders.length),
          c.total_spent.toFixed(2),
          new Date(c.last_order_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          latestOrder?.status ?? "",
          latestOrder?.plan_type ?? "",
          stripeIds,
        ].map(escapeCell).join(",");
      });

      const csvContent = [headers.map(escapeCell).join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const date = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `pawtenant-customers-${date}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const totalRevenue = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const multiOrderCustomers = customers.filter((c) => c.orders.length > 1).length;

  return (
    <div>
      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Customers", value: customers.length, icon: "ri-group-line", color: "text-gray-700" },
            { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: "ri-money-dollar-circle-line", color: "text-emerald-600" },
            { label: "Repeat Customers", value: multiOrderCustomers, icon: "ri-repeat-line", color: "text-sky-600" },
            { label: "Avg. Order Value", value: customers.length > 0 ? `$${Math.round(totalRevenue / customers.reduce((s, c) => s + c.orders.length, 0))}` : "$0", icon: "ri-bar-chart-line", color: "text-orange-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${s.icon} ${s.color} text-base`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + Export */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, or state..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
          {filtered.length} of {customers.length}
        </span>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={exporting || filtered.length === 0}
          title="Export visible customers to CSV"
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors flex-shrink-0"
        >
          {exporting
            ? <><i className="ri-loader-4-line animate-spin text-sm"></i>Exporting...</>
            : <><i className="ri-download-2-line text-sm"></i>Export CSV</>
          }
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
            <i className="ri-user-search-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700">No customers found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Customer</span>
            <span>Phone</span>
            <span>State</span>
            <span>Last Order</span>
            <span className="text-right">Orders</span>
            <span className="text-right">Spent</span>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((customer) => {
              const initials = customer.full_name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <button
                  key={customer.email}
                  type="button"
                  onClick={() => setSelectedCustomer({ email: customer.email, fullName: customer.full_name })}
                  className="w-full grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_80px_80px] gap-3 md:gap-4 px-5 py-4 items-center hover:bg-gray-50/60 transition-colors cursor-pointer text-left"
                >
                  {/* Customer */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 flex items-center justify-center bg-[#f0faf7] rounded-full flex-shrink-0 text-[#1a5c4f] text-sm font-extrabold">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{customer.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{customer.email}</p>
                    </div>
                    {customer.orders.length > 1 && (
                      <span className="hidden md:inline-flex items-center px-1.5 py-0.5 bg-sky-50 text-sky-600 rounded text-xs font-bold">
                        Repeat
                      </span>
                    )}
                  </div>
                  {/* Phone */}
                  <div className="hidden md:block text-sm text-gray-600">{customer.phone ?? <span className="text-gray-300">—</span>}</div>
                  {/* State */}
                  <div className="hidden md:block text-sm font-semibold text-gray-700">{customer.state ?? <span className="text-gray-300">—</span>}</div>
                  {/* Last order */}
                  <div className="hidden md:block text-xs text-gray-500">
                    {new Date(customer.last_order_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {/* Orders */}
                  <div className="hidden md:block text-right text-sm font-bold text-gray-700">{customer.orders.length}</div>
                  {/* Spent */}
                  <div className="hidden md:flex items-center justify-end gap-1">
                    <span className="text-sm font-extrabold text-emerald-600">${customer.total_spent.toLocaleString()}</span>
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-arrow-right-s-line text-gray-400 text-sm"></i>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          email={selectedCustomer.email}
          fullName={selectedCustomer.fullName}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}
