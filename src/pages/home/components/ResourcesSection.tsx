import { Link } from "react-router-dom";

/**
 * ResourcesSection — CRO redesign 2026-07-11 (HOMEPAGE-CRO-REDESIGN-TEST-IMPLEMENT-001).
 *
 * Photo guide cards restoring the "Trusted ESA & PSD Resources" H2 (SEO) and
 * the high-value internal links previously carried by MediaGallery +
 * ResourceLinksSection. All hrefs are real existing PawTenant routes; all
 * photos are existing repo assets (no new imagery).
 */

const FONT_DISPLAY = { fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif' };

const GUIDES = [
  {
    to: "/how-to-get-esa-letter-online",
    title: "How to Get an ESA Letter Online",
    text: "The legitimate process, step by step.",
    cta: "Read the guide",
    img: "/assets/lifestyle/woman-telehealth-with-dog.jpg",
    alt: "Woman on a telehealth video call with her dog on her lap",
  },
  {
    to: "/esa-letter-cost",
    title: "ESA Letter Cost",
    text: "Transparent pricing and what’s included.",
    cta: "See pricing",
    img: "/assets/lifestyle/esa-owner-hugging-dog-home.jpg",
    alt: "Owner hugging her dog at home",
  },
  {
    to: "/esa-letter-for-landlord",
    title: "ESA Letter for Landlords",
    text: "How to submit your letter the right way.",
    cta: "Read the guide",
    img: "/assets/lifestyle/person-paperwork-with-dog.jpg",
    alt: "Person preparing landlord paperwork with their dog nearby",
  },
  {
    to: "/landlord-denied-esa-letter",
    title: "Landlord Denied Your ESA?",
    text: "Your options and next steps, explained.",
    cta: "Read the guide",
    img: "/assets/lifestyle/senior-with-pet-home.jpg",
    alt: "Man at home on the sofa with his pet",
  },
  {
    to: "/service-animal-vs-esa",
    title: "Service Animal vs ESA",
    text: "The legal differences that matter.",
    cta: "Compare",
    img: "/assets/service-dogs/handler-working-with-dog.jpg",
    alt: "Handler working at a desk with an attentive dog beside her",
  },
  {
    to: "/travel-anxiety-esa-letter",
    title: "Travel Anxiety & ESA Support",
    text: "Housing support when life moves around.",
    cta: "Read the guide",
    img: "/assets/travel/petfriendly-cafe.jpg",
    alt: "Dog resting at a pet-friendly cafe",
  },
];

export default function ResourcesSection() {
  return (
    <section id="resources" className="py-14 sm:py-20 bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-5 sm:px-6">
        <div className="text-center mb-9 sm:mb-11">
          <p className="text-[#6B6359] text-xs sm:text-sm font-extrabold tracking-widest uppercase mb-2.5">
            Learn Before You Apply
          </p>
          <h2
            className="text-[26px] sm:text-4xl font-semibold text-[#231F1A] leading-tight"
            style={FONT_DISPLAY}
          >
            Trusted ESA &amp; PSD Resources
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {GUIDES.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className="group flex flex-col overflow-hidden bg-white border border-[#EAE3D7] rounded-2xl shadow-[0_1px_2px_rgba(35,31,26,0.05),0_10px_30px_-14px_rgba(35,31,26,0.14)] hover:-translate-y-0.5 transition-transform"
            >
              <img
                src={g.img}
                alt={g.alt}
                width={640}
                height={420}
                loading="lazy"
                decoding="async"
                className="w-full h-[110px] sm:h-[150px] object-cover"
              />
              <div className="flex flex-col flex-1 px-3.5 py-3.5 sm:px-4 sm:py-4 gap-1">
                <h3 className="text-[13.5px] sm:text-[15.5px] font-extrabold text-[#231F1A] leading-snug">
                  {g.title}
                </h3>
                <p className="text-[11.5px] sm:text-[13px] text-[#6B6359] leading-snug">{g.text}</p>
                <span className="mt-auto pt-1.5 text-[12px] sm:text-[12.5px] font-extrabold text-[#3F7061] group-hover:underline">
                  {g.cta} →
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            to="/resource-center"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white border-[1.5px] border-[#DCD2C0] text-[#231F1A] font-extrabold text-[15px] rounded-xl hover:border-[#B5AC9F] transition-colors cursor-pointer"
          >
            Browse the Full Resource Center
            <i className="ri-arrow-right-line" aria-hidden></i>
          </Link>
        </div>
      </div>
    </section>
  );
}
