export interface Doctor {
  id: string;
  name: string;
  title: string;
  role: string;
  bio: string;
  states: string[];
  highlights: string[];
  verificationUrl: string;
  image: string;
  /** Contact email used for auto-assignment. Must match the email in doctor_contacts / doctor_profiles table. */
  email: string;
  /** NPI number — if present, shows NPI Verified badge on listing and profile pages */
  npi_number?: string | null;
}

export interface StateOption {
  code: string;
  name: string;
}

export const DOCTORS: Doctor[] = [
  {
    id: "stephanie-white",
    name: "Stephanie White",
    title: "LCSW",
    role: "Licensed Clinical Social Worker",
    bio: "Dr. Stephanie White, PsyD, LCSW, DCSW, BCD, is a highly experienced clinical social worker and doctoral-level clinician specializing in psychotherapy across outpatient, inpatient, and telehealth settings. With advanced training in clinical psychology, she provides comprehensive mental health evaluations and personalized treatment for conditions such as anxiety, depression, and emotional distress. Dr. White is dedicated to helping individuals achieve improved well-being, greater self-sufficiency, and lasting positive change.",
    states: ["AL", "AK", "CA", "CO", "DE", "FL", "HI", "IA", "KS", "KY", "LA", "MT", "NE", "NJ", "ND", "OR", "VT", "WV", "WI", "WY"],
    highlights: ["LCSW", "Telehealth Evaluations", "Anxiety & Depression", "ESA Letters"],
    verificationUrl: "https://www.psychologytoday.com/us/therapists/dr-stephanie-white-llc-teletherapy-counseling-orange-ca/455389",
    image: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/cfe1efe9-7c1d-4acc-9798-42a4c9aad039_Stephanie-White-Headshot.jpg?v=d523cbd49203a682a9cc6fa99e562b5c",
    email: "swmagnet@gmail.com",
    npi_number: "1528423795",
  },
  {
    id: "robert-staaf",
    name: "Robert Staaf",
    title: "LCSW",
    role: "Board-Certified Clinical Social Worker",
    bio: "Robert Staaf, LCSW, is a licensed clinical therapist experienced in supporting individuals with anxiety, depression, and emotional challenges. He also conducts thorough evaluations for Emotional Support Animals (ESAs), helping clients access the support they need for improved mental well-being. Known for his approachable and compassionate style, Robert creates a safe, judgment-free space for meaningful growth.",
    states: ["AL", "AZ", "CO", "CT", "DC", "FL", "GA", "ID", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "MN", "MS", "MT", "NV", "NH", "NJ", "NM", "NC", "OH", "OK", "RI", "SC", "TX", "UT", "VT", "VA"],
    highlights: ["LCSW", "Multi-State Licensed", "Clinical Assessments", "Telehealth Consultations"],
    verificationUrl: "https://care.headway.co/providers/robert-staaf",
    image: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/e0b414a6-d63d-4fe7-a8e8-f82db9160fdb_Robert-Staaf-Headshot.jpg?v=5f0b2741caf3281ddebe8e6703050331",
    email: "robertstaaftherapy@gmail.com",
    npi_number: "1467172478",
  },
  {
    id: "lytara-garcia",
    name: "Lytara Garcia",
    title: "LCSW",
    role: "ESA Mental Health Specialist",
    bio: "Lytara Garcia is a licensed clinical social worker experienced in working with adults facing anxiety, depression, stress, and trauma. She uses an eclectic, client-centered approach, incorporating techniques like CBT, mindfulness, and solution-focused therapy to meet each individual's needs. Lytara is passionate about helping clients build emotional resilience, develop coping strategies, and move forward with confidence.",
    states: ["AZ", "CA", "FL", "ID", "NV", "TX", "UT"],
    highlights: ["LCSW", "Trauma-Informed Care", "ESA Assessments", "Telehealth Consultations"],
    verificationUrl: "https://www.psychologytoday.com/us/therapists/lytara-garcia-las-vegas-nv/1141768",
    image: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/6a22574e-ad61-4c41-a282-05e5b76a4bb4_Lytara-Garcia-Headshot.jpg?v=18513316cde17b7cc834734480508acf",
    email: "Lytara.garcia07@gmail.com",
    npi_number: "1386996213",
  },
  {
    id: "edna-lee",
    name: "Edna Lee",
    title: "LPC-S, LMHC",
    role: "Licensed Professional Counselor & Supervisor",
    bio: "Edna Lee is a Licensed Professional Counselor & Supervisor and Licensed Mental Health Counselor with over 20 years of experience helping individuals navigate anxiety, depression, trauma, and major life transitions. She takes a compassionate, results-oriented approach, combining evidence-based therapies like CBT, EMDR, and psychodynamic techniques to deliver meaningful, lasting change. Edna is dedicated to creating a safe, supportive space where clients feel heard, understood, and empowered.",
    states: ["NY", "TX", "WA"],
    highlights: ["LCSW", "Mood Disorders", "Housing Documentation", "Telehealth Consultations"],
    verificationUrl: "https://www.psychologytoday.com/us/therapists/edna-lee-brooklyn-ny/1561167",
    image: "https://storage.readdy-site.link/project_files/dfb46e5c-44ab-4c6d-87e4-adaf8c9bc491/8644522c-eb92-4e35-adfb-d2e0863b66b5_Edna-Doctor-Headshot.jpg?v=dbd70ad8e5a1a43b1d66af4ca86f2960",
    email: "edna_kwan@yahoo.com",
    npi_number: "1205029022",
  },
];

export const ALL_STATES: StateOption[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DC", name: "District of Columbia" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "IA", name: "Iowa" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "MA", name: "Massachusetts" },
  { code: "MD", name: "Maryland" },
  { code: "ME", name: "Maine" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MT", name: "Montana" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "NE", name: "Nebraska" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NV", name: "Nevada" },
  { code: "NY", name: "New York" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VA", name: "Virginia" },
  { code: "VT", name: "Vermont" },
  { code: "WA", name: "Washington" },
  { code: "WI", name: "Wisconsin" },
  { code: "WV", name: "West Virginia" },
  { code: "WY", name: "Wyoming" },
];

export const AVAILABLE_STATES: string[] = Array.from(
  new Set(DOCTORS.flatMap((d) => d.states))
).sort();

export const getPricingForPets = (petCount: number): number => {
  if (petCount === 1) return 100;
  if (petCount === 2) return 115;
  return 135;
};

export const getDoctorsForState = (stateCode: string): Doctor[] =>
  DOCTORS.filter((d) => d.states.includes(stateCode));
