import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { DOCTORS, ALL_STATES } from "../../mocks/doctors";
import type { Doctor } from "../../mocks/doctors";
import { supabase } from "../../lib/supabaseClient";
import { mapApprovedToDoctor } from "../../hooks/useDynamicDoctors";

const stateMap = Object.fromEntries(ALL_STATES.map((s) => [s.code, s.name]));

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const staticDoctor = DOCTORS.find((d) => d.id === id) ?? null;
  const [doctor, setDoctor] = useState<Doctor | null>(staticDoctor);
  const [loading, setLoading] = useState(!staticDoctor);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (staticDoctor) {
      setDoctor(staticDoctor);
      setLoading(false);
      return;
    }
    // Fetch dynamic doctor from Supabase
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("approved_providers")
        .select("*")
        .eq("slug", id ?? "")
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setDoctor(mapApprovedToDoctor(data));
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <>
        <SharedNavbar />
        <div className="min-h-screen flex items-center justify-center bg-[#f8f7f4]">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
        <SharedFooter />
      </>
    );
  }

  if (notFound || !doctor) {
    return (
      <>
        <SharedNavbar />
        <div className="min-h-screen flex items-center justify-center bg-[#f8f7f4]">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800 mb-3">Doctor not found</p>
            <Link to="/" className="text-orange-500 hover:underline text-sm">Back to Home</Link>
          </div>
        </div>
        <SharedFooter />
      </>
    );
  }

  const stateNames = doctor.states.map((code) => stateMap[code] || code);

  return (
    <>
      <SharedNavbar />

      <div className="bg-[#f8f7f4] pt-32 pb-10 px-6">
        <div className="max-w-4xl mx-auto">
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-400">Our Providers</span>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">{doctor.name}</span>
          </nav>
        </div>
      </div>

      <div className="bg-[#f8f7f4] pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-8 md:p-10 pb-6 border-b border-gray-100">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-orange-100 flex-shrink-0 bg-orange-50">
                <img src={doctor.image} alt={doctor.name} className="w-full h-full object-cover object-top" />
              </div>
              <div className="flex-1 min-w-0">
                <a href={doctor.verificationUrl} target="_blank" rel="nofollow noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold mb-2 hover:bg-green-100 transition-colors cursor-pointer">
                  <i className="ri-shield-check-line text-green-500"></i>
                  Verified Medical Professional
                  <i className="ri-external-link-line text-green-400 text-xs ml-0.5"></i>
                </a>
                <h1 className="text-2xl font-extrabold text-gray-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {doctor.name}, {doctor.title}
                </h1>
                <p className="text-orange-500 font-semibold text-sm mt-0.5">{doctor.role}</p>
              </div>
            </div>

            <div className="p-8 md:p-10 pt-7">
              <p className="text-gray-600 text-sm leading-relaxed mb-7">{doctor.bio}</p>

              <div className="mb-6">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2.5">Licensed In</p>
                <div className="flex flex-wrap gap-2">
                  {stateNames.map((name) => (
                    <span key={name} className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium">{name}</span>
                  ))}
                </div>
              </div>

              <div className="mb-7">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2.5">Highlights</p>
                <div className="flex flex-wrap gap-2">
                  {doctor.highlights.map((h) => (
                    <span key={h} className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold">{h}</span>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-7">
                <p className="text-amber-800 text-xs leading-relaxed">
                  <strong>Please note:</strong> ESA letters are issued only when clinically appropriate after an individual evaluation. State availability depends on active licensure and telehealth rules.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Link to={`/assessment?doctor=${doctor.id}`}
                  className="whitespace-nowrap px-7 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                  Book Consultation
                </Link>
                <button type="button" onClick={() => { document.getElementById("state-availability")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="whitespace-nowrap px-7 py-3 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                  View State Availability
                </button>
              </div>
            </div>
          </div>

          <div id="state-availability" className="mt-10 bg-white rounded-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>State Availability</h2>
            <p className="text-gray-500 text-sm mb-6">
              {doctor.name} is currently licensed and available to conduct ESA evaluations in the following states.
            </p>
            {stateNames.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {stateNames.map((name) => (
                  <div key={name} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#f8f7f4] border border-gray-100">
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      <i className="ri-map-pin-2-line text-orange-400 text-sm"></i>
                    </div>
                    <span className="text-gray-700 text-sm font-medium">{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">State availability will be updated shortly.</p>
            )}
          </div>

          <div className="mt-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-500 transition-colors cursor-pointer">
              <i className="ri-arrow-left-line"></i>Back to all providers
            </Link>
          </div>
        </div>
      </div>

      <SharedFooter />
    </>
  );
}
