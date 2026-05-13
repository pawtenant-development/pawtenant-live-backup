import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { getStateBySlug, usStates } from "../../mocks/states";
import { getStateBlogEntry } from "../../mocks/stateBlogMap";
import { blogPosts } from "../../mocks/blogPosts";
import PrivacySafeVerificationNote from "../../components/feature/PrivacySafeVerificationNote";
import { useAttributionParams } from "@/hooks/useAttributionParams";

// Universal fallback blog posts shown when no state-specific posts exist
const FALLBACK_BLOG_SLUGS = [
  "what-landlords-cannot-legally-do-esa",
  "how-to-get-esa-letter-from-doctor",
  "esa-housing-denial-rights-2026",
  "mental-health-conditions-qualify-esa-2026",
];

// ── Nearby states map (by slug) ───────────────────────────────────────────────
const NEARBY_STATES: Record<string, string[]> = {
  alabama: ["georgia", "florida", "tennessee", "mississippi"],
  alaska: ["washington", "oregon", "montana", "idaho"],
  arizona: ["california", "nevada", "utah", "new-mexico", "colorado"],
  arkansas: ["missouri", "tennessee", "mississippi", "louisiana", "oklahoma", "texas"],
  california: ["oregon", "nevada", "arizona"],
  colorado: ["utah", "wyoming", "nebraska", "kansas", "oklahoma", "new-mexico", "arizona"],
  connecticut: ["new-york", "rhode-island", "massachusetts"],
  delaware: ["maryland", "new-jersey", "pennsylvania"],
  florida: ["georgia", "alabama"],
  georgia: ["florida", "alabama", "tennessee", "north-carolina", "south-carolina"],
  hawaii: ["california", "alaska"],
  idaho: ["washington", "oregon", "nevada", "utah", "wyoming", "montana"],
  illinois: ["indiana", "iowa", "wisconsin", "missouri", "kentucky"],
  indiana: ["illinois", "ohio", "michigan", "kentucky"],
  iowa: ["illinois", "wisconsin", "minnesota", "south-dakota", "nebraska", "missouri"],
  kansas: ["colorado", "nebraska", "missouri", "oklahoma"],
  kentucky: ["indiana", "ohio", "west-virginia", "virginia", "tennessee", "missouri"],
  louisiana: ["texas", "arkansas", "mississippi"],
  maine: ["new-hampshire", "vermont"],
  maryland: ["virginia", "west-virginia", "pennsylvania", "delaware"],
  massachusetts: ["connecticut", "rhode-island", "new-york", "vermont", "new-hampshire"],
  michigan: ["indiana", "ohio", "wisconsin"],
  minnesota: ["iowa", "wisconsin", "south-dakota", "north-dakota"],
  mississippi: ["louisiana", "arkansas", "tennessee", "alabama"],
  missouri: ["iowa", "illinois", "kentucky", "tennessee", "arkansas", "oklahoma", "kansas", "nebraska"],
  montana: ["idaho", "wyoming", "north-dakota", "south-dakota"],
  nebraska: ["iowa", "south-dakota", "wyoming", "colorado", "kansas", "missouri"],
  nevada: ["california", "oregon", "idaho", "utah", "arizona"],
  "new-hampshire": ["maine", "vermont", "massachusetts"],
  "new-jersey": ["new-york", "pennsylvania", "delaware"],
  "new-mexico": ["colorado", "utah", "arizona", "texas", "oklahoma"],
  "new-york": ["connecticut", "massachusetts", "vermont", "new-jersey", "pennsylvania"],
  "north-carolina": ["virginia", "tennessee", "georgia", "south-carolina"],
  "north-dakota": ["minnesota", "south-dakota", "montana"],
  ohio: ["indiana", "michigan", "pennsylvania", "west-virginia", "kentucky"],
  oklahoma: ["kansas", "colorado", "new-mexico", "texas", "arkansas", "missouri"],
  oregon: ["washington", "idaho", "nevada", "california"],
  pennsylvania: ["new-york", "new-jersey", "delaware", "maryland", "west-virginia", "ohio"],
  "rhode-island": ["connecticut", "massachusetts"],
  "south-carolina": ["north-carolina", "georgia"],
  "south-dakota": ["north-dakota", "minnesota", "iowa", "nebraska", "wyoming", "montana"],
  tennessee: ["kentucky", "virginia", "north-carolina", "georgia", "alabama", "mississippi", "arkansas", "missouri"],
  texas: ["new-mexico", "oklahoma", "arkansas", "louisiana"],
  utah: ["idaho", "wyoming", "colorado", "new-mexico", "arizona", "nevada"],
  vermont: ["new-york", "new-hampshire", "massachusetts", "maine"],
  virginia: ["maryland", "west-virginia", "kentucky", "tennessee", "north-carolina"],
  washington: ["oregon", "idaho"],
  "washington-dc": ["maryland", "virginia"],
  "west-virginia": ["ohio", "pennsylvania", "maryland", "virginia", "kentucky"],
  wisconsin: ["minnesota", "iowa", "illinois", "michigan"],
  wyoming: ["montana", "south-dakota", "nebraska", "colorado", "utah", "idaho"],
};

// ── Per-state custom meta titles & descriptions ───────────────────────────────
// Keyed by state slug. Falls back to generic template for unlisted states.
const STATE_META: Record<string, { title: string; desc: string }> = {
  alabama: {
    title: "ESA Letter Alabama | Licensed LMHP | PawTenant",
    desc: "Get a legitimate ESA letter in Alabama from a state-licensed mental health professional. Protect your housing rights under the Fair Housing Act.",
  },
  alaska: {
    title: "ESA Letter Alaska | Valid for Housing | PawTenant",
    desc: "Need an ESA letter in Alaska? Connect with a licensed LMHP and receive valid ESA documentation for housing. HIPAA-secure, fully compliant with Alaska law.",
  },
  arizona: {
    title: "ESA Letter Arizona | Licensed Professionals | PawTenant",
    desc: "Get a legitimate ESA letter in Arizona. Our licensed mental health professionals evaluate your needs and issue housing-compliant ESA documentation fast.",
  },
  arkansas: {
    title: "ESA Letter Arkansas | 30-Day Rule Explained | PawTenant",
    desc: "Arkansas requires a 30-day provider relationship before an ESA letter can be issued. PawTenant connects you with licensed Arkansas LMHPs.",
  },
  california: {
    title: "ESA Letter California | CA-Licensed Therapists | PawTenant",
    desc: "Get a legitimate ESA letter in California from a state-licensed therapist. California law requires a 30-day relationship. PawTenant ensures full compliance.",
  },
  colorado: {
    title: "ESA Letter Colorado | Valid for Housing | PawTenant",
    desc: "Get a legitimate ESA letter in Colorado from a licensed mental health professional. No waiting period. Housing-compliant documentation delivered digitally.",
  },
  connecticut: {
    title: "ESA Letter Connecticut | Licensed LMHP | PawTenant",
    desc: "Need an ESA letter in Connecticut? PawTenant connects you with state-licensed professionals for a proper evaluation. Receive valid ESA letter fast.",
  },
  delaware: {
    title: "ESA Letter Delaware | Housing-Compliant | PawTenant",
    desc: "Get your ESA letter in Delaware from a licensed mental health professional. PawTenant ensures your documentation is FHA-compliant.",
  },
  florida: {
    title: "ESA Letter Florida | Legitimate & Legal | PawTenant",
    desc: "Get a legitimate ESA letter in Florida from a licensed LMHP. Florida penalizes fake ESA letters. PawTenant ensures every letter is issued through a proper evaluation.",
  },
  georgia: {
    title: "ESA Letter Georgia | Licensed Therapists | PawTenant",
    desc: "Need an ESA letter in Georgia? Connect with a state-licensed mental health professional through PawTenant. Valid for housing under the Fair Housing Act.",
  },
  hawaii: {
    title: "ESA Letter Hawaii | Valid Housing Documentation | PawTenant",
    desc: "Get a legitimate ESA letter in Hawaii from a licensed LMHP. PawTenant provides housing-compliant ESA documentation valid across all Hawaii housing types.",
  },
  idaho: {
    title: "ESA Letter Idaho | Licensed Professionals | PawTenant",
    desc: "Receive your ESA letter in Idaho from a state-licensed mental health professional. PawTenant ensures full FHA compliance so your landlord recognizes your letter.",
  },
  illinois: {
    title: "ESA Letter Illinois | Verify Your LMHP | PawTenant",
    desc: "Landlords may verify your LMHP's license before accepting an ESA letter in Illinois. PawTenant only works with fully verifiable, state-licensed professionals.",
  },
  indiana: {
    title: "ESA Letter Indiana | Fast & Compliant | PawTenant",
    desc: "Get an ESA letter in Indiana from a licensed mental health professional. PawTenant's process is fast, HIPAA-secure, and fully compliant with Indiana housing law.",
  },
  iowa: {
    title: "ESA Letter Iowa | 30-Day Rule | Licensed LMHP | PawTenant",
    desc: "Iowa requires a 30-day relationship with your LMHP before issuing an ESA letter. PawTenant helps you start the process early so it takes less time.",
  },
  kansas: {
    title: "ESA Letter Kansas | Housing Rights | PawTenant",
    desc: "Get a legitimate ESA letter in Kansas from a licensed professional. PawTenant ensures your ESA documentation protects your housing rights.",
  },
  kentucky: {
    title: "ESA Letter Kentucky | Licensed & Legitimate | PawTenant",
    desc: "Need an ESA letter in Kentucky? PawTenant connects you with a state-licensed LMHP for a thorough evaluation and delivers your ESA letter digitally.",
  },
  louisiana: {
    title: "ESA Letter Louisiana | Protect Your Housing Rights | PawTenant",
    desc: "Get a legitimate ESA letter in Louisiana. PawTenant works with licensed Louisiana mental health professionals to issue FHA-compliant documentation.",
  },
  maine: {
    title: "ESA Letter Maine | Valid for Housing | PawTenant",
    desc: "Get your ESA letter in Maine from a licensed mental health professional. PawTenant ensures your letter meets FHA standards so landlords accept it statewide.",
  },
  maryland: {
    title: "ESA Letter Maryland | Licensed Therapists | PawTenant",
    desc: "Get your ESA letter in Maryland from a state-licensed LMHP. PawTenant's housing-compliant ESA letter protects you from unfair pet fees and no-pet policies.",
  },
  massachusetts: {
    title: "ESA Letter Massachusetts | Legitimate & Fast | PawTenant",
    desc: "Need an ESA letter in Massachusetts? PawTenant connects you with licensed MA mental health professionals for a compliant evaluation.",
  },
  michigan: {
    title: "ESA Letter Michigan | Licensed LMHP | PawTenant",
    desc: "Get a legitimate ESA letter in Michigan from an LMHP. PawTenant provides fast, housing-compliant ESA documentation valid across all of Michigan.",
  },
  minnesota: {
    title: "ESA Letter Minnesota | Housing Compliant | PawTenant",
    desc: "Receive a legitimate ESA letter in Minnesota from a state-licensed LMHP. PawTenant ensures full compliance with FHA so your ESA letter is accepted easily.",
  },
  mississippi: {
    title: "ESA Letter Mississippi | Valid for Housing | PawTenant",
    desc: "Get your ESA letter in Mississippi from a licensed mental health professional. PawTenant delivers HIPAA-secure, FHA-compliant documentation. Apply online.",
  },
  missouri: {
    title: "ESA Letter Missouri | Licensed Professionals | PawTenant",
    desc: "Need an ESA letter in Missouri? PawTenant connects you with state-licensed LMHPs for evaluation and fast digital delivery. Housing-compliant and FHA-valid.",
  },
  montana: {
    title: "ESA Letter Montana | Legitimate & Compliant | PawTenant",
    desc: "Get a legitimate ESA letter in Montana from a licensed LMHP. PawTenant ensures your letter protects your housing rights under the Fair Housing Act statewide.",
  },
  nebraska: {
    title: "ESA Letter Nebraska | Housing Rights | PawTenant",
    desc: "Receive a legitimate ESA letter in Nebraska from a licensed professional. PawTenant's process is compliant with Nebraska and federal housing requirements.",
  },
  nevada: {
    title: "ESA Letter Nevada | Licensed LMHP | PawTenant",
    desc: "Get your ESA letter in Nevada from a state-licensed mental health professional. PawTenant ensures FHA-compliant letter so landlords accept it easily.",
  },
  "new-hampshire": {
    title: "ESA Letter New Hampshire | Fast & Legitimate | PawTenant",
    desc: "Need an ESA letter in New Hampshire? PawTenant connects you with a licensed NH LMHP for a proper evaluation. Receive ESA letter within 24–48 hours.",
  },
  "new-jersey": {
    title: "ESA Letter New Jersey | Verify Your Provider | PawTenant",
    desc: "Landlords may verify your provider's license before accepting an ESA letter in New Jersey. PawTenant only uses verifiable, state-licensed NJ professionals.",
  },
  "new-mexico": {
    title: "ESA Letter New Mexico | Licensed Therapists | PawTenant",
    desc: "Get a legitimate ESA letter in New Mexico from an LMHP. PawTenant provides housing-compliant ESA letter that protects your rights as a tenant in NM.",
  },
  "new-york": {
    title: "ESA Letter New York | Licensed NY Therapist | PawTenant",
    desc: "New York landlords are encouraged to verify LMHP license status. PawTenant works only with verifiable NY-licensed professionals. Get your ESA letter today.",
  },
  "north-carolina": {
    title: "ESA Letter North Carolina | Housing Compliant | PawTenant",
    desc: "Get a legitimate ESA letter in North Carolina from an LMHP. PawTenant ensures FHA-compliant documentation so you can live with your ESA easily.",
  },
  "north-dakota": {
    title: "ESA Letter North Dakota | Legitimate & Fast | PawTenant",
    desc: "Receive a legitimate ESA letter in North Dakota from a licensed mental health professional. PawTenant delivers housing-compliant ESA letter. Apply now.",
  },
  ohio: {
    title: "ESA Letter Ohio | Licensed LMHP | PawTenant",
    desc: "Get your ESA letter in Ohio from a state-licensed LMHP. PawTenant ensures your letter is FHA-compliant and accepted by Ohio landlords. Apply today.",
  },
  oklahoma: {
    title: "ESA Letter Oklahoma | Valid for Housing | PawTenant",
    desc: "Get a legitimate ESA letter in Oklahoma from a licensed LMHP. PawTenant follows FHA and Oklahoma law to issue ESA letter. Apply online in minutes.",
  },
  oregon: {
    title: "ESA Letter Oregon | Licensed Professionals | PawTenant",
    desc: "Need an ESA letter in Oregon? PawTenant connects you with a state-licensed LMHP for a proper evaluation. Receive valid, FHA-compliant ESA documentation.",
  },
  pennsylvania: {
    title: "ESA Letter Pennsylvania | Licensed Therapists | PawTenant",
    desc: "Get a legitimate ESA letter in Pennsylvania from an LMHP. PawTenant delivers housing-compliant documentation accepted by PA landlords. Apply now.",
  },
  "rhode-island": {
    title: "ESA Letter Rhode Island | Fast & Compliant | PawTenant",
    desc: "Receive your ESA letter in Rhode Island from a state-licensed LMHP. PawTenant ensures fully compliant ESA letter that protects your housing rights in RI.",
  },
  "south-carolina": {
    title: "ESA Letter South Carolina | Housing Rights | PawTenant",
    desc: "Get a legitimate ESA letter in South Carolina from a licensed mental health professional. PawTenant ensures FHA-compliant documentation.",
  },
  "south-dakota": {
    title: "ESA Letter South Dakota | Licensed LMHP | PawTenant",
    desc: "Need an ESA letter in South Dakota? PawTenant connects you with a licensed SD professional for a proper evaluation. Apply now.",
  },
  tennessee: {
    title: "ESA Letter Tennessee | Legitimate & Legal | PawTenant",
    desc: "Get a legitimate ESA letter in Tennessee from a licensed LMHP. PawTenant ensures your letter meets FHA standards so you can live with your ESA easily.",
  },
  texas: {
    title: "ESA Letter Texas | TX-Licensed Professionals | PawTenant",
    desc: "Get a legitimate ESA letter in Texas from a state-licensed mental health professional. No waiting period in TX. Housing-compliant and digitally delivered.",
  },
  utah: {
    title: "ESA Letter Utah | Valid for Housing | PawTenant",
    desc: "Receive a legitimate ESA letter in Utah from a licensed LMHP. PawTenant ensures your documentation is fully FHA-compliant and accepted by Utah landlords.",
  },
  vermont: {
    title: "ESA Letter Vermont | Licensed & Compliant | PawTenant",
    desc: "Get your ESA letter in Vermont from a state-licensed mental health professional. PawTenant delivers ESA documentation fast and securely. Apply today.",
  },
  virginia: {
    title: "ESA Letter Virginia | Licensed Therapists | PawTenant",
    desc: "Need an ESA letter in Virginia? PawTenant connects you with a licensed VA LMHP. Receive valid, FHA-compliant ESA documentation within 24–48 hours.",
  },
  washington: {
    title: "ESA Letter Washington State | Licensed LMHP | PawTenant",
    desc: "Get a legitimate ESA letter in Washington State. PawTenant works with licensed WA mental health professionals to issue FHA-compliant documentation.",
  },
  "washington-dc": {
    title: "ESA Letter Washington DC | Housing Compliant | PawTenant",
    desc: "Get a legitimate ESA letter in Washington DC from a licensed LMHP. PawTenant ensures full FHA compliance so your ESA letter is accepted easily. Apply now.",
  },
  "west-virginia": {
    title: "ESA Letter West Virginia | Fast & Legitimate | PawTenant",
    desc: "Receive your ESA letter in West Virginia from a licensed LMHP. PawTenant ensures FHA-compliant ESA documentation delivered digitally. Apply today.",
  },
  wisconsin: {
    title: "ESA Letter Wisconsin | Licensed Professionals | PawTenant",
    desc: "Get a legitimate ESA letter in Wisconsin from a licensed LMHP. PawTenant delivers fast, housing-compliant ESA letter accepted statewide. Apply now.",
  },
  wyoming: {
    title: "ESA Letter Wyoming | Valid for Housing | PawTenant",
    desc: "Need an ESA letter in Wyoming? PawTenant connects you with a state-licensed professional for a proper evaluation. FHA-compliant ESA letter delivered fast.",
  },
};

// ── State-specific image themes ───────────────────────────────────────────────
// Each state gets a unique visual environment so pages look distinct
const STATE_IMAGE_THEMES: Record<string, {
  hero: string;       // hero background scene
  petScene: string;   // person + pet at home scene
  catScene: string;   // cat/wellness scene
  telehealth: string; // telehealth scene
  petBreed: string;   // specific breed for variety
}> = {
  TX: {
    hero: "warm Texas ranch style home interior with wooden beams and leather furniture, golden afternoon sunlight, a happy husky dog sitting beside owner on a rustic sofa, cozy southwestern decor, warm amber tones",
    petScene: "person relaxing on a porch in Texas with their husky dog, wide open sky, warm golden hour light, ranch style home, peaceful outdoor setting",
    catScene: "woman sitting in a bright Texas home with her tabby cat on her lap, warm sunlight through large windows, southwestern decor, relaxed and happy",
    telehealth: "person doing telehealth video call on laptop at a Texas ranch style home desk, warm wood tones, dog resting nearby, professional and cozy",
    petBreed: "husky",
  },
  CA: {
    hero: "modern California coastal home interior with ocean view windows, bright natural light, a golden retriever dog sitting beside owner on a white linen sofa, minimalist decor, warm cream tones",
    petScene: "person with their golden retriever dog in a bright California apartment, large windows with city view, modern minimalist interior, warm natural light",
    catScene: "woman in a sunny California home with her cat on her lap, plants everywhere, bright airy interior, relaxed and peaceful, coastal vibes",
    telehealth: "person doing telehealth consultation on laptop in a modern California home office, ocean light, dog nearby, clean minimalist setting",
    petBreed: "golden retriever",
  },
  FL: {
    hero: "bright Florida home interior with tropical plants and large windows, warm humid sunlight, a friendly labrador dog sitting beside owner on a light sofa, coastal decor, warm cream and white tones",
    petScene: "person with their labrador dog relaxing in a Florida home, tropical plants, bright warm sunlight, coastal interior, happy and peaceful",
    catScene: "woman in a bright Florida apartment with her cat, tropical plants in background, warm sunlight, relaxed and happy, coastal home vibes",
    telehealth: "person doing telehealth video call on laptop in a Florida home, tropical plants visible, dog nearby, bright warm setting",
    petBreed: "labrador",
  },
  NY: {
    hero: "modern New York City apartment interior with large windows showing city skyline, warm evening light, a french bulldog sitting beside owner on a modern sofa, urban chic decor, warm neutral tones",
    petScene: "person with their french bulldog in a New York City apartment, city skyline visible through large windows, modern urban interior, warm evening light",
    catScene: "woman in a New York apartment with her cat on her lap, city view through windows, modern urban decor, cozy and relaxed",
    telehealth: "person doing telehealth consultation on laptop in a New York City apartment, city skyline in background, dog nearby, modern urban setting",
    petBreed: "french bulldog",
  },
  IL: {
    hero: "cozy Chicago style apartment interior with brick walls and warm lighting, a border collie dog sitting beside owner on a comfortable sofa, urban industrial chic decor, warm amber tones",
    petScene: "person with their border collie dog in a Chicago apartment, brick walls, warm lighting, urban cozy interior, happy and relaxed",
    catScene: "woman in a Chicago apartment with her cat, brick wall background, warm cozy lighting, relaxed and happy",
    telehealth: "person doing telehealth video call on laptop in a Chicago apartment, brick walls, dog nearby, warm cozy setting",
    petBreed: "border collie",
  },
  WA: {
    hero: "Pacific Northwest home interior with large windows showing pine trees and mountains, soft rainy day light, a husky dog sitting beside owner on a cozy sofa, natural wood decor, cool green tones",
    petScene: "person with their husky dog in a Pacific Northwest home, pine trees visible through windows, natural wood interior, soft natural light",
    catScene: "woman in a Seattle home with her cat, pine trees visible outside, natural wood decor, cozy rainy day atmosphere",
    telehealth: "person doing telehealth consultation on laptop in a Pacific Northwest home, pine trees outside, dog nearby, natural wood setting",
    petBreed: "husky",
  },
  CO: {
    hero: "Colorado mountain home interior with exposed wood beams and stone fireplace, warm golden light, a golden retriever dog sitting beside owner on a rustic sofa, mountain lodge decor, warm amber tones",
    petScene: "person with their golden retriever dog in a Colorado mountain home, stone fireplace, warm wood interior, cozy mountain lodge atmosphere",
    catScene: "woman in a Colorado mountain cabin with her cat, stone fireplace, warm wood decor, cozy and relaxed",
    telehealth: "person doing telehealth video call on laptop in a Colorado mountain home, stone fireplace, dog nearby, warm rustic setting",
    petBreed: "golden retriever",
  },
  AZ: {
    hero: "Arizona desert modern home interior with terracotta tiles and cacti through windows, warm desert sunlight, a pitbull dog sitting beside owner on a modern sofa, southwestern decor, warm terracotta tones",
    petScene: "person with their pitbull dog relaxing in an Arizona desert home, cacti visible through windows, southwestern decor, warm desert light",
    catScene: "woman in an Arizona home with her cat, desert plants visible, warm terracotta decor, relaxed and happy",
    telehealth: "person doing telehealth consultation on laptop in an Arizona desert home, cacti outside, dog nearby, warm southwestern setting",
    petBreed: "pitbull",
  },
  GA: {
    hero: "Southern Georgia home interior with wrap-around porch visible through windows, warm humid sunlight, a beagle dog sitting beside owner on a comfortable sofa, southern charm decor, warm cream tones",
    petScene: "person with their beagle dog on a Georgia porch, southern style home, warm afternoon light, lush green yard visible",
    catScene: "woman in a Georgia home with her cat, southern style decor, warm sunlight, relaxed and happy",
    telehealth: "person doing telehealth video call on laptop in a Georgia home, southern style interior, dog nearby, warm comfortable setting",
    petBreed: "beagle",
  },
  PA: {
    hero: "Pennsylvania colonial style home interior with hardwood floors and warm fireplace, autumn light through windows, a labrador dog sitting beside owner on a classic sofa, traditional decor, warm amber tones",
    petScene: "person with their labrador dog in a Pennsylvania home, hardwood floors, warm fireplace, traditional interior, cozy autumn atmosphere",
    catScene: "woman in a Pennsylvania home with her cat, hardwood floors, warm fireplace, traditional decor, cozy and relaxed",
    telehealth: "person doing telehealth consultation on laptop in a Pennsylvania home, hardwood floors, dog nearby, warm traditional setting",
    petBreed: "labrador",
  },
  OH: {
    hero: "Ohio suburban home interior with large backyard visible through windows, warm afternoon sunlight, a golden retriever dog sitting beside owner on a comfortable sofa, classic American home decor, warm cream tones",
    petScene: "person with their golden retriever dog in an Ohio suburban home, large backyard visible, warm afternoon light, classic American interior",
    catScene: "woman in an Ohio home with her cat, suburban backyard visible, warm sunlight, relaxed and happy",
    telehealth: "person doing telehealth video call on laptop in an Ohio suburban home, backyard visible, dog nearby, warm comfortable setting",
    petBreed: "golden retriever",
  },
  NC: {
    hero: "North Carolina craftsman home interior with mountain views through windows, warm natural light, a poodle dog sitting beside owner on a comfortable sofa, craftsman decor, warm wood tones",
    petScene: "person with their poodle dog in a North Carolina craftsman home, mountain views, warm natural light, craftsman interior",
    catScene: "woman in a North Carolina home with her cat, mountain views through windows, craftsman decor, relaxed and happy",
    telehealth: "person doing telehealth consultation on laptop in a North Carolina home, mountain views, dog nearby, warm craftsman setting",
    petBreed: "poodle",
  },
  MI: {
    hero: "Michigan lakeside home interior with lake views through large windows, soft natural light, a husky dog sitting beside owner on a comfortable sofa, lake house decor, cool blue and warm wood tones",
    petScene: "person with their husky dog in a Michigan lake house, lake views through windows, natural wood interior, soft natural light",
    catScene: "woman in a Michigan lake house with her cat, lake views, natural wood decor, relaxed and peaceful",
    telehealth: "person doing telehealth video call on laptop in a Michigan lake house, lake views, dog nearby, natural wood setting",
    petBreed: "husky",
  },
  TN: {
    hero: "Tennessee farmhouse interior with exposed wood beams and country decor, warm golden light, a golden retriever dog sitting beside owner on a farmhouse sofa, country charm decor, warm amber tones",
    petScene: "person with their golden retriever dog in a Tennessee farmhouse, exposed wood beams, warm golden light, country interior",
    catScene: "woman in a Tennessee farmhouse with her cat, exposed wood beams, warm country decor, relaxed and happy",
    telehealth: "person doing telehealth consultation on laptop in a Tennessee farmhouse, wood beams, dog nearby, warm country setting",
    petBreed: "golden retriever",
  },
  MN: {
    hero: "Minnesota Scandinavian style home interior with snow visible through windows, warm cozy lighting, a husky dog sitting beside owner on a comfortable sofa, hygge decor, warm cream and wood tones",
    petScene: "person with their husky dog in a Minnesota home, snow visible outside, warm cozy interior, Scandinavian hygge atmosphere",
    catScene: "woman in a Minnesota home with her cat, snow outside, warm cozy decor, relaxed and happy",
    telehealth: "person doing telehealth video call on laptop in a Minnesota home, snow outside, dog nearby, warm cozy setting",
    petBreed: "husky",
  },
  OR: {
    hero: "Oregon Pacific Northwest home interior with forest views through large windows, soft green natural light, a border collie dog sitting beside owner on a modern sofa, eco-modern decor, cool green and wood tones",
    petScene: "person with their border collie dog in an Oregon home, forest views through windows, eco-modern interior, soft natural light",
    catScene: "woman in an Oregon home with her cat, forest views, eco-modern decor, relaxed and peaceful",
    telehealth: "person doing telehealth consultation on laptop in an Oregon home, forest views, dog nearby, eco-modern setting",
    petBreed: "border collie",
  },
};

// Default theme for states without specific themes
const DEFAULT_THEME = {
  hero: "cozy modern home interior with warm natural light, a happy dog sitting beside owner on a comfortable sofa, warm cream and beige tones, lifestyle photography",
  petScene: "person with their dog relaxing at home, bright living room, warm sunlight, cozy atmosphere, pet owner calm and peaceful modern home interior",
  catScene: "woman smiling with her cat on her lap in a bright cozy apartment, looking relaxed and happy, warm tones, plants in background, emotional wellness",
  telehealth: "telehealth consultation doctor on laptop screen patient at home with their dog nearby, warm home setting, online mental health appointment, modern technology cozy and professional",
  petBreed: "mixed breed dog",
};

function getStateTheme(abbreviation: string) {
  return STATE_IMAGE_THEMES[abbreviation] ?? DEFAULT_THEME;
}

// ─────────────────────────────────────────────────────────────────────────────

const whyPawtenant = [
  { title: "Experienced Professionals You Can Trust", desc: "Our licensed team knows state and has years of experience providing ESA letters that meet all legal standards.", icon: "ri-shield-check-line" },
  { title: "A Support Team That Cares", desc: "We are here to help you every step of the way from setting up your appointment to making sure your ESA letter is legally valid.", icon: "ri-heart-line" },
  { title: "Available Across the State", desc: "No matter where you are in the state, we have licensed professionals ready to assist in your area.", icon: "ri-map-pin-line" },
  { title: "Honest and Lawful Process", desc: "All evaluations follow all legal rules. We only issue ESA letters after a proper mental health review — no shortcuts.", icon: "ri-scales-line" },
  { title: "Quick and Safe Delivery", desc: "Once your letter is approved, we will send it to you digitally. It is fast, secure, and ready to use right away.", icon: "ri-send-plane-line" },
];

// Scalable housing-intent FAQ cluster — applied to every state page after
// the per-state FAQ list. Each item is keyed to a different long-tail
// intent (provider-in-state, landlord verification, ESA application
// process, valid documentation / scam avoidance, renewal). The `{state}`
// token is substituted at render time by `materializeCommonFaqs`, so the
// surface vocabulary varies per state without manual per-state authoring.
//
// Duplicate-content safety: each state page already has unique upstream
// content (per-state lawsSummary, lawsBullets, advantages, faqs, blog
// posts, nearby states). These shared housing-intent FAQs are dynamically
// state-parameterized and address universal housing questions that
// legitimately apply to all states — equivalent to common help content,
// not boilerplate keyword spam.
const COMMON_HOUSING_FAQS: { q: string; a: string }[] = [
  {
    q: "Does my ESA letter need to be issued by a provider licensed in {state}?",
    a: "For housing accommodation purposes, ESA documentation should be issued by a Licensed Mental Health Practitioner credentialed in the state where you live, including {state}. PawTenant matches every assessment with a provider who holds an active license in your state — which is exactly what landlords look for during verification.",
  },
  {
    q: "How do landlords in {state} verify an ESA letter?",
    a: "Every finalized PawTenant letter includes a unique Verification ID along with the provider's full name, license number, and NPI. A {state} landlord can confirm authenticity at pawtenant.com/verify or independently check the provider's credentials on the public NPPES NPI registry. Verification confirms authenticity only — no diagnosis, treatment history, or clinical detail is ever exposed.",
  },
  {
    q: "How long does the ESA letter application process take in {state}?",
    a: "The clinical assessment takes about five minutes on your phone. A {state}-credentialed Licensed Mental Health Practitioner typically reviews each case within 24 hours. If you qualify, you receive your housing-focused ESA documentation as a secure PDF the same day. If you do not qualify after review, your payment is refunded — there is no charge for an evaluation that does not result in a letter.",
  },
  {
    q: "What should a valid {state} ESA letter include?",
    a: "A valid {state} ESA letter is signed by a Licensed Mental Health Practitioner credentialed in your state and prints the provider's full name, license number, NPI, signature, and the issue and expiration dates. PawTenant letters also carry a unique Verification ID landlords can confirm directly. Services that promise instant approval, guaranteed letters, or skip the clinical review are not legitimate — and landlords have learned to spot them.",
  },
  {
    q: "Can I renew my ESA letter for housing in {state}?",
    a: "Yes. ESA letters are typically valid for one year, and most landlords ask for documentation issued within the past twelve months. PawTenant supports annual renewal in {state} through the same short clinical assessment and Licensed Mental Health Practitioner review, so your housing accommodation request stays current.",
  },
];

function materializeCommonFaqs(stateName: string) {
  return COMMON_HOUSING_FAQS.map(({ q, a }) => ({
    q: q.replace(/\{state\}/g, stateName),
    a: a.replace(/\{state\}/g, stateName),
  }));
}

// Deterministic per-slug hero fallback pool. Only 8 states have unique
// state-specific hero photos in /public/assets/states/; the remaining 42
// previously all used the same fallback image, making them feel like a
// duplicate template. This pool gives every un-mapped state one of 10
// different lifestyle/housing photos via a deterministic slug hash — so
// /esa-letter/ohio and /esa-letter/oregon get different hero photos
// without any per-state authoring. Deterministic = same image on every
// render (no hydration mismatch, no flicker). All images are existing
// assets already used elsewhere in the site, so no bundle impact.
const FALLBACK_HERO_POOL: string[] = [
  "/assets/lifestyle/woman-with-dog-new-apartment.jpg",
  "/assets/lifestyle/woman-telehealth-with-dog.jpg",
  "/assets/lifestyle/owner-with-dog-laptop.jpg",
  "/assets/lifestyle/freelancer-with-dog-laptop.jpg",
  "/assets/lifestyle/woman-laptop-home.jpg",
  "/assets/blog/fp-woman-dog-floor.jpg",
  "/assets/blog/fp-woman-dog-couch.jpg",
  "/assets/blog/fp-woman-jeans-living-room.jpg",
  "/assets/blog/fp-curly-woman-fun-dog.jpg",
  "/assets/housing/home-together.jpg",
];

function pickFallbackHero(slug: string): string {
  // Simple stable 32-bit string hash (djb2-ish). Pure function of the
  // slug — produces the same index on server and client.
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % FALLBACK_HERO_POOL.length;
  return FALLBACK_HERO_POOL[idx];
}

// Compact "What landlords see" trust module — 4 micro-cells that snapshot
// what a {state} ESA letter actually shows a landlord during verification.
// Sits between the per-state Advantages section and Why PawTenant in the
// flow. Different surface from the existing Verification Trust Strip (a
// single horizontal bar lower on the page) — this is a scannable visual
// grid; the bar is the linked CTA to /esa-letter-verification.
const LANDLORDS_SEE_ITEMS = [
  {
    icon: "ri-shield-check-line",
    label: "Verification ID",
    body: "Unique ID landlords confirm at pawtenant.com/verify.",
  },
  {
    icon: "ri-user-star-line",
    label: "Provider's license",
    body: "Full name, license number, and NPI printed on every letter.",
  },
  {
    icon: "ri-home-heart-line",
    label: "Housing-focused",
    body: "Written for {state} Fair Housing Act accommodation requests.",
  },
  {
    icon: "ri-lock-line",
    label: "Privacy-safe",
    body: "Diagnosis and clinical detail never shown to landlords.",
  },
];

export default function StateESAPage() {
  const { state: stateSlug } = useParams<{ state: string }>();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { withAttribution } = useAttributionParams();

  const stateData = getStateBySlug(stateSlug || "");
  const theme = stateData ? getStateTheme(stateData.abbreviation) : DEFAULT_THEME;

  // Local asset map — uses state-specific image if available, else warm fallback.
  // Avoids external readdy.ai dependency and prevents same-image repetition in viewport.
  const STATE_HERO_MAP: Record<string, string> = {
    CA: "/assets/states/california.jpg",
    TX: "/assets/states/texas.jpg",
    FL: "/assets/states/florida.jpg",
    NY: "/assets/states/new-york.jpg",
    NC: "/assets/states/north-carolina.jpg",
    PA: "/assets/states/pennsylvania.jpg",
    VA: "/assets/states/virginia.jpg",
    IL: "/assets/states/illinois.jpg",
  };
  // Hero source: prefer the explicit per-state photo if mapped; otherwise
  // deterministically pick from the fallback pool by hashing the state
  // slug. Gives 42 un-mapped states 10 different visual experiences
  // instead of all sharing one image.
  const heroSrc =
    (stateData && STATE_HERO_MAP[stateData.abbreviation]) ||
    (stateData ? pickFallbackHero(stateData.slug) : "/assets/lifestyle/woman-with-dog-new-apartment.jpg");
  const petSceneSrc = "/assets/lifestyle/owner-with-dog-laptop.jpg";
  const catSceneSrc = "/assets/backgrounds/lifestyle-freelancer-home-cat.jpg";
  const labradorSrc = "/assets/breeds/labrador-retriever.jpg";

  useEffect(() => {
    if (!stateData) return;

    // Use custom meta if available, otherwise fall back to generic template
    const customMeta = STATE_META[stateData.slug];
    const title = customMeta
      ? customMeta.title
      : `ESA Letter ${stateData.name} 2026 — Licensed LMHP, Same-Day Delivery | PawTenant`;
    const description = customMeta
      ? customMeta.desc
      : `Need an ESA letter in ${stateData.name}? PawTenant connects you with ${stateData.name}-licensed mental health professionals. Valid for housing across all of ${stateData.name}, HIPAA-secure, same-day delivery, 100% money-back guarantee. ${stateData.name} ESA housing rights explained.`;
    const canonical = `https://www.pawtenant.com/esa-letter/${stateData.slug}`;

    document.title = title;

    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    setMeta("description", description);
    setMeta("keywords", `ESA letter ${stateData.name}, emotional support animal ${stateData.name}, ${stateData.name} ESA housing rights, ESA letter ${stateData.abbreviation}, ${stateData.abbreviation} ESA letter online, emotional support animal ${stateData.abbreviation}, ESA housing ${stateData.name} 2026, legitimate ESA letter ${stateData.name}, how to get ESA letter ${stateData.name}`);
    setLink("canonical", canonical);
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    setMeta("og:type", "website", true);
    setMeta("twitter:title", title, true);
    setMeta("twitter:description", description, true);

    const existingSchema = document.getElementById("state-esa-schema");
    if (existingSchema) existingSchema.remove();

    // Merge per-state FAQs with the shared housing-intent FAQs so the
    // FAQPage JSON-LD includes both sets — Google indexes the full FAQ
    // cluster, which broadens topical coverage without authoring 50
    // separate copies of the common housing questions.
    const schemaFaqs = [
      ...stateData.faqs,
      ...materializeCommonFaqs(stateData.name),
    ];

    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "FAQPage",
          "mainEntity": schemaFaqs.map((faq) => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": faq.a,
            },
          })),
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.pawtenant.com" },
            { "@type": "ListItem", "position": 2, "name": "All States", "item": "https://www.pawtenant.com/explore-esa-letters-all-states" },
            { "@type": "ListItem", "position": 3, "name": `ESA Letter in ${stateData.name}`, "item": canonical },
          ],
        },
      ],
    };

    const script = document.createElement("script");
    script.id = "state-esa-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const schemaEl = document.getElementById("state-esa-schema");
      if (schemaEl) schemaEl.remove();
    };
  }, [stateData]);

  if (!stateData) {
    return (
      <main>
        <SharedNavbar />
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">State Not Found</h1>
          <p className="text-gray-600 mb-8">We couldn't find information for this state.</p>
          <Link to="/explore-esa-letters-all-states" className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 cursor-pointer">
            View All States
          </Link>
        </div>
        <SharedFooter />
      </main>
    );
  }

  return (
    <main>
      <SharedNavbar />

      {/* Hero */}
      <section className="relative pt-28 pb-20">
        <div className="absolute inset-0">
          <img
            src={heroSrc}
            alt={`ESA Letter in ${stateData.name}`}
            loading="eager"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/25"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Link to="/explore-esa-letters-all-states" className="text-white/70 hover:text-white text-sm transition-colors">
                All States
              </Link>
              <i className="ri-arrow-right-s-line text-white/50 text-xs"></i>
              <span className="text-white/90 text-sm">{stateData.name}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 leading-tight">
              Get an ESA Letter in {stateData.name}
            </h1>
            {/* Subtitle line — captures "ESA letter for housing" + "licensed
                mental health professional" keyword variants without changing
                the existing dynamic intro text below. */}
            <p className="text-white/90 text-base font-medium leading-relaxed mb-4">
              Housing ESA documentation from a {stateData.name}-licensed mental health professional, written for Fair Housing Act accommodation.
            </p>
            <p className="text-white/85 text-base leading-relaxed mb-8">
              {stateData.introText}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to={withAttribution(`/assessment?state=${stateData.abbreviation}&ref=state-page`)}
                className="whitespace-nowrap inline-flex items-center gap-2 px-8 py-3.5 bg-orange-500 text-white font-bold text-sm rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
              {/* Internal anchor → /housing-rights-esa with natural keyword
                  anchor text for "Fair Housing Act protections". Strengthens
                  internal-linking topical authority across the housing cluster. */}
              <Link
                to="/housing-rights-esa"
                className="whitespace-nowrap inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-semibold border border-white/30 hover:border-white/60 px-5 py-3 rounded-md transition-colors cursor-pointer"
              >
                Fair Housing Act protections
                <i className="ri-arrow-right-line text-xs"></i>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Laws Summary */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-gray-900 mb-5">{stateData.name} ESA Laws</h2>
              <p className="text-gray-600 leading-relaxed mb-6">{stateData.lawsSummary}</p>
              <div className="bg-[#fdf6ee] rounded-xl p-6 mb-6 flex-1">
                <h3 className="text-sm font-bold text-gray-900 mb-4">To Be Protected in {stateData.name}:</h3>
                <ul className="space-y-3">
                  {stateData.lawsBullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className="ri-checkbox-circle-fill text-orange-500"></i>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">{b}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to={withAttribution(`/assessment?state=${stateData.abbreviation}&ref=state-page`)}
                className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm self-start"
              >
                <i className="ri-file-text-line"></i>
                Get An ESA Letter Now
              </Link>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src={petSceneSrc}
                alt={`ESA in ${stateData.name}`}
                loading="lazy"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="rounded-2xl overflow-hidden min-h-72">
              <img
                src={catSceneSrc}
                alt={`ESA advantages in ${stateData.name}`}
                loading="lazy"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-gray-900 mb-7">
                Advantages of Having an Emotional Support Animal for {stateData.name} Residents
              </h2>
              <div className="space-y-5 flex-1">
                {stateData.advantages.map((adv) => (
                  <div key={adv.title} className="flex items-start gap-4">
                    <div className="w-8 h-8 flex items-center justify-center bg-orange-100 rounded-lg flex-shrink-0 mt-0.5">
                      <i className="ri-checkbox-circle-fill text-orange-500"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{adv.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{adv.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to={withAttribution(`/assessment?state=${stateData.abbreviation}&ref=state-page`)}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-file-text-line"></i>
                  Get An ESA Letter Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What landlords see — compact 4-cell trust module that snapshots
          what a {state} ESA letter actually surfaces during landlord
          verification. Different surface from the existing Verification
          Trust Strip below (a single horizontal CTA bar): this is a
          scannable visual grid that reinforces the Verification ID +
          provider-license + housing-focus + privacy-safe quartet without
          duplicating the Google LP's larger verification section. */}
      <section className="py-12 md:py-14 bg-[#fafafa] border-y border-orange-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-7 md:mb-9">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
              What landlords see
            </span>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">
              A snapshot of your {stateData.name} ESA letter
            </h2>
            <p className="text-gray-500 text-sm mt-2 max-w-xl mx-auto leading-relaxed">
              Prepared for housing accommodation requests in {stateData.name} — reviewed by licensed providers familiar with ESA documentation in your state.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {LANDLORDS_SEE_ITEMS.map((item) => (
              <div
                key={item.label}
                className="bg-white border border-gray-100 rounded-xl p-4 md:p-5 hover:border-orange-200 transition-colors"
              >
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg mb-3">
                  <i className={`${item.icon} text-orange-500 text-lg`}></i>
                </div>
                <div className="text-[13px] md:text-sm font-bold text-gray-900 mb-1 leading-snug">
                  {item.label}
                </div>
                <p className="text-[11.5px] md:text-xs text-gray-600 leading-relaxed">
                  {item.body.replace(/\{state\}/g, stateData.name)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Pawtenant */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
            <div className="flex flex-col">
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Why PawTenant?</h2>
              <div className="space-y-5 flex-1">
                {whyPawtenant.map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                      <i className={`${item.icon} text-orange-500`}></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-7">
                <Link
                  to={withAttribution(`/assessment?state=${stateData.abbreviation}&ref=state-page`)}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-7 py-3 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition-colors cursor-pointer text-sm"
                >
                  <i className="ri-file-text-line"></i>
                  Get An ESA Letter Now
                </Link>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden min-h-80">
              <img
                src={labradorSrc}
                alt="Cute Labrador Retriever dog — ESA companion"
                loading="lazy"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — per-state items first (most state-relevant on top), then
          the shared housing-intent cluster materialized for this state. */}
      <section className="py-16 bg-[#fdf6ee]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">Popular Questions</span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {[...stateData.faqs, ...materializeCommonFaqs(stateData.name)].map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
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

          {/* Closing internal-link CTA — natural anchor to the
              how-to-get-esa explainer. Strengthens topical cluster linking
              between state pages and the central process explainer
              without adding an over-link in body copy. */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-500 mb-2">Want the full walkthrough?</p>
            <Link
              to="/how-to-get-esa-letter"
              className="whitespace-nowrap inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer"
            >
              See the full ESA letter application process
              <i className="ri-arrow-right-line text-xs"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Verification Trust Strip */}
      <section className="py-10 bg-[#FFF7ED]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white border border-orange-200 rounded-xl px-6 py-5">
            <div className="w-10 h-10 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
              <i className="ri-verified-badge-line text-white text-base"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-orange-600 mb-1">Landlord Verification Included</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Every finalized {stateData.name} ESA letter includes a unique Verification ID. Landlords can confirm authenticity at pawtenant.com/verify — your health information is never disclosed.
              </p>
              {/* Three concise trust bullets — expands the verification copy
                  with state-aware specifics without adding a new section.
                  Compact list so the strip still feels like a single trust
                  bar on desktop and stacks cleanly on mobile. */}
              <ul className="mt-2.5 grid gap-1 text-[11.5px] text-gray-600 leading-relaxed">
                <li className="flex items-start gap-1.5">
                  <i className="ri-check-line text-orange-500 mt-0.5 text-sm leading-none"></i>
                  <span>Provider's license number and NPI printed on every {stateData.name} letter</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <i className="ri-check-line text-orange-500 mt-0.5 text-sm leading-none"></i>
                  <span>Privacy-safe verification — diagnosis and clinical detail never shown</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <i className="ri-check-line text-orange-500 mt-0.5 text-sm leading-none"></i>
                  <span>Built for housing accommodation requests under the Fair Housing Act</span>
                </li>
              </ul>
              <PrivacySafeVerificationNote variant="inline" className="mt-2" />
            </div>
            <Link
              to="/esa-letter-verification"
              className="whitespace-nowrap inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 border border-orange-400 px-4 py-2 rounded-lg hover:bg-orange-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
            >
              How it works
              <i className="ri-arrow-right-line text-xs"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Related Blog Posts */}
      {(() => {
        const stateEntry = getStateBlogEntry(stateData.slug);
        const slugsToShow = stateEntry && stateEntry.postSlugs.length > 0
          ? stateEntry.postSlugs.slice(0, 4)
          : FALLBACK_BLOG_SLUGS;
        const posts = slugsToShow
          .map((s) => blogPosts.find((p) => p.slug === s))
          .filter(Boolean) as typeof blogPosts;
        if (posts.length === 0) return null;
        return (
          <section className="py-14 bg-[#fafafa] border-t border-gray-100">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-1 block">Housing &amp; ESA Resources</span>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">
                    {stateEntry ? `${stateData.name} ESA Guides` : "ESA Housing Guides"}
                  </h2>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xl">
                    Helpful reads on the Fair Housing Act, ESA documentation, and the application process.
                  </p>
                </div>
                <Link
                  to="/blog"
                  className="whitespace-nowrap text-sm font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  All Articles
                  <i className="ri-arrow-right-line text-xs"></i>
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {posts.map((post) => (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-orange-200 transition-colors cursor-pointer flex flex-col"
                  >
                    <div className="w-full h-36 overflow-hidden flex-shrink-0">
                      <img
                        src={post.image}
                        alt={post.title}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <span className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">{post.category}</span>
                      <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2 group-hover:text-orange-600 transition-colors line-clamp-3">
                        {post.title}
                      </h3>
                      <div className="mt-auto flex items-center gap-2 pt-2">
                        <span className="text-xs text-gray-400">{post.readTime}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{post.date}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Nearby States */}
      {(() => {
        const nearbySlug = NEARBY_STATES[stateData.slug] ?? [];
        const nearbyList = nearbySlug
          .map((s) => usStates.find((st) => st.slug === s))
          .filter(Boolean) as typeof usStates;
        if (nearbyList.length === 0) return null;
        return (
          <section className="py-14 bg-white border-t border-gray-100">
            <div className="max-w-7xl mx-auto px-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Also Serving Nearby States
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                PawTenant provides licensed ESA letters across all 50 states. If you or someone you know is in a neighboring state, we can help there too.
              </p>
              <div className="flex flex-wrap gap-3">
                {nearbyList.map((s) => (
                  <Link
                    key={s.slug}
                    to={`/esa-letter/${s.slug}`}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold rounded-lg hover:bg-orange-100 hover:border-orange-400 transition-colors cursor-pointer"
                  >
                    <i className="ri-map-pin-line text-orange-400 text-xs"></i>
                    ESA Letter in {s.name}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Book Your ESA Letter Consultation Today</h2>
          <p className="text-gray-500 mb-8">Feel confident with a trusted and reliable service</p>
          <Link
            to={withAttribution(`/assessment?state=${stateData.abbreviation}&ref=state-page`)}
            className="whitespace-nowrap inline-flex items-center gap-2 px-10 py-4 bg-orange-500 text-white font-bold rounded-md hover:bg-orange-600 transition-colors cursor-pointer"
          >
            <i className="ri-file-text-line"></i>
            Get Your ESA Letter
          </Link>
        </div>
      </section>

      <SharedFooter />
    </main>
  );
}
