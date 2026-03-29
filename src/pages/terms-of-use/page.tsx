import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";

const sections = [
  { id: "mobile-terms", title: "Mobile Message Service" },
  { id: "scope", title: "Limited Scope of Services" },
  { id: "refund", title: "Refund & Cancellation Policy" },
  { id: "site-content", title: "Site Content" },
  { id: "user-accounts", title: "User Accounts" },
  { id: "licenses", title: "Licenses" },
  { id: "links", title: "Website Links" },
  { id: "ip", title: "Intellectual Property" },
  { id: "trademarks", title: "Trademarks" },
  { id: "deactivation", title: "Account Deactivation" },
  { id: "modifications", title: "Right to Modify" },
  { id: "warranties", title: "Disclaimer of Warranties" },
  { id: "liability", title: "Limitation of Liability" },
  { id: "indemnification", title: "Indemnification" },
  { id: "dispute", title: "Dispute Resolution" },
  { id: "other", title: "Other Provisions" },
  { id: "dmca", title: "DMCA Notice" },
];

function Divider() {
  return <hr className="border-gray-100" />;
}

function SectionHeading({ id, num, title }: { id: string; num?: string; title: string }) {
  return (
    <h2 id={id} className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2 scroll-mt-28">
      {num && (
        <span className="w-7 h-7 flex items-center justify-center rounded-full bg-orange-100 text-orange-600 text-xs font-extrabold flex-shrink-0">
          {num}
        </span>
      )}
      {title}
    </h2>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-gray-600 text-sm">
          <i className="ri-checkbox-blank-circle-fill text-orange-400 text-[6px] mt-2 flex-shrink-0"></i>
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ul>
  );
}

export default function TermsOfUsePage() {
  const [activeId, setActiveId] = useState("mobile-terms");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="pt-32 pb-12 bg-[#fdf6ee]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">Terms of Use</span>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Terms of Use
          </h1>
          <p className="text-sm text-gray-500">
            <strong>Pawtenant (HyperSpace Solutions LLC)</strong> &nbsp;·&nbsp; Last Updated: <strong>September 18, 2024</strong>
          </p>
          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 max-w-3xl">
            <p className="text-sm text-amber-800 leading-relaxed">
              <strong>Arbitration Notice:</strong> Except for specific disputes outlined in the Dispute Resolution section, you agree that any disagreements with Pawtenant will be resolved through individual, binding arbitration. By agreeing to these Terms, you and Pawtenant waive the right to a jury trial and the ability to participate in class action or collective lawsuits.
            </p>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed mt-4 max-w-3xl">
            By clicking "I Accept" or by downloading, installing, accessing, or using this website, you confirm that you have read, understood, and agreed to these Terms of Use and Pawtenant's Privacy Policy. If you do not qualify or do not agree with the Terms, you are not permitted to use this website.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex gap-12">

          {/* Sidebar TOC */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">On This Page</p>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className={`block text-sm py-1.5 px-3 rounded-lg transition-colors cursor-pointer ${
                        activeId === s.id
                          ? "bg-orange-50 text-orange-600 font-semibold border-l-2 border-orange-500"
                          : "text-gray-500 hover:text-gray-800"
                      }`}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-10">

            <div>
              <SectionHeading id="mobile-terms" title="Mobile Message Service Terms" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>The Pawtenant mobile messaging service (the "Service") is operated by Klaviyo. By using the Service, you agree to these Mobile Terms. Pawtenant may change or discontinue the Service or its features without notice. If the Mobile Terms are updated, your continued use of the Service after the update means you accept the changes.</p>
                <p>We do not charge for the Service, but standard messaging and data rates from your wireless provider may apply.</p>
                <p>Text messages may be delivered via automated systems. Agreeing to receive these messages is not a requirement for purchasing any goods or services. Message frequency will vary. You can opt out anytime by texting <strong>STOP</strong> to <strong>+1 (409) 965-5885</strong>. For help, text <strong>HELP</strong> to <strong>+1 (409) 965-5885</strong> or email <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>.</p>
                <p>Wireless carriers involved with the Service are not liable for delayed or undelivered messages. You must provide an accurate, up-to-date mobile number. Pawtenant is not liable for failed or delayed messages, message errors, or actions you take based on the Service content.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="scope" title="Limited Scope of Services; No Doctor-Patient Relationship" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>The Pawtenant site is designed solely for educational and informational purposes. It does not offer medical or psychological advice, diagnoses, or treatment. Viewing the site or interacting with its content does not establish a professional relationship between you and Pawtenant or any affiliated individuals or Providers.</p>
                <p>Even if individuals providing information on the site hold professional credentials or reference clinical studies, they only provide educational content and not clinical services. The information available should not replace professional medical advice or be used to diagnose or treat any conditions.</p>
                <p>Providers using the site are fully responsible for the services they deliver, subject to Pawtenant's quality control guidelines. Pawtenant and any third parties linked to the site are not responsible for any damages arising from professional advice or services you receive through the site.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="refund" title="Refund and Cancellation Policy" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Pawtenant's refund and cancellation terms help ensure that our team of licensed health care professionals ("LHCPs") can dedicate their time effectively to those who need assistance.</p>
                <p>Once you place your order, if you request a refund before signing the LHCP consent form, a <strong>$30 administrative fee</strong> will be deducted. After signing the consent form, your order becomes <strong>non-refundable</strong>, unless:</p>
                <ol className="space-y-1.5 list-decimal list-inside pl-2">
                  <li>You are found ineligible for an ESA letter following your consultation with a licensed mental health professional.</li>
                  <li>Your landlord rejects your ESA letter, and you file a complaint with HUD.</li>
                </ol>
                <p><strong>Express consultation</strong> fees are <strong>non-refundable</strong>, because these cases are immediately prioritized once you submit your request. After placing your express order, you must submit your consent form within <strong>24 hours</strong> to your LHCP.</p>
                <p>We do not offer refunds for additional services such as extra document orders or ESA letter amendments, unless those documents are rejected by the relevant authority, and you have filed a formal complaint.</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-800 font-bold mb-1">ARKANSAS, CALIFORNIA, IOWA, LOUISIANA, and MONTANA Residents Notice</p>
                  <p className="text-xs text-amber-800">Beginning January 1, 2022, state law AB 468 requires individuals seeking ESA letters for dogs to have a client-provider relationship lasting at least <strong>30 days</strong> before documentation can be issued. This process will involve two consultations. The 100% money-back guarantee still applies if you fail to qualify or your landlord rejects your ESA letter after a HUD complaint.</p>
                </div>
                <p>Ultimately, acceptance of your ESA letter lies with your landlord or airline. Some landlords may unlawfully deny ESA accommodations, and airlines are not legally required to accept emotional support animals anymore.</p>
                <p>If your ESA request is wrongly rejected, you must file a complaint and share the complaint number with us to qualify for a full refund. However, if the denial is for a valid reason (such as damage, threats, or health risks), we reserve the right to deduct an administrative fee of up to <strong>$30</strong>.</p>
                <p>For PSD letters, you must self-certify that your animal is fully trained and meets ADA and FHA standards. Refunds for PSD letters are <strong>never issued</strong>.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="site-content" title="Site Content" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Pawtenant strives to ensure the accuracy and relevance of the content on the Site but does not guarantee it. We reserve the right to modify, add, or remove any part of the Site content or to discontinue all or parts of the Site without notice.</p>
                <p>Our Services and Site are intended for users located within the United States. Anyone accessing the Site from outside the U.S. does so at their own risk, and Pawtenant is not responsible for compliance with laws outside the U.S.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="user-accounts" title="User Accounts" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>When you register, you must create an Account by providing your name, email, password, and other required details ("Account Information").</p>
                <p>To create an Account, you must be <strong>at least 18 years old</strong> and capable of entering a binding contract. All information you submit must be true, accurate, current, and complete. You are responsible for maintaining the confidentiality of your password and for all activities under your Account.</p>
                <p>Pawtenant may take necessary actions to protect your Account and the Site's security. The Site and Services are not directed to children, and if Pawtenant becomes aware of any user under 18, we will delete their data.</p>
                <p>Always notify Pawtenant immediately of any loss, theft, or unauthorized use of your Account.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="licenses" title="Licenses" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Pawtenant grants you a limited, non-transferable license to access the Site and use the Services for personal, non-commercial purposes under these Terms.</p>
                <p>You must not:</p>
                <BulletList items={[
                  "Impersonate others or misrepresent your affiliation.",
                  "Violate any law while using the Site.",
                  "Reverse engineer, decompile, or attempt to extract the Site's software.",
                  "Spread viruses or harmful code.",
                ]} />
                <p>You also agree not to post unlawful, abusive, defamatory, obscene, hateful, or invasive content. Pawtenant may remove any content it deems inappropriate.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="links" title="Website Links" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Pawtenant is not responsible for any content, information, or software found on external websites linked through the Site. We do not endorse or guarantee anything on those third-party sites.</p>
                <p>Our Site may include features allowing you to export information to services like Facebook, Instagram, or other websites. When you use those tools, you agree that Pawtenant may transfer your information to those services. However, third-party services operate independently, and Pawtenant is not liable for their use of your information.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="ip" title="Intellectual Property Ownership" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Everything on the Site — including text, images, audio, video, software, and the overall design — belongs to Pawtenant, its licensors, or content providers and is protected by U.S. and international intellectual property laws.</p>
                <p>You may only use the Site for personal, non-commercial purposes. You are not allowed to copy, modify, distribute, publicly display, or create derivative works from any Site material unless generally permitted through normal Site use.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="trademarks" title="Trademarks" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Certain names, logos, and designs displayed on the Site are trademarks or service marks belonging to Pawtenant or others. You are not permitted to use any trademarks shown on the Site without written permission. All rights to these trademarks remain with their owners.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="deactivation" title="Account Deactivation" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>You may deactivate your Account and end your registration at any time by emailing <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>. Pawtenant also reserves the right to suspend or terminate your Account or your access to the Site at any time, for any reason or no reason.</p>
                <p>We may retain, delete, or destroy any communications or content you posted on the Site according to our internal policies. After your Account is deactivated, Pawtenant has no further obligations to you.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="modifications" title="Right to Modify" />
              <div className="text-gray-600 text-sm leading-relaxed">
                <p>Pawtenant may change, add, or remove parts of the Terms at any time, in its sole discretion. By continuing to use the Site or Services after changes have been posted, you accept and agree to be bound by the updated Terms.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="warranties" title="Disclaimer of Warranties" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>You use the Site and Services at your own risk. Both are provided "as is" and "as available" without any warranties of any kind, either express or implied.</p>
                <p>Pawtenant disclaims all warranties, including but not limited to:</p>
                <BulletList items={["Merchantability", "Fitness for a particular purpose", "Non-infringement", "Accuracy", "System reliability", "Freedom from errors or viruses"]} />
                <p>Pawtenant does not guarantee any legal rights, outcomes, or benefits regarding disability accommodations, housing, or air travel. Even if you receive an ESA letter, there is no guarantee that a third party — like a landlord or airline — will recognize it.</p>
                <p>An ESA is not a "service dog" and may not have the same legal protections.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="liability" title="Limitation of Liability" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>To the maximum extent allowed by law, Pawtenant and its associated parties are not liable for any indirect, incidental, special, consequential, or exemplary damages. This includes losses like:</p>
                <BulletList items={["Lost profits", "Lost goodwill", "Lost data", "Other intangible losses"]} />
                <p>If Pawtenant is found liable for any reason, our total liability is limited to the amount you paid for the product or service involved. Any claims must be brought within <strong>one (1) year</strong> of the event giving rise to the claim.</p>
                <p>By using the Site, you waive your right to participate in class action lawsuits related to your use of the Site.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="indemnification" title="Indemnification" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>In exchange for your use of the Site, you agree to defend, indemnify, and hold harmless Pawtenant and its affiliates against any claims, actions, demands, liabilities, or settlements. This includes covering reasonable legal and accounting fees related to:</p>
                <BulletList items={["Your violation of these Terms or the law", "Your reliance on Site information", "Any content you upload to the Site"]} />
                <p>You also agree to indemnify Providers against third-party claims arising from your use of information or advice they provided. Pawtenant may take over the defense of any matter you must indemnify, and you agree to cooperate fully with us. You cannot settle any claim without Pawtenant's written consent.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="dispute" title="Dispute Resolution and Arbitration" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-4">
                <p><strong className="text-gray-800">General Agreement to Arbitrate:</strong> In order to resolve disputes efficiently and affordably, you and Pawtenant agree to binding individual arbitration for any disputes arising from the Terms, your use of the Site, or the Services. By agreeing to these Terms, you waive your right to a jury trial and the ability to participate in class actions.</p>
                <p><strong className="text-gray-800">Exceptions to Arbitration</strong> — Despite this agreement, you or Pawtenant may:</p>
                <BulletList items={["Bring an individual action in small claims court", "Pursue enforcement through government agencies", "Seek injunctive relief in court", "File lawsuits for intellectual property infringement"]} />
                <p><strong className="text-gray-800">Opt-Out Option:</strong> You may opt out of arbitration within <strong>30 days</strong> after accepting the Terms by sending a written notice to Pawtenant, Attention: Legal – Arbitration Opt-Out. Your opt-out notice must include your full name, email address, and a clear statement that you wish to opt out.</p>
                <p><strong className="text-gray-800">Arbitration Procedures:</strong> Any arbitration between you and Pawtenant will be administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules, governed by the Federal Arbitration Act. All arbitration hearings will occur in Miami, Florida, unless both sides agree otherwise.</p>
                <p><strong className="text-gray-800">No Class Actions:</strong> You and Pawtenant agree to bring claims only in an individual capacity — not as plaintiffs or class members in any class or representative action.</p>
                <p><strong className="text-gray-800">Enforcement:</strong> If any part of the arbitration clause is found unenforceable or if you opted out, then the exclusive jurisdiction for any disputes will be the state and federal courts located in <strong>Houston, Texas</strong>.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="other" title="Other Provisions" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>You may not transfer or assign your rights under these Terms without Pawtenant's written approval. Pawtenant may transfer its rights at any time.</p>
                <p>These Terms are governed by Florida law, without regard to conflict-of-law principles. By checking the "Agree" box on the Site or any forms, you are legally binding yourself to these Terms.</p>
                <p>Pawtenant may communicate legal notices to you electronically (via email or posted on the Site). Delivery is considered effective when sent, regardless of whether you read it.</p>
                <p>If any provision of these Terms is found invalid, the remainder will remain in full force. These Terms represent the complete agreement between you and Pawtenant regarding your use of the Site and Services.</p>
                <p>Please report any violations to <a href="mailto:hello@pawtenant.com" className="text-orange-500 hover:underline">hello@pawtenant.com</a>.</p>
              </div>
            </div>

            <Divider />

            <div>
              <SectionHeading id="dmca" title="DMCA Notice" />
              <div className="text-gray-600 text-sm leading-relaxed space-y-3">
                <p>Under the Digital Millennium Copyright Act (DMCA), if you believe your copyright is infringed by materials on the Site, you may send a notice to:</p>
                <div className="bg-[#fdf6ee] border border-orange-100 rounded-xl p-5">
                  <p className="font-bold text-gray-800">Pawtenant.</p>
                  <p className="font-bold text-gray-800">Attn: Legal – Copyright Infringement Notice</p>
                </div>
                <p>Pawtenant will remove infringing content if properly notified and will terminate Accounts of repeat infringers.</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
