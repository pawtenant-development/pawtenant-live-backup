export interface College {
  slug: string;
  name: string;
  location: string;
  type: string;
  enrollment: string;
  image: string;
  esaPolicy: string;
  keyFacts: string[];
  housingPolicy: string;
  applicationProcess: string[];
  allowedAreas: string[];
  restrictions: string[];
  faq: { question: string; answer: string }[];
  metaTitle: string;
  metaDesc: string;
}

export const colleges: College[] = [
  {
    slug: "unc-chapel-hill",
    name: "UNC Chapel Hill",
    location: "Chapel Hill, North Carolina",
    type: "Public Research University",
    enrollment: "31,000+",
    image: "/assets/colleges/college-student-bed-dog.jpg",
    esaPolicy: "UNC Chapel Hill allows students with documented disabilities to request Emotional Support Animals as a reasonable accommodation in university housing. The university follows the Fair Housing Act and evaluates all ESA requests on a case-by-case basis.",
    keyFacts: ["ESAs allowed in all residential housing", "Documentation must come from a licensed mental health professional", "Annual renewal required", "No breed or weight restrictions for ESAs", "Roommate notification required"],
    housingPolicy: "Students at UNC Chapel Hill may request an ESA accommodation through the Equal Opportunity and Compliance office. Once approved, students are permitted to keep their ESA in their assigned residential housing unit. The animal must be necessary for the student's disability-related needs and well-behaved at all times.",
    applicationProcess: ["Obtain an ESA letter from a licensed mental health professional", "Complete the UNC disability accommodation request form", "Submit documentation to the Equal Opportunity and Compliance office", "Receive approval before bringing ESA to campus", "Register your ESA with residential life"],
    allowedAreas: ["Assigned dormitory room", "Residential common areas (limited)", "Outdoor residential areas"],
    restrictions: ["Not permitted in classrooms or academic buildings", "Not permitted in dining halls or food service areas", "Must be on leash in common areas", "Owner responsible for all damages"],
    faq: [
      { question: "How long does ESA approval take at UNC Chapel Hill?", answer: "Typically 5-10 business days after complete documentation is submitted." },
      { question: "Can I bring my ESA to class at UNC?", answer: "No. ESA privileges are limited to residential housing only. Service dogs have broader access rights." },
      { question: "What documentation do I need?", answer: "A current ESA letter from a licensed mental health professional familiar with your condition, within the past 12 months." }
    ],
    metaTitle: "ESA Letter for UNC Chapel Hill Students | PawTenant",
    metaDesc: "Keep your emotional support animal in UNC Chapel Hill housing. Get a legitimate ESA letter from licensed professionals. Fast approval, 100% money-back guarantee."
  },
  {
    slug: "georgetown",
    name: "Georgetown University",
    location: "Washington, D.C.",
    type: "Private Research University",
    enrollment: "20,000+",
    image: "/assets/colleges/student-holding-dog.jpg",
    esaPolicy: "Georgetown University recognizes ESAs as reasonable accommodations under the Fair Housing Act for students living in university-owned residential facilities. Requests are reviewed by the Academic Resource Center.",
    keyFacts: ["ESAs permitted in university housing", "Must register through Academic Resource Center", "Annual documentation renewal required", "ESA must not disturb other residents", "Renters responsibility for any damage"],
    housingPolicy: "Georgetown students with qualifying mental health conditions may apply for ESA accommodations through the Academic Resource Center. The university reviews each case individually and provides written approval before any ESA may reside in university housing.",
    applicationProcess: ["Schedule an appointment with the Academic Resource Center", "Provide ESA letter from licensed mental health professional", "Complete Georgetown's accommodation request form", "Receive written approval from the ARC", "Notify Housing & Dining Services"],
    allowedAreas: ["Assigned on-campus housing room", "Residential building common areas with approval"],
    restrictions: ["Academic buildings strictly off-limits", "No access to dining halls", "Must remain in assigned housing unit primarily"],
    faq: [
      { question: "Does Georgetown accept online ESA letters?", answer: "Georgetown requires documentation from a licensed mental health professional who has an established therapeutic relationship with the student." },
      { question: "Are exotic animals allowed as ESAs at Georgetown?", answer: "Georgetown evaluates each request individually. More exotic animals may face additional scrutiny." },
      { question: "What happens if my ESA causes issues in the dorm?", answer: "You may be required to remove the animal if it creates problems for other residents or violates housing policies." }
    ],
    metaTitle: "ESA Letter for Georgetown University Students | PawTenant",
    metaDesc: "Bring your emotional support animal to Georgetown University housing. Licensed ESA letters, fast turnaround, and full refund policy. Apply today with PawTenant."
  },
  {
    slug: "emory",
    name: "Emory University",
    location: "Atlanta, Georgia",
    type: "Private Research University",
    enrollment: "15,000+",
    image: "/assets/colleges/student-portrait-with-dog.jpg",
    esaPolicy: "Emory University supports students with mental health needs and allows ESAs in university-owned housing through their Office of Accessibility Services. Emory is committed to providing reasonable accommodations under the Fair Housing Act.",
    keyFacts: ["Full ESA support through Accessibility Services", "Documentation required from licensed professional", "Annual review process", "Owner responsible for pet hygiene and care", "ESA must be housebroken and manageable"],
    housingPolicy: "Emory students seeking ESA accommodations must register with the Office of Accessibility Services and provide appropriate documentation. Upon approval, students may keep their ESA in their assigned housing unit throughout the academic year.",
    applicationProcess: ["Register with Emory Office of Accessibility Services", "Submit ESA letter from licensed LMHP", "Complete housing accommodation request", "Await approval (5-7 business days)", "Coordinate with Residence Life before move-in"],
    allowedAreas: ["Student housing rooms", "Residence hall common spaces with approval"],
    restrictions: ["No access to Woodruff Library or academic spaces", "Must remain on Emory's residential campus boundaries"],
    faq: [
      { question: "Can first-year students at Emory have ESAs?", answer: "Yes. All students living in university housing are eligible to request ESA accommodations regardless of year." },
      { question: "How much does it cost to register an ESA at Emory?", answer: "There is no fee to register an ESA through Emory's Office of Accessibility Services." },
      { question: "What size animals are allowed as ESAs at Emory?", answer: "Emory does not impose breed or size restrictions on ESAs, as per Fair Housing Act guidelines." }
    ],
    metaTitle: "ESA Letter for Emory University Students | PawTenant",
    metaDesc: "Keep your emotional support animal in Emory University housing. Get a legitimate ESA letter from a licensed therapist. Fast, affordable, and guaranteed."
  },
  {
    slug: "vanderbilt",
    name: "Vanderbilt University",
    location: "Nashville, Tennessee",
    type: "Private Research University",
    enrollment: "13,000+",
    image: "/assets/lifestyle/woman-with-dog-new-apartment.jpg",
    esaPolicy: "Vanderbilt University accommodates ESAs in residential housing as required by the Fair Housing Act. Students apply through the Student Access office, and Vanderbilt reviews all requests with a student-centered approach.",
    keyFacts: ["ESA accommodations managed by Student Access office", "All requests reviewed individually", "Documentation from treating LMHP required", "No size or species restrictions per FHA", "Must be vaccinated and licensed per local laws"],
    housingPolicy: "Vanderbilt's Student Access team works closely with students who have mental health conditions that benefit from an ESA. Once accommodation is approved, students may bring their ESA to university residential housing for the approved period.",
    applicationProcess: ["Contact Vanderbilt Student Access for consultation", "Submit disability documentation with ESA letter", "Complete ESA housing accommodation request form", "Receive formal accommodation letter", "Provide copy to Residential Experience staff"],
    allowedAreas: ["Assigned residence hall room", "Designated outdoor areas around residence halls"],
    restrictions: ["Student Recreation Center off-limits", "Commons dining areas not accessible", "Cannot share ESA access with roommates"],
    faq: [
      { question: "Can Vanderbilt deny my ESA request?", answer: "Yes, if the ESA poses a direct threat to health or safety of others, causes significant property damage, or fundamentally alters the housing program." },
      { question: "Do I need to renew my ESA accommodation each year?", answer: "Yes. Vanderbilt requires annual renewal of ESA accommodations with updated documentation." },
      { question: "What breeds are allowed at Vanderbilt?", answer: "Vanderbilt does not restrict breeds for ESAs as this would violate Fair Housing Act guidelines." }
    ],
    metaTitle: "ESA Letter for Vanderbilt University Students | PawTenant",
    metaDesc: "Bring your emotional support animal to Vanderbilt University housing. Licensed ESA letters with same-day turnaround. 100% money-back guarantee with PawTenant."
  },
  {
    slug: "carnegie-mellon",
    name: "Carnegie Mellon University",
    location: "Pittsburgh, Pennsylvania",
    type: "Private Research University",
    enrollment: "15,000+",
    image: "/assets/lifestyle/owner-with-dog-laptop.jpg",
    esaPolicy: "Carnegie Mellon University supports student wellness and permits ESAs in campus housing through the Equal Opportunity Services office. CMU follows all applicable federal housing laws in reviewing accommodation requests.",
    keyFacts: ["ESAs supported through Equal Opportunity Services", "Required documentation from LMHP", "Approval before bringing ESA to campus", "Roommate consideration process", "Annual renewal required"],
    housingPolicy: "CMU students with documented mental health conditions may apply for ESA accommodations. The university evaluates whether the ESA provides therapeutic benefits related to the student's disability and whether housing accommodations are reasonable.",
    applicationProcess: ["Submit request through CMU Equal Opportunity Services portal", "Provide ESA letter from licensed mental health professional", "Complete the university ESA housing form", "Allow 7-10 days for review", "Sign ESA agreement before move-in"],
    allowedAreas: ["Assigned residence hall room", "Limited common areas as specified in approval"],
    restrictions: ["Engineering and computer science labs off-limits", "Hunt Library and other academic spaces restricted", "Campus fitness center not accessible"],
    faq: [
      { question: "Can I have an ESA in CMU off-campus housing?", answer: "If your landlord is subject to the Fair Housing Act (most are), they must consider your ESA request as a reasonable accommodation." },
      { question: "What mental health conditions qualify for ESA at CMU?", answer: "Any DSM-diagnosed mental health condition that substantially limits a major life activity may qualify, including anxiety, depression, PTSD, and more." },
      { question: "How quickly can I get ESA approval at CMU?", answer: "The review process typically takes 7-10 business days after all documentation is received." }
    ],
    metaTitle: "ESA Letter for Carnegie Mellon University Students | PawTenant",
    metaDesc: "Keep your emotional support animal in Carnegie Mellon housing. Fast, legitimate ESA letters from licensed professionals. Apply online with PawTenant today."
  },
  {
    slug: "rice",
    name: "Rice University",
    location: "Houston, Texas",
    type: "Private Research University",
    enrollment: "8,000+",
    image: "/assets/lifestyle/freelancer-with-dog-laptop.jpg",
    esaPolicy: "Rice University supports student mental health and recognizes ESAs as valid accommodations for students with documented disabilities living in campus residential colleges. All requests go through the Disability Support Services.",
    keyFacts: ["Residential college system accommodates ESAs", "Disability Support Services manages requests", "Documentation from treating professional required", "Each residential college may have specific protocols", "ESA must comply with local Houston ordinances"],
    housingPolicy: "Rice University's unique residential college system means ESA accommodations are coordinated between Disability Support Services and the individual residential college. Students typically have strong support from their college's residential team.",
    applicationProcess: ["Register with Rice Disability Support Services", "Submit comprehensive ESA letter", "Complete accommodation request form", "Residential college head provides housing approval", "Sign care and responsibility agreement"],
    allowedAreas: ["Student room within residential college", "Outdoor spaces of residential college"],
    restrictions: ["Fondren Library access restricted", "Dining facilities not permitted", "Academic quad buildings off-limits"],
    faq: [
      { question: "Does Rice's residential college system affect ESA approval?", answer: "Each residential college at Rice operates somewhat independently, but all follow university-wide ESA policies under Disability Support Services oversight." },
      { question: "Can I have an ESA as a first-year at Rice?", answer: "Yes. First-year students at Rice are eligible to apply for ESA accommodations just like all other students." },
      { question: "Are there additional fees for having an ESA at Rice?", answer: "Rice does not typically charge additional fees for approved ESA accommodations." }
    ],
    metaTitle: "ESA Letter for Rice University Students | PawTenant",
    metaDesc: "Bring your emotional support animal to Rice University housing. Get a licensed ESA letter fast with PawTenant's 100% money-back guarantee."
  },
  {
    slug: "dartmouth",
    name: "Dartmouth College",
    location: "Hanover, New Hampshire",
    type: "Private Ivy League University",
    enrollment: "6,500+",
    image: "/assets/lifestyle/woman-laptop-home.jpg",
    esaPolicy: "Dartmouth College recognizes the therapeutic importance of ESAs and allows approved animals in residential facilities. Student Accessibility Services coordinates all accommodation requests in compliance with the Fair Housing Act.",
    keyFacts: ["Student Accessibility Services manages ESA requests", "Ivy League commitment to disability accommodation", "Comprehensive review process", "Required annual renewal", "Documentation must be from treating LMHP"],
    housingPolicy: "At Dartmouth, students seeking ESA accommodations work with Student Accessibility Services to document their disability and the necessity of an ESA. Dartmouth values student wellbeing and processes requests thoughtfully and efficiently.",
    applicationProcess: ["Schedule intake appointment with Student Accessibility Services", "Submit ESA letter and supporting documentation", "Meet with accessibility coordinator", "Receive formal accommodation approval", "Coordinate with Residential Life for housing assignment"],
    allowedAreas: ["Assigned residential room", "Outdoor areas adjacent to residence halls"],
    restrictions: ["Baker-Berry Library and academic buildings restricted", "Foco and other dining facilities not permitted", "Athletic facilities off-limits"],
    faq: [
      { question: "Can I bring my ESA to Dartmouth's D-Plan off terms?", answer: "ESA accommodations are typically valid for terms when you are enrolled and living in campus housing." },
      { question: "How does Dartmouth handle roommate conflicts with ESAs?", answer: "Dartmouth works to find housing solutions that accommodate both the student with an ESA and their roommates' needs." },
      { question: "What documentation does Dartmouth require for ESA approval?", answer: "A letter from a licensed mental health professional familiar with your case, confirming diagnosis and therapeutic necessity of the ESA." }
    ],
    metaTitle: "ESA Letter for Dartmouth College Students | PawTenant",
    metaDesc: "Keep your emotional support animal in Dartmouth College housing. Licensed ESA letters from mental health professionals. Apply with PawTenant — fast and guaranteed."
  },
  {
    slug: "brown",
    name: "Brown University",
    location: "Providence, Rhode Island",
    type: "Private Ivy League University",
    enrollment: "10,000+",
    image: "/assets/lifestyle/woman-laptop-clean.jpg",
    esaPolicy: "Brown University is committed to supporting student mental health and wellness. ESA accommodations in residential housing are managed through Student and Employee Accessibility Services in accordance with the Fair Housing Act.",
    keyFacts: ["Student and Employee Accessibility Services manages requests", "Progressive and student-supportive approach", "Fair Housing Act compliance", "Documentation required from treating LMHP", "Reasonable accommodation standard applied"],
    housingPolicy: "Brown University's progressive culture extends to disability accommodations. Students with qualifying conditions can apply for ESA accommodations with support from the Accessibility Services team who take a collaborative approach to finding housing solutions.",
    applicationProcess: ["Register with Brown Student and Employee Accessibility Services", "Submit ESA letter from licensed professional", "Complete online accommodation request", "Participate in consultative review process", "Receive written approval letter"],
    allowedAreas: ["Assigned residence hall room", "Designated outdoor residential areas"],
    restrictions: ["Rockefeller Library and academic buildings off-limits", "Dining facilities not accessible", "Athletics complex restricted"],
    faq: [
      { question: "Does Brown University have a pet-friendly housing option?", answer: "Brown has ESA accommodations for students with qualifying disabilities. Standard pet policies are separate from ESA accommodations." },
      { question: "How does Brown define a disability for ESA purposes?", answer: "Any mental or physical impairment that substantially limits one or more major life activities may qualify." },
      { question: "Can I have multiple ESAs at Brown?", answer: "It's possible to have multiple ESAs if each serves a different therapeutic purpose, subject to review and approval." }
    ],
    metaTitle: "ESA Letter for Brown University Students | PawTenant",
    metaDesc: "Bring your emotional support animal to Brown University housing. Get a legitimate ESA letter from a licensed therapist through PawTenant. Same-day processing available."
  },
  {
    slug: "cornell",
    name: "Cornell University",
    location: "Ithaca, New York",
    type: "Private Ivy League University",
    enrollment: "25,000+",
    image: "/assets/lifestyle/woman-with-dog-office.jpg",
    esaPolicy: "Cornell University accommodates ESAs in residential housing through Student Disability Services. Cornell's mental health-forward approach means a supportive environment for students seeking ESA accommodations.",
    keyFacts: ["Student Disability Services processes requests", "Supports full spectrum of mental health conditions", "Documentation from LMHP required", "Annual renewal process", "North Campus and West Campus housing both eligible"],
    housingPolicy: "Cornell students with mental health conditions that substantially limit daily functioning may apply for ESA accommodations. Student Disability Services coordinates with University Housing to find the most suitable placement for students with approved ESAs.",
    applicationProcess: ["Register online with Cornell Student Disability Services", "Upload ESA letter from licensed LMHP", "Complete accommodation intake form", "Attend brief intake meeting if requested", "Receive housing accommodation confirmation"],
    allowedAreas: ["Assigned residential room on North or West campus", "Outdoor spaces adjacent to residence"],
    restrictions: ["Kroch Library and Olin Library off-limits", "Dining halls not accessible to ESAs", "Barton Hall and athletic facilities restricted"],
    faq: [
      { question: "Can Cornell students have ESAs in off-campus co-ops?", answer: "Cornell-affiliated co-ops are subject to Fair Housing Act requirements and generally must accommodate ESA requests." },
      { question: "What if my ESA is a rabbit or bird — is that okay at Cornell?", answer: "Cornell evaluates non-traditional animals on a case-by-case basis and does not outright prohibit them under FHA guidelines." },
      { question: "Does Cornell require veterinary records for ESA approval?", answer: "Cornell requires current vaccination records and licensing for your ESA as part of the approval process." }
    ],
    metaTitle: "ESA Letter for Cornell University Students | PawTenant",
    metaDesc: "Keep your emotional support animal in Cornell University housing. Licensed ESA letters from certified mental health professionals. Fast, legal, and guaranteed by PawTenant."
  },
  {
    slug: "johns-hopkins",
    name: "Johns Hopkins University",
    location: "Baltimore, Maryland",
    type: "Private Research University",
    enrollment: "24,000+",
    image: "/assets/blog/man-puppy-portrait.jpg",
    esaPolicy: "Johns Hopkins University supports student wellbeing and provides ESA accommodations in campus housing through the Student Disability Services office. Hopkins is committed to the health and success of all students.",
    keyFacts: ["Student Disability Services manages all ESA requests", "Documentation from treating LMHP required", "Annual renewal for continued accommodation", "Must comply with Baltimore city animal regulations", "Roommate accommodation considerations"],
    housingPolicy: "At Hopkins, students can apply for ESA accommodations through Student Disability Services. The office takes a collaborative and supportive approach, recognizing the significant role ESAs play in managing mental health conditions for many students.",
    applicationProcess: ["Contact Johns Hopkins Student Disability Services", "Submit ESA letter from licensed mental health professional", "Complete formal accommodation request", "Participate in review meeting if needed", "Receive housing accommodation approval letter"],
    allowedAreas: ["Assigned residence hall room", "Limited outdoor areas near your residence"],
    restrictions: ["Milton S. Eisenhower Library off-limits", "Dining facilities not accessible to ESAs", "Lacrosse, recreation center restricted"],
    faq: [
      { question: "How does Hopkins handle ESA requests for students in medical programs?", answer: "All Hopkins students, including those in medical programs, may apply for ESA accommodations in their residential housing." },
      { question: "Can my ESA be a cat at Johns Hopkins?", answer: "Yes. Cats are among the most commonly approved ESA species at Hopkins as they are manageable in a dorm setting." },
      { question: "What happens to my ESA accommodation if I change housing at Hopkins?", answer: "You'll need to update your accommodation to reflect your new housing assignment, which is typically a straightforward process." }
    ],
    metaTitle: "ESA Letter for Johns Hopkins University Students | PawTenant",
    metaDesc: "Bring your ESA to Johns Hopkins University housing. Get a licensed ESA letter from a mental health professional. Fast, guaranteed, and affordable with PawTenant."
  },
  {
    slug: "nyu",
    name: "New York University",
    location: "New York City, New York",
    type: "Private Research University",
    enrollment: "60,000+",
    image: "/assets/blog/freelancer-cat-desk.jpg",
    esaPolicy: "NYU accommodates ESAs in residential housing and is particularly supportive given the stressors of living in New York City. The Moses Center for Student Accessibility coordinates all ESA requests.",
    keyFacts: ["Moses Center for Student Accessibility manages requests", "NYC-specific animal regulations apply", "Documentation from licensed LMHP required", "Multiple housing locations across NYC eligible", "Renewing annually required"],
    housingPolicy: "At NYU, where the fast pace of New York can amplify stress and mental health challenges, the university recognizes the important role ESAs play. Students in any NYU residential facility across Manhattan, Brooklyn, or other locations may apply for ESA accommodations.",
    applicationProcess: ["Register with NYU Moses Center for Student Accessibility", "Submit current ESA letter from licensed professional", "Complete online accommodation request form", "Await approval (7-14 business days)", "Coordinate with NYU Housing to update your assignment"],
    allowedAreas: ["Assigned residential room across all NYU properties", "Outdoor residential areas and courtyards"],
    restrictions: ["Bobst Library and academic buildings restricted", "NYU dining halls not accessible to ESAs", "Athletic and recreation center off-limits"],
    faq: [
      { question: "Does NYU allow ESAs in their off-campus housing partnerships?", answer: "NYU has partnerships with many off-campus housing providers in NYC who are subject to NYC and federal Fair Housing laws." },
      { question: "What NYC laws apply to my ESA at NYU?", answer: "NYC has strong tenant protections for ESAs and service animals. Local laws often supplement federal FHA protections." },
      { question: "Can I have a dog as an ESA at NYU?", answer: "Yes, dogs are permitted as ESAs at NYU with proper documentation and approval through the Moses Center." }
    ],
    metaTitle: "ESA Letter for NYU Students | PawTenant",
    metaDesc: "Bring your emotional support animal to NYU housing in New York City. Licensed ESA letters, fast processing, and 100% money-back guarantee. Apply with PawTenant."
  },
  {
    slug: "ucla",
    name: "UCLA",
    location: "Los Angeles, California",
    type: "Public Research University",
    enrollment: "47,000+",
    image: "/assets/blog/woman-looking-dog.jpg",
    esaPolicy: "UCLA supports students with disabilities through the Center for Accessible Education and permits ESAs in on-campus housing in compliance with the Fair Housing Act and California's Unruh Civil Rights Act, which provides additional protections.",
    keyFacts: ["Center for Accessible Education manages ESA requests", "California state law provides additional ESA protections", "Documentation from licensed California LMHP preferred", "Annual renewal required", "Strong mental health support ecosystem on campus"],
    housingPolicy: "UCLA's location in Los Angeles offers a vibrant but often stressful environment, making ESAs particularly valuable for many students. The Center for Accessible Education ensures that eligible students can maintain their ESAs in on-campus residential halls.",
    applicationProcess: ["Register with UCLA Center for Accessible Education", "Submit ESA letter from licensed mental health professional", "Complete online accommodation intake", "Review meeting with CAE counselor", "Receive approval and notify UCLA Housing"],
    allowedAreas: ["Assigned UCLA residential hall room", "Outdoor residential areas on the Hill"],
    restrictions: ["Powell Library and academic buildings off-limits", "Dining halls and restaurants restricted", "Recreational centers not accessible to ESAs"],
    faq: [
      { question: "Does California law give me extra ESA protections at UCLA?", answer: "Yes. California's Fair Employment and Housing Act and Unruh Civil Rights Act provide additional protections beyond federal FHA for ESA owners." },
      { question: "Can I have an ESA in UCLA's family housing?", answer: "UCLA family housing is subject to the same Fair Housing Act requirements, and ESA requests should be evaluated accordingly." },
      { question: "What if my UCLA landlord (off-campus) denies my ESA?", answer: "Under California law, landlords must engage in an interactive process and cannot flatly deny a reasonable ESA request. PawTenant can help." }
    ],
    metaTitle: "ESA Letter for UCLA Students | PawTenant",
    metaDesc: "Keep your emotional support animal in UCLA housing. California-compliant ESA letters from licensed professionals. Fast, affordable, and guaranteed with PawTenant."
  }
];

export const getCollegeBySlug = (slug: string): College | undefined => {
  return colleges.find((c) => c.slug === slug);
};
