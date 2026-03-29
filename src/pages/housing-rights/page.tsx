import { useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

const trustBadges = [
  { icon: "ri-shield-check-line", label: "HIPAA Compliant" },
  { icon: "ri-lock-line", label: "SSL Secured" },
  { icon: "ri-refund-2-line", label: "100% Money Back" },
  { icon: "ri-stethoscope-line", label: "Licensed Physician" },
];

const categories = [
  {
    title: "Housing",
    icon: "ri-home-heart-line",
    desc: "Landlords are expected to accept documentation of emotional support animals and waive smoking along with their pets or similar restrictions, along with their owners, even in buildings that do not allow service animals. Employers are responsible for waiving policies or special accommodations whilst without additional consideration on top of that outside their landlord owns, though the landlord may be responsible for the service the animals to be in housing without additional recommendations results credible documentation from the tenant.",
  },
  {
    title: "Employment",
    icon: "ri-briefcase-line",
    desc: "Employees can petition to appeal for a fair ESA accommodation to their employer and must provide documentation regarding their emotional support animal without undue hardship. The employer can suggest or require alternative accommodations unless the employee has provided documentation of their condition. However, employees cannot ask an employee on information regarding their disabilities or charges, paperwork or presentations.",
  },
  {
    title: "Public Place",
    icon: "ri-store-line",
    desc: "Service animals are allowed in public places, but emotional support animals must be controlled. Businesses don't necessarily need to accept ESAs unless there are direct legal requirements. If they are to be in the store at all times, they can be 2 positions at a time, to accommodate their guests with disabilities while avoiding other guests and shopping areas. However, businesses cannot ask an employee regarding their disabilities or charge for paperwork or presentations.",
  },
];

const fhaPoints = [
  "You must have a valid ESA letter from a licensed mental health professional practicing in your state.",
  "The letter must show that you have a mental or emotional disability and that your ESA helps with your condition.",
  "Our licensed providers do full assessments based on your needs. If you qualify, your ESA letter will meet all state and federal housing laws.",
];

const benefitsList = [
  "Thorough evaluation by licensed mental health professionals",
  "Legally enforced for rentals, vacation homes, and college dorms",
  "Compliant with Fair Housing Act for housing",
  "Affordable pricing at $129 with 'no pets' policies",
  "Money Back Guarantee for stress-free experience",
  "Dedicated customer support",
  "Legitimate ESA letter for peace of mind",
];

const faqs = [
  { q: "What Types Of Housing Are Covered By The Fair Housing Act?", a: "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, except for owner-occupied buildings with four or fewer units, single-family houses sold or rented without the use of a broker, and certain religious organizations." },
  { q: "What Documents Are Required For Landlords To Accept An ESA?", a: "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, license type, and state of licensure, as well as confirmation that the tenant has a qualifying condition and that the ESA is part of their treatment plan." },
  { q: "Can A Landlord Deny An ESA Based On Breed Or Size?", a: "No — under the Fair Housing Act, landlords cannot deny an ESA request based on the breed or size of the animal. The only grounds for denial are if the animal poses a direct threat to the health or safety of others, or if accommodating the animal would cause undue financial or administrative burden." },
  { q: "Choosing Between An ESA And A Service Animal", a: "Service animals are trained to perform specific tasks related to a person's disability and are protected under the ADA in public spaces. ESAs provide emotional comfort and are protected under the FHA for housing. If your primary need is housing protection and emotional support, an ESA letter may be the right choice." },
];

export default function HousingRightsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <title>ESA Housing Rights 2026: Fair Housing Act Protections & ESA Housing Protections | PawTenant</title>
      <meta name="description" content="Understand your ESA housing rights under the Fair Housing Act. Landlords cannot charge pet fees, deny breed types, or refuse a valid ESA letter. Learn about esa housing protections and get your legitimate emotional support animal letter today." />
      <meta name="keywords" content="ESA housing rights, Fair Housing Act ESA, emotional support animal housing, ESA landlord rights, ESA pet deposit waiver" />
      <link rel="canonical" href="https://www.pawtenant.com/housing-rights-esa" />
      <meta property="og:title" content="ESA Housing Rights & Fair Housing Act ESA Protections 2026 | PawTenant" />
      <meta property="og:description" content="Know your ESA housing rights and housing protections under the Fair Housing Act. PawTenant issues legitimate emotional support animal letters for housing from licensed professionals." />
      <meta property="og:url" content="https://www.pawtenant.com/housing-rights-esa" />
      <meta property="og:type" content="article" />
      <meta property="og:image" content="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ESA Housing Rights 2026: Fair Housing Act Protections | PawTenant" />
      <meta name="twitter:description" content="Your ESA housing rights under the Fair Housing Act explained. Landlords cannot charge pet fees or deny a valid ESA letter. Get your ESA letter with PawTenant." />
      <meta name="twitter:image" content="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": "What Types Of Housing Are Covered By The Fair Housing Act?", "acceptedAnswer": { "@type": "Answer", "text": "The Fair Housing Act covers a broad range of housing options, including rental apartments, condominiums, houses, and even some types of temporary housing. It applies to both public and private housing providers, except for owner-occupied buildings with four or fewer units, single-family houses sold or rented without the use of a broker, and certain religious organizations." } },
              { "@type": "Question", "name": "What Documents Are Required For Landlords To Accept An ESA?", "acceptedAnswer": { "@type": "Answer", "text": "A valid ESA letter from a licensed mental health professional (LMHP). The letter should be on official letterhead and include the provider's name, license number, license type, and state of licensure, as well as confirmation that the tenant has a qualifying condition and that the ESA is part of their treatment plan." } },
              { "@type": "Question", "name": "Can A Landlord Deny An ESA Based On Breed Or Size?", "acceptedAnswer": { "@type": "Answer", "text": "No — under the Fair Housing Act, landlords cannot deny an ESA request based on the breed or size of the animal. The only grounds for denial are if the animal poses a direct threat to the health or safety of others, or if accommodating the animal would cause undue financial or administrative burden." } },
              { "@type": "Question", "name": "What is the difference between an ESA and a Service Animal?", "acceptedAnswer": { "@type": "Answer", "text": "Service animals are trained to perform specific tasks related to a person's disability and are protected under the ADA in public spaces. ESAs provide emotional comfort and are protected under the FHA for housing. If your primary need is housing protection and emotional support, an ESA letter may be the right choice." } }
            ]
          },
          {
            "@type": "ImageObject",
            "name": "Licensed Mental Health Professionals — ESA Housing Rights",
            "description": "Board-licensed mental health professionals provide ESA letters that protect housing rights under the Fair Housing Act for emotional support animal owners across the USA.",
            "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0",
            "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0",
            "representativeOfPage": true
          },
          {
            "@type": "ImageObject",
            "name": "ESA Housing Protection Support — Fair Housing Act",
            "description": "ESA housing protection and Fair Housing Act tenant rights for emotional support animal owners — no pet fees, no breed restrictions.",
            "url": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95",
            "contentUrl": "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95"
          }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8d22db50-fbe5-4a70-b2ec-86b6daa70b72_Licensed-Mental-Health-Professionals.jpg?v=720063ca19f7892a3d215673553d41f0"
            alt="Licensed mental health professionals issuing ESA letters for housing rights under the Fair Housing Act"
            title="Licensed Mental Health Professionals — ESA Housing Rights"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Housing Rights &amp; Your ESA
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              Understanding your legal rights is the first step to keeping your emotional support animal with you at home. The Fair Housing Act protects you — and we make sure you're fully covered.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-footprint-fill"></i>
                Get an ESA Letter Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-6 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trustBadges.map((b) => (
              <div key={b.label} className="flex items-center justify-center gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg">
                  <i className={`${b.icon} text-orange-500 text-lg`}></i>
                </div>
                <span className="text-sm font-semibold text-gray-800">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Emotional Support Animals</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-5">What Do I Need to Know About Emotional Support Animals</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map((cat) => (
              <div key={cat.title} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="w-10 h-10 flex items-center justify-center bg-orange-50 rounded-lg mb-4">
                  <i className={`${cat.icon} text-orange-500 text-xl`}></i>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{cat.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{cat.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
            >
              <i className="ri-search-line"></i>
              Find Out If You Qualify
            </Link>
          </div>
        </div>
      </section>

      {/* FHA Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="inline-block bg-orange-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-5">
                Fair Housing Act (FHA)
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">What The Fair Housing Act Protects</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                The Fair Housing Act was initially established to protect people from housing discrimination. It later extended to include people with disabilities — including those who use emotional or mental health support animals. In addition to the common rental support animal, other animals are also eligible under the Fair Housing Act, including those with emotional conditions.
              </p>
              <h3 className="text-base font-bold text-gray-900 mb-3">Fair Housing Act and Service Animals</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Service animals are used by people with physical or mental disabilities. These animals typically dogs, are trained to perform specific tasks for an individual with a disability. For example: a dog that guides a blind person, one that alerts a deaf person, or an animal that goes with a person suffering from a condition that can result in sudden incapacitation in case of an attack such as epilepsy or cardiac arrest.
              </p>
              <div className="bg-[#fdf6ee] rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">To Be Protected under the FHA:</h3>
                <ul className="space-y-3">
                  {fhaPoints.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">{p}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <div className="rounded-2xl overflow-hidden h-64 mb-8">
                <img
                  src="https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/d865c255-b615-451f-a02d-71420df80d88_Housing-Protection-Support.jpg?v=c3cc0edf08b5cac53b799c74d0c40b95"
                  alt="ESA housing protection support — Fair Housing Act tenant rights for emotional support animal owners"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="bg-[#fdf6ee] rounded-2xl p-7">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Benefits of Having an ESA Letter from PawTenant</h3>
                <ul className="space-y-2.5">
                  {benefitsList.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-check-line text-orange-500 font-bold"></i>
                      </div>
                      <p className="text-gray-700 text-sm">{item}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Link
                    to="/assessment"
                    className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                  >
                    <i className="ri-footprint-fill"></i>
                    Get An ESA Letter Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Landlord Obligations */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Fair Housing Act and Emotional Support Animals (ESA)</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8 max-w-4xl">
            Emotional support animals (ESAs) provide comfort and help individuals with mental health conditions, as they increase their symptoms and improve their overall well-being. However, to legally have an ESA in housing, you need a valid ESA letter from a licensed mental health professional.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Landlord Obligations and ESA Accommodation</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Emotional support animals (ESAs) provide comfort and assistance to individuals with mental health conditions. As a result, they need to be allowed where their owners live as part of the Fair Housing Act (FHA), which provides a way for people with disabilities to have equal access to housing.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                To comply with the FHA, landlords must allow ESAs as a necessary accommodation for an individual with a disability. Landlords can ask for documentation such as an ESA letter from a licensed mental health professional. However, they cannot ask for detailed medical records, require a specific letter format, or charge extra fees for an ESA.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-7 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Dealing with Landlord Refusals</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Options for Denial Accommodation: In some cases, despite presenting the necessary documentation and complying with the FHA, some landlords may deny or delay an ESA accommodation request. Should this happen, there are legal options available to individuals with disabilities who are facing housing discrimination, including those related to ESA accommodations requiring reasonable accommodation under the FHA.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed">
                Should you fail to get the housing you need, you can contact the HUD for guidance. The NFB often calls out but keeps to this in certain circumstances. By encouraging its activity by organizations, the NFHRC (NFHRC) can help navigate this process ensure your rights are protected.
              </p>
            </div>
          </div>
          <div className="text-center mt-10">
            <Link
              to="/assessment"
              className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
            >
              <i className="ri-search-line"></i>
              Find Out If You Qualify
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Fair Housing Act Emotional Support Animals FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#fafafa] rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>
                    {faq.q}
                  </span>
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 ml-4">
                    <i className={`${openFaq === i ? "ri-subtract-line" : "ri-add-line"} text-orange-500`}></i>
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Schedule Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
