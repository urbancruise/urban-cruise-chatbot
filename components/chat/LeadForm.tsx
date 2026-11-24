"use client";

import { useState } from "react";
import { consentNotice } from "@/lib/chat/content";

export interface LeadFormValues {
  name: string;
  mobile: string;
  pickup: string;
  drop: string;
  travelDate: string;
  returnDate: string | null;
  vehicleType: string;
  passengerCount: number;
  tripType: string;
  requirements: string;
  consent: true;
}

export default function LeadForm({
  languageCode,
  onSubmit,
  onCancel,
}: {
  languageCode: "en" | "hi";
  onSubmit: (values: LeadFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [consentGiven, setConsentGiven] = useState(false);
  const [roundTrip, setRoundTrip] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const isHindi = languageCode === "hi";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result: LeadFormValues = {
      name: String(form.get("name") ?? ""),
      mobile: String(form.get("mobile") ?? ""),
      pickup: String(form.get("pickup") ?? ""),
      drop: String(form.get("drop") ?? ""),
      travelDate: String(form.get("travelDate") ?? ""),
      returnDate: roundTrip ? String(form.get("returnDate") ?? "") : null,
      vehicleType: String(form.get("vehicleType") ?? "car"),
      passengerCount: Number(form.get("passengerCount")),
      tripType: String(form.get("tripType") ?? "local"),
      requirements: String(form.get("requirements") ?? ""),
      consent: true,
    };

    try {
      await onSubmit(result);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : isHindi
            ? "पूछताछ भेजी नहीं जा सकी। कृपया फिर कोशिश करें।"
            : "Your enquiry could not be sent. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const labelClass = "mb-1 block text-xs font-semibold text-slate-800";
  const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <section className="border-t border-stone-200 bg-white p-4" aria-label={isHindi ? "पूछताछ फॉर्म" : "Enquiry form"}>
      {!consentGiven ? (
        <div>
          <h3 className="text-sm font-bold text-slate-950">
            {isHindi ? "पहले आपकी अनुमति" : "Before we collect your details"}
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-700">{consentNotice(languageCode)}</p>
          <p className="mt-1 text-[11px] font-medium text-amber-900">
            {isHindi ? "यह सूचना प्रारंभिक है और स्वीकृत गोपनीयता सूचना से बदलनी होगी।" : "This notice is provisional and must be replaced with approved privacy wording."}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-900">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(event) => setConsentGiven(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-800"
            />
            <span>{isHindi ? "मैं इस पूछताछ के जवाब के लिए संपर्क की अनुमति देता/देती हूँ।" : "I agree to be contacted about this enquiry."}</span>
          </label>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-stone-100">
              {isHindi ? "वापस" : "Back"}
            </button>
          </div>
        </div>
      ) : (
        <form className="max-h-[45vh] space-y-3 overflow-y-auto pr-1" onSubmit={submit}>
          <h3 className="text-sm font-bold text-slate-950">{isHindi ? "यात्रा पूछताछ" : "Travel enquiry"}</h3>
          <div>
            <label className={labelClass} htmlFor="lead-name">{isHindi ? "नाम" : "Name"}</label>
            <input className={inputClass} id="lead-name" name="name" autoComplete="name" maxLength={120} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="lead-mobile">{isHindi ? "मोबाइल नंबर" : "Mobile number"}</label>
            <input className={inputClass} id="lead-mobile" name="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={15} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="lead-pickup">{isHindi ? "पिकअप" : "Pickup"}</label>
              <input className={inputClass} id="lead-pickup" name="pickup" maxLength={255} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-drop">{isHindi ? "ड्रॉप" : "Drop"}</label>
              <input className={inputClass} id="lead-drop" name="drop" maxLength={255} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="lead-date">{isHindi ? "यात्रा की तारीख" : "Travel date"}</label>
              <input className={inputClass} id="lead-date" name="travelDate" type="date" required />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-vehicle">{isHindi ? "वाहन का प्रकार" : "Vehicle type"}</label>
              <select className={inputClass} id="lead-vehicle" name="vehicleType">
                <option value="car">Car / SUV</option>
                <option value="luxury_car">Luxury car / van</option>
                <option value="tempo_traveller">Tempo Traveller</option>
                <option value="urbania">Urbania</option>
                <option value="mini_bus">Mini bus</option>
                <option value="luxury_bus">Luxury bus</option>
                <option value="volvo_bus">Volvo bus</option>
                <option value="sleeper_bus">Sleeper bus</option>
                <option value="other">{isHindi ? "अन्य" : "Other"}</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-800">
            <input type="checkbox" checked={roundTrip} onChange={(event) => setRoundTrip(event.target.checked)} className="h-4 w-4 accent-emerald-800" />
            {isHindi ? "वापसी यात्रा शामिल करें" : "Include a return journey"}
          </label>
          {roundTrip && (
            <div>
              <label className={labelClass} htmlFor="lead-return">{isHindi ? "वापसी की तारीख" : "Return date"}</label>
              <input className={inputClass} id="lead-return" name="returnDate" type="date" required />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="lead-passengers">{isHindi ? "यात्री" : "Passengers"}</label>
              <input className={inputClass} id="lead-passengers" name="passengerCount" type="number" min={1} max={1000} defaultValue={1} required />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-trip">{isHindi ? "यात्रा का प्रकार" : "Trip type"}</label>
              <select className={inputClass} id="lead-trip" name="tripType">
                <option value="local">{isHindi ? "स्थानीय" : "Local"}</option>
                <option value="airport">{isHindi ? "एयरपोर्ट" : "Airport"}</option>
                <option value="outstation">{isHindi ? "आउटस्टेशन" : "Outstation"}</option>
                <option value="wedding">{isHindi ? "शादी" : "Wedding"}</option>
                <option value="corporate">{isHindi ? "कॉर्पोरेट" : "Corporate"}</option>
                <option value="pilgrimage">{isHindi ? "तीर्थ यात्रा" : "Pilgrimage"}</option>
                <option value="other">{isHindi ? "अन्य" : "Other"}</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="lead-requirements">{isHindi ? "अतिरिक्त आवश्यकताएँ (वैकल्पिक)" : "Requirements (optional)"}</label>
            <textarea className={`${inputClass} resize-y`} id="lead-requirements" name="requirements" maxLength={2000} rows={2} />
          </div>
          {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-stone-100">{isHindi ? "वापस" : "Back"}</button>
            <button type="submit" disabled={pending} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60">
              {pending ? (isHindi ? "भेज रहे हैं..." : "Sending...") : (isHindi ? "पूछताछ भेजें" : "Send enquiry")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
