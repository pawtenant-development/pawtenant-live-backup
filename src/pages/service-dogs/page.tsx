import { useState } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { Link } from "react-router-dom";

const dogBreeds = [
  {
    name: "Labrador Retriever",
    image: "/assets/breeds/labrador-retriever.jpg",
    desc: "Labrador Retrievers are among the most popular service dogs due to their gentle nature and intelligence. Their friendly disposition makes them excellent guides for the blind, hearing aids, and emotional support roles.",
  },
  {
    name: "Golden Retriever",
    image: "/assets/breeds/golden-retriever.jpg",
    desc: "Golden Retrievers are known for their patience, trainability, and gentle temperament, making them ideal candidates for service work. Their calm nature and ability to comfort make them excellent emotional support companions.",
  },
  {
    name: "German Shepherd",
    image: "/assets/breeds/german-shepherd.jpg",
    desc: "German Shepherds combine a high level of intelligence, ability, and trainability. They are frequently used as service dogs for a wide range of disabilities. Their protective instincts can also comfort those with anxiety or PTSD.",
  },
  {
    name: "Poodle",
    image: "/assets/breeds/poodle.jpg",
    desc: "Particularly Standard Poodles, are well-known for their sharp intelligence and ability to learn quickly. These qualities make them top-tier candidates for service dog roles, and their hypoallergenic quality also makes them accessible for those with allergies.",
  },
  {
    name: "Border Collie",
    image: "/assets/breeds/border-collie.jpg",
    desc: "Border Collies possess extraordinary intelligence, agility, and ability to focus. These qualities enable them to be excellent service dog candidates for those requiring high-precision assistance, such as mobility support and emotional grounding.",
  },
  {
    name: "Bernese Mountain Dog",
    image: "/assets/breeds/bernese-mountain-dog.jpg",
    desc: "Bernese Mountain Dogs are very calm in nature and gentle, combined with their large size and strength, making them incredible service dogs. Their calm temperament is well-suited for emotional support and therapy work.",
  },
];

const serviceDogInfo = [
  {
    title: "What is a Service Dog?",
    content: "Service dogs are highly trained canines that play a crucial role in assisting individuals with disabilities. These remarkably versatile animals are specifically trained to perform tasks directly related to a person's disability. Unlike emotional support animals, service dogs have public access rights under the Americans with Disabilities Act (ADA).",
  },
  {
    title: "Legal Rights and Benefits of Owning a Service Dog",
    content: "The Americans with Disabilities Act (ADA) is the primary federal law that provides protections for individuals with disabilities, making it illegal for businesses, employers, and public services to discriminate against service dog owners. Service dogs and their handlers are also granted important rights in housing and the workplace.",
  },
  {
    title: "Service Dog Training and Certification",
    content: "Service dogs play a vital role in assisting individuals with disabilities, and their ability to perform their tasks effectively relies heavily on rigorous training. This training is essential to ensure that service dogs can perform tasks reliably, maintain focus, and behave appropriately in a variety of environments. A Recognized Certification Organization and Programs: There are various non-governmental organizations that provide public recognition of service dogs and offer training or certification for service dogs.",
  },
];

const psdInfo = [
  { title: "What is a PSD Letter?", content: "A Psychiatric Service Dog (PSD) is a type of service dog specifically trained to assist individuals with psychiatric or mental health conditions. Unlike emotional support animals (ESAs), PSDs are trained to perform specific tasks that directly mitigate symptoms of a mental health condition recognized by the DSM-5." },
  { title: "PSD vs ESA: Key Differences", content: "While both PSDs and ESAs provide support for mental health conditions, they differ in their legal protections and requirements. PSDs have full public access rights under the ADA (like any service dog), while ESAs are primarily protected in housing under the FHA. PSDs must be trained to perform specific tasks, while ESAs do not require task training." },
  { title: "How to Get a PSD Letter", content: "To get a PSD letter, you need an evaluation from a licensed mental health professional who can verify that you have a qualifying psychiatric condition and that a service dog would help mitigate your symptoms. PawTenant can connect you with licensed professionals for this evaluation." },
];

const faqs = [
  { q: "What is the difference between a service dog and an ESA?", a: "Service dogs are trained to perform specific tasks for individuals with disabilities and have full public access rights under the ADA. ESAs provide emotional comfort and are primarily protected in housing under the FHA. Service dogs require specialized training; ESAs do not." },
  { q: "Can any dog be a service dog?", a: "While any dog breed can potentially become a service dog, certain breeds are more commonly used due to their temperament and trainability. The most important factor is that the dog can be trained reliably to perform specific tasks and behave appropriately in public." },
  { q: "Does a service dog need to be certified?", a: "In the US, there is no official government certification for service dogs. Under the ADA, service dogs can be trained by their owners or by professional trainers. The key requirement is that the dog is trained to perform specific tasks related to a disability." },
  { q: "What is a Psychiatric Service Dog (PSD)?", a: "A PSD is a service dog specifically trained to assist individuals with psychiatric conditions like PTSD, anxiety disorders, depression, bipolar disorder, or schizophrenia. They perform specific tasks such as interrupting harmful behaviors, providing grounding during dissociation, or reminding owners to take medications." },
  { q: "Where are service dogs allowed?", a: "Under the ADA, service dogs are allowed virtually everywhere the public is permitted, including restaurants, stores, hotels, hospitals, and on most forms of transportation. Only specific areas like sterile medical environments may be excluded." },
  { q: "Can a landlord refuse a service dog?", a: "No — under both the ADA and the Fair Housing Act, landlords must accommodate service dogs regardless of no-pet policies. Service dogs are not considered pets under the law." },
];

export default function ServiceDogsPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main>
      <title>Psychiatric Service Dog Letter Online 2026 — PSD Letter vs ESA Letter | PawTenant</title>
      <meta name="description" content="Get a psychiatric service dog letter (PSD letter) online from licensed mental health professionals. Learn the difference between a PSD letter and an ESA letter, and find out if you qualify. Fast, legal, HIPAA compliant." />
      <meta name="keywords" content="psychiatric service dog letter, PSD letter, service dog breeds, service dog training, ESA vs service dog, PSD letter online" />
      <link rel="canonical" href="https://www.pawtenant.com/all-about-service-dogs" />
      <meta property="og:title" content="Psychiatric Service Dog Letter Online 2026 | PawTenant" />
      <meta property="og:description" content="Licensed mental health professionals issue PSD letters and ESA letters online. Learn about service dog rights, PSD vs ESA differences, and how to qualify." />
      <meta property="og:url" content="https://www.pawtenant.com/all-about-service-dogs" />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Psychiatric Service Dog (PSD) Letter Online 2026 | PawTenant" />
      <meta name="twitter:description" content="Get a PSD letter online from licensed professionals. Learn about service dog breeds, training, legal rights, and how a PSD letter differs from an ESA letter." />
      <meta property="og:image" content="https://www.pawtenant.com/assets/blog/man-puppy-portrait.jpg" />
      <meta name="twitter:image" content="https://www.pawtenant.com/assets/blog/man-puppy-portrait.jpg" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": "What is the difference between a service dog and an ESA?", "acceptedAnswer": { "@type": "Answer", "text": "Service dogs are trained to perform specific tasks for individuals with disabilities and have full public access rights under the ADA. ESAs provide emotional comfort and are primarily protected in housing under the FHA. Service dogs require specialized training; ESAs do not." } },
              { "@type": "Question", "name": "What is a Psychiatric Service Dog (PSD)?", "acceptedAnswer": { "@type": "Answer", "text": "A PSD is a service dog specifically trained to assist individuals with psychiatric conditions like PTSD, anxiety disorders, depression, bipolar disorder, or schizophrenia. They perform specific tasks such as interrupting harmful behaviors, providing grounding during dissociation, or reminding owners to take medications." } },
              { "@type": "Question", "name": "Does a service dog need to be certified?", "acceptedAnswer": { "@type": "Answer", "text": "In the US, there is no official government certification for service dogs. Under the ADA, service dogs can be trained by their owners or by professional trainers. The key requirement is that the dog is trained to perform specific tasks related to a disability." } },
              { "@type": "Question", "name": "Can a landlord refuse a service dog?", "acceptedAnswer": { "@type": "Answer", "text": "No — under both the ADA and the Fair Housing Act, landlords must accommodate service dogs regardless of no-pet policies. Service dogs are not considered pets under the law." } },
              { "@type": "Question", "name": "Where are service dogs allowed?", "acceptedAnswer": { "@type": "Answer", "text": "Under the ADA, service dogs are allowed virtually everywhere the public is permitted, including restaurants, stores, hotels, hospitals, and on most forms of transportation. Only specific areas like sterile medical environments may be excluded." } },
              { "@type": "Question", "name": "Can any dog be a service dog?", "acceptedAnswer": { "@type": "Answer", "text": "While any dog breed can potentially become a service dog, certain breeds are more commonly used due to their temperament and trainability. The most important factor is that the dog can be trained reliably to perform specific tasks and behave appropriately in public." } }
            ]
          },
          {
            "@type": "ImageObject",
            "name": "Everything You Need to Know About Service Dogs",
            "description": "Complete guide to service dogs, psychiatric service dogs (PSDs), and ESA letters — ADA rights, training, and how to qualify for a PSD letter.",
            "url": "https://www.pawtenant.com/assets/blog/man-puppy-portrait.jpg",
            "contentUrl": "https://www.pawtenant.com/assets/blog/man-puppy-portrait.jpg",
            "representativeOfPage": true
          },
          {
            "@type": "ImageObject",
            "name": "How to Get a Psychiatric Service Dog Letter",
            "description": "Step-by-step guide showing how to get a psychiatric service dog (PSD) letter from a licensed mental health professional for housing and airline travel.",
            "url": "https://www.pawtenant.com/assets/blog/cafe-retriever.jpg",
            "contentUrl": "https://www.pawtenant.com/assets/blog/cafe-retriever.jpg"
          }
        ]
      }) }} />

      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src="https://www.pawtenant.com/assets/blog/man-puppy-portrait.jpg"
            alt="Everything you need to know about psychiatric service dogs and ESA letters — PawTenant 2026 guide"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">
              Service Dogs & PSD Letters
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Everything You Need to Know About Service Dogs
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8">
              Service dogs play a crucial role in assisting individuals with disabilities. From psychiatric service dogs to guide dogs, learn about training, certification, legal rights, and how to get a PSD letter.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-mental-health-line"></i>
                Get Your PSD Letter Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What is a Service Dog */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              {serviceDogInfo.map((info) => (
                <div key={info.title} className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">{info.title}</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">{info.content}</p>
                </div>
              ))}
              <Link
                to="/psd-assessment"
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
              >
                <i className="ri-mental-health-line"></i>
                Get Your PSD Letter Now
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="/assets/service-dogs/handler-working-with-dog.jpg"
                alt="Service dog handler working with a trained service dog — assistance and access rights"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Top Service Dog Breeds */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Top Breeds</span>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Top Service Dog Breeds</h2>
            <p className="text-gray-500 text-sm max-w-2xl mx-auto">
              Some dog breeds are well-known for their exceptional qualities and natural ability to perform various roles as service dogs for individuals with disabilities.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dogBreeds.map((breed) => (
              <div key={breed.name} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <div className="h-48">
                  <img
                    src={breed.image}
                    alt={breed.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-gray-900 mb-2">{breed.name}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{breed.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PSD Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src="/assets/blog/man-working-dog.jpg"
                alt="What is a psychiatric service dog PSD letter and how it protects your housing and travel rights"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">PSD Letters</span>
              {psdInfo.map((info) => (
                <div key={info.title} className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{info.title}</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">{info.content}</p>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/how-to-get-psd-letter"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-file-text-line"></i>
                  How to Get a PSD Letter
                </Link>
                <Link
                  to="/psd-assessment"
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 border border-orange-500 text-orange-500 font-semibold rounded-md hover:bg-orange-50 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-send-plane-line"></i>
                  Apply For PSD Letter
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Training */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Service Dog Training and Certification</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-5">
                Service dog training is a rigorous process designed to develop the specific skills and commands that allow service dogs to effectively assist their handlers. This training process helps ensure that service dogs can perform their tasks reliably in various environments and circumstances. Obedience training typically involves basic commands such as sit, stay, heel, come, and more specialized training related to their specific service role.
              </p>
              <p className="text-gray-600 text-sm leading-relaxed mb-5">
                Service dog socialization is a vital part of the training process. A well-socialized service dog is one that has been widely exposed to different environments, people, animals, and situations in order to avoid reactive or unpredictable behavior. This training is essential to maintain focus and perform their duties regardless of distractions.
              </p>
              <div className="bg-white rounded-xl p-5 border border-orange-200">
                <h3 className="font-bold text-gray-900 text-sm mb-3">Important: Certification Requirements</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  The most important thing to consider is that the dog needs to be capable of performing the task. Certification or documentation to not a required by ADA to have a service dog qualify. Individual establishments or transportation providers may attempt to require documents, and other organizations recognize certification programs that validate the dog's training and reliability.
                </p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-72">
              <img
                src="https://www.pawtenant.com/assets/blog/cafe-retriever.jpg"
                alt="How to get a psychiatric service dog PSD letter — training and licensed professional assessment"
                title="How to Get a Psychiatric Service Dog Letter"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Schedule CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Schedule Your PSD Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Get peace of mind with a service you can trust</p>
          <Link
            to="/psd-assessment"
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-calendar-line"></i>
            Schedule Your Appointment Today
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className={`text-sm font-semibold ${openFaq === i ? "text-orange-500" : "text-gray-900"}`}>{faq.q}</span>
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

      <SharedFooter />
    </main>
  );
}
