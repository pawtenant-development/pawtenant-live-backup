import { useState } from "react";
import { ALL_STATES, AVAILABLE_STATES } from "../../../mocks/doctors";

export interface PetInfo {
  name: string;
  age: string;
  breed: string;
  type: string;
  weight: string;
}

export interface AdditionalDocInfo {
  types: string[];
  otherDescription?: string;
}

export interface Step2Data {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  state: string;
  pets: PetInfo[];
  deliverySpeed: string;
  additionalDocs?: AdditionalDocInfo;
}

interface Step2PersonalInfoProps {
  data: Step2Data;
  onChange: (data: Step2Data) => void;
  onNext: () => void;
  onBack: () => void;
  mode?: "esa" | "psd";
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: boolean;
  errorMsg?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, errorMsg, hint, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
        {label}
        {required && <span className="text-orange-500 ml-0.5">*</span>}
        {!required && <span className="text-gray-400 font-normal ml-1 lowercase">(optional)</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1.5 italic">{hint}</p>}
      {children}
      {error && (
        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
          <i className="ri-error-warning-line"></i>
          {errorMsg || "This field is required"}
        </p>
      )}
    </div>
  );
}

// ── US phone formatter ────────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const inputClass =
  "w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 transition-colors text-gray-800";
const errorInputClass =
  "w-full px-4 py-2.5 text-sm border border-red-400 rounded-lg bg-white focus:outline-none focus:border-red-400 transition-colors text-gray-800";

const PET_TYPES = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"];

const emptyPet = (): PetInfo => ({ name: "", age: "", breed: "", type: "", weight: "" });

function validateAge(dob: string): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const actualAge =
    monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())
      ? age - 1
      : age;
  return actualAge >= 18;
}



export default function Step2PersonalInfo({ data, onChange, onNext, onBack, mode = "esa" }: Step2PersonalInfoProps) {
  const isPSD = mode === "psd";
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [dobError, setDobError] = useState<string>("");

  const update = (field: keyof Step2Data, val: string | PetInfo[] | AdditionalDocInfo | undefined) => {
    onChange({ ...data, [field]: val });
  };

  const updatePet = (idx: number, field: keyof PetInfo, val: string) => {
    const updated = data.pets.map((p, i) => (i === idx ? { ...p, [field]: val } : p));
    onChange({ ...data, pets: updated });
  };

  const addPet = () => {
    if (data.pets.length < 3) {
      // In PSD mode, always default type to "Dog"
      const newPet = isPSD ? { ...emptyPet(), type: "Dog" } : emptyPet();
      onChange({ ...data, pets: [...data.pets, newPet] });
    }
  };

  const removePet = (idx: number) => {
    if (data.pets.length <= 1) return;
    onChange({ ...data, pets: data.pets.filter((_, i) => i !== idx) });
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!data.firstName) errs.firstName = true;
    if (!data.lastName) errs.lastName = true;
    if (!data.email) errs.email = true;
    if (!data.phone) errs.phone = true;
    if (!data.dob) {
      errs.dob = true;
      setDobError("Date of birth is required.");
    } else if (!validateAge(data.dob)) {
      errs.dob = true;
      setDobError("You must be 18 years or older to complete this assessment.");
    } else {
      setDobError("");
    }
    if (!data.state) errs.state = true;
    // Only require deliverySpeed for ESA mode — PSD selects it in step 3
    if (!isPSD && !data.deliverySpeed) errs.deliverySpeed = true;

    data.pets.forEach((p, i) => {
      if (!p.name) errs[`pet_${i}_name`] = true;
      if (!p.age) errs[`pet_${i}_age`] = true;
      if (!p.breed) errs[`pet_${i}_breed`] = true;
      if (!isPSD && !p.type) errs[`pet_${i}_type`] = true;
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const availableStateCodes = new Set(AVAILABLE_STATES);
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 18);
  const maxDobStr = maxDate.toISOString().split("T")[0];

  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Your Information</h2>
        <p className="text-gray-500 text-sm mt-2">
          All information is kept strictly confidential and protected under HIPAA.
        </p>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-sm text-red-700 flex items-center gap-2">
          <i className="ri-error-warning-line text-base"></i>
          Please fill in all required fields before continuing.
        </div>
      )}

      {/* Personal Info */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-5">
        <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full text-white text-xs">
            <i className="ri-user-line"></i>
          </span>
          Personal Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First Name" required error={errors.firstName}>
            <input
              type="text"
              value={data.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              placeholder="John"
              className={errors.firstName ? errorInputClass : inputClass}
            />
          </Field>
          <Field label="Last Name" required error={errors.lastName}>
            <input
              type="text"
              value={data.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              placeholder="Doe"
              className={errors.lastName ? errorInputClass : inputClass}
            />
          </Field>
          <Field
            label="Email Address"
            required
            error={errors.email}
            hint="To receive your Letter digitally"
          >
            <input
              type="email"
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="john@example.com"
              className={errors.email ? errorInputClass : inputClass}
            />
          </Field>
          <Field label="Phone Number" required error={errors.phone}>
            <input
              type="tel"
              value={data.phone}
              onChange={(e) => update("phone", formatPhone(e.target.value))}
              placeholder="(409) 000-0000"
              maxLength={14}
              className={errors.phone ? errorInputClass : inputClass}
            />
          </Field>
          <Field
            label="Date of Birth"
            required
            error={errors.dob}
            errorMsg={dobError || "Date of birth is required"}
          >
            <input
              type="date"
              value={data.dob}
              max={maxDobStr}
              onChange={(e) => {
                update("dob", e.target.value);
                if (e.target.value && !validateAge(e.target.value)) {
                  setDobError("You must be 18 years or older to complete this assessment.");
                  setErrors((prev) => ({ ...prev, dob: true }));
                } else {
                  setDobError("");
                  setErrors((prev) => { const n = { ...prev }; delete n.dob; return n; });
                }
              }}
              className={errors.dob ? errorInputClass : inputClass}
            />
          </Field>
          <Field label="State" required error={errors.state}>
            <select
              value={data.state}
              onChange={(e) => update("state", e.target.value)}
              className={errors.state ? errorInputClass : inputClass}
            >
              <option value="">Select your state</option>
              {ALL_STATES.map((s) => (
                <option
                  key={s.code}
                  value={s.code}
                  disabled={!availableStateCodes.has(s.code)}
                >
                  {s.name}
                  {!availableStateCodes.has(s.code) ? " (not available)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Pet Info */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-5">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <span className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full text-white text-xs flex-shrink-0">
              <i className="ri-heart-line"></i>
            </span>
            {isPSD ? "Your Psychiatric Service Dog" : "Pet Information"}
          </h3>
          {!isPSD && data.pets.length < 3 && (
            <button
              type="button"
              onClick={addPet}
              className="whitespace-nowrap self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-white bg-orange-500 border border-orange-500 px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-add-line"></i>
              Add Another Pet
            </button>
          )}
          {isPSD && data.pets.length < 3 && (
            <button
              type="button"
              onClick={addPet}
              className="whitespace-nowrap self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 border border-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors cursor-pointer"
            >
              <i className="ri-add-line"></i>
              Add Another Dog
            </button>
          )}
        </div>

        {/* Reminder banner */}
        {!isPSD && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-amber-800">
              <span className="font-bold">Have more than one ESA?</span> Make sure to click <span className="font-bold">&quot;Add Another Pet&quot;</span> above so all your animals are covered on the letter. Pets added later cannot be included after submission.
            </p>
          </div>
        )}

        {isPSD && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5"></i>
            <p className="text-xs text-amber-800">
              <span className="font-bold">Have more than one Psychiatric Service Dog?</span> Click <span className="font-bold">&quot;Add Another Dog&quot;</span> above — you can add up to 3 dogs. Pricing adjusts automatically based on the number of dogs. Dogs added later cannot be included after submission.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {data.pets.map((pet, idx) => (
            <div key={idx} className="relative">
              {idx > 0 && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    {isPSD ? `Dog ${idx + 1}` : `Pet ${idx + 1}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePet(idx)}
                    className="whitespace-nowrap inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line"></i>
                    Remove
                  </button>
                </div>
              )}
              {idx === 0 && data.pets.length > 1 && (
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">{isPSD ? "Dog 1" : "Pet 1"}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={isPSD ? "Dog's Name" : "Pet Name"} required error={errors[`pet_${idx}_name`]}>
                  <input
                    type="text"
                    value={pet.name}
                    onChange={(e) => updatePet(idx, "name", e.target.value)}
                    placeholder="Buddy"
                    className={errors[`pet_${idx}_name`] ? errorInputClass : inputClass}
                  />
                </Field>
                {isPSD ? (
                  <Field label="Pet Type">
                    <div className={`${inputClass} bg-gray-50 text-gray-500 flex items-center gap-2`}>
                      <i className="ri-service-line text-amber-600"></i>
                      <span className="font-semibold">Dog</span>
                      <span className="text-xs text-gray-400 ml-auto">(PSD must be a dog)</span>
                    </div>
                  </Field>
                ) : (
                  <Field label="Pet Type" required error={errors[`pet_${idx}_type`]}>
                    <select
                      value={pet.type}
                      onChange={(e) => updatePet(idx, "type", e.target.value)}
                      className={errors[`pet_${idx}_type`] ? errorInputClass : inputClass}
                    >
                      <option value="">Select type</option>
                      {PET_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Breed" required error={errors[`pet_${idx}_breed`]}>
                  <input
                    type="text"
                    value={pet.breed}
                    onChange={(e) => updatePet(idx, "breed", e.target.value)}
                    placeholder="Golden Retriever"
                    className={errors[`pet_${idx}_breed`] ? errorInputClass : inputClass}
                  />
                </Field>
                <Field label="Age" required error={errors[`pet_${idx}_age`]}>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={pet.age}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                      updatePet(idx, "age", val);
                    }}
                    onKeyDown={(e) => {
                      if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
                    }}
                    placeholder="e.g. 3"
                    className={errors[`pet_${idx}_age`] ? errorInputClass : inputClass}
                  />
                </Field>
                <Field label="Weight">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={pet.weight}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 3);
                      updatePet(idx, "weight", val);
                    }}
                    onKeyDown={(e) => {
                      if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
                    }}
                    placeholder="e.g. 55"
                    className={inputClass}
                  />
                </Field>
              </div>
              {idx < data.pets.length - 1 && (
                <hr className="mt-6 border-gray-100" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Delivery Speed — hidden in PSD mode (selected in step 3) ── */}
      {!isPSD && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5">
          <h3 className="text-sm font-bold text-gray-900 mb-5 flex items-center gap-2">
            <span className="w-6 h-6 flex items-center justify-center bg-orange-500 rounded-full text-white text-xs">
              <i className="ri-time-line"></i>
            </span>
            How fast do you need your ESA Letter?
            <span className="text-orange-500 ml-0.5">*</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                value: "24h",
                label: "Within 24 Hours",
                desc: "Your letter delivered the same day after evaluation.",
                badge: "Most Popular",
                icon: "ri-flashlight-line",
              },
              {
                value: "2-3days",
                label: "Within 2-3 Days",
                desc: "Standard delivery within 2-3 business days.",
                badge: "",
                icon: "ri-calendar-check-line",
              },
            ].map((opt) => {
              const selected = data.deliverySpeed === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("deliverySpeed", opt.value)}
                  className={`text-left px-5 py-4 rounded-xl border-2 transition-all duration-150 cursor-pointer ${
                    selected ? "border-orange-500 bg-orange-50" : errors.deliverySpeed ? "border-red-300 bg-white" : "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className={`${opt.icon} ${selected ? "text-orange-500" : "text-gray-400"} text-base`}></i>
                      </div>
                      <span className="font-bold text-sm text-gray-900">{opt.label}</span>
                    </div>
                    <span className={`whitespace-nowrap text-xs font-bold px-2 py-0.5 rounded-full ${opt.value === "24h" ? "bg-orange-500 text-white" : opt.badge ? "bg-gray-100 text-gray-600 border border-gray-200" : "hidden"}`}>
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-7">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          {errors.deliverySpeed && (
            <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
              <i className="ri-error-warning-line"></i>
              Please select a delivery speed.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-7 py-4 sm:py-3.5 border-2 border-gray-200 text-gray-700 font-semibold text-sm rounded-xl sm:rounded-lg hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer w-full sm:w-auto"
        >
          <i className="ri-arrow-left-line"></i>
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 sm:px-10 py-4 sm:py-3.5 bg-orange-500 text-white font-bold text-base sm:text-sm rounded-xl sm:rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-colors cursor-pointer w-full sm:w-auto"
        >
          Continue to Checkout
          <i className="ri-arrow-right-line"></i>
        </button>
      </div>
    </div>
  );
}
