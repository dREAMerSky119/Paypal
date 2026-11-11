import { useEffect, useState } from "react";
import { Building2, Check, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { CURRENCY_OPTIONS, currencyForNationality } from "../lib/currency.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";
import { Button, PageHeader, Status } from "./ui.jsx";
import "../profile.css";

const emptyProfile = (email) => ({ fullName: "", phone: "", nationality: "", agencyType: "organisation", organisationName: "", organisationAddress: "", organisationWebsite: "", designation: "", email });
const profileValues = (email, profile) => ({ ...emptyProfile(email), ...(profile || {}), preferredCurrency: profile?.preferredCurrency || currencyForNationality(profile?.nationality) || "USD" });

function validate(values) {
  const errors = {};
  if (!values.fullName.trim()) errors.fullName = "Enter your full name.";
  const phone = values.phone.trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!phone) errors.phone = "Enter a contact number.";
  else if (!/^[+\d().\s-]+$/.test(phone) || digits < 7 || digits > 15) errors.phone = "Enter a valid phone number with 7 to 15 digits.";
  if (!values.nationality.trim()) errors.nationality = "Enter your nationality.";
  if (!values.agencyType) errors.agencyType = "Choose your working arrangement.";
  if (values.agencyType === "organisation") {
    if (!values.organisationName.trim()) errors.organisationName = "Enter your organisation name.";
    if (!values.organisationAddress.trim()) errors.organisationAddress = "Enter your organisation address.";
    if (values.organisationWebsite.trim() && !/^https?:\/\/.+\..+/i.test(values.organisationWebsite.trim())) errors.organisationWebsite = "Enter a website beginning with http:// or https://.";
  }
  return errors;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { email, profile, isProfileComplete, createProfile, updateProfile } = useAuth();
  const { rateLabel } = useDisplayCurrency();
  const [values, setValues] = useState(() => profileValues(email, profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setValues(profileValues(email, profile));
  }, [email, profile]);

  const setField = (key, value) => {
    setValues((current) => ({ ...current, [key]: value, ...(key === "nationality" && currencyForNationality(value) ? { preferredCurrency: currencyForNationality(value) } : {}) }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setNotice("");
  };

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setNotice("");
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const clean = {
        ...values,
        email,
        fullName: values.fullName.trim(),
        phone: values.phone.trim(),
        nationality: values.nationality.trim(),
        organisationName: values.agencyType === "organisation" ? values.organisationName.trim() : "",
        organisationAddress: values.agencyType === "organisation" ? values.organisationAddress.trim() : "",
        organisationWebsite: values.agencyType === "organisation" ? values.organisationWebsite.trim() : "",
        designation: values.designation.trim(),
      };
      (isProfileComplete ? updateProfile : createProfile)(clean);
      setNotice(isProfileComplete ? "Your profile has been updated." : "Your profile is ready. Opening your workspace…");
      if (!isProfileComplete) window.setTimeout(() => navigate("/app", { replace: true }), 450);
    } catch (error) {
      setNotice(error.message || "Your profile could not be saved in this browser.");
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, required = false, type = "text", placeholder = "") => (
    <label className="profile-field" htmlFor={`profile-${name}`} key={name}>
      <span>{label}{required && <i>Required</i>}</span>
      <input id={`profile-${name}`} type={type} value={values[name] || ""} placeholder={placeholder} onChange={(event) => setField(name, event.target.value)} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `profile-${name}-error` : undefined} />
      {errors[name] && <small className="profile-error" id={`profile-${name}-error`} role="alert">{errors[name]}</small>}
    </label>
  );

  return <div className="profile-page">
    <PageHeader eyebrow="YOUR WAYFARE PROFILE" title={isProfileComplete ? <>Profile <em>details.</em></> : <>A little about <em>you.</em></>} description={isProfileComplete ? "Keep your agency details and professional profile up to date." : "Set up your professional profile before entering the agent workspace."} />
    {!isProfileComplete && <div className="profile-demo-note"><Status tone="gold">Demo profile</Status><span>Saved in this browser and associated with your email. This is not a production account.</span></div>}
    <form className="profile-form" onSubmit={submit} noValidate>
      <section className="profile-section"><div className="profile-section-heading"><span><UserRound size={17}/></span><div><p className="eyebrow">01 · PERSONAL INFORMATION</p><h2>The person behind the journeys</h2></div></div>
        <div className="profile-fields profile-fields-personal">{field("fullName", "Full name", true, "text", "e.g. Rain Sharma")}{field("phone", "Contact number", true, "tel", "+91 98765 43210")}{field("nationality", "Nationality", true, "text", "e.g. Indian")}
          <label className="profile-field" htmlFor="profile-currency"><span>Preferred display currency</span><select id="profile-currency" value={values.preferredCurrency || "USD"} onChange={(event) => setField("preferredCurrency", event.target.value)}>{CURRENCY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><small className="profile-field-hint" aria-hidden="true">{`Independent of nationality. Prices across the app are shown in this currency at a ${rateLabel}.`}</small></label>
          <label className="profile-field" htmlFor="profile-email"><span>Login email</span><input id="profile-email" value={email} readOnly aria-readonly="true" /></label>
        </div>
      </section>
      <section className="profile-section"><div className="profile-section-heading"><span><Building2 size={17}/></span><div><p className="eyebrow">02 · PROFESSIONAL INFORMATION</p><h2>How do you work?</h2></div></div>
        <fieldset className="profile-arrangements"><legend>What best describes your working arrangement?</legend>
          {[{ value: "organisation", title: "Organisation", description: "I work with a travel agency or company." }, { value: "self-employed", title: "Self-employed", description: "I work independently with my travellers." }].map((option) => <label className={`profile-choice ${values.agencyType === option.value ? "is-selected" : ""}`} key={option.value}><input type="radio" name="agencyType" value={option.value} checked={values.agencyType === option.value} onChange={() => { setField("agencyType", option.value); if (option.value === "self-employed") setValues((current) => ({ ...current, agencyType: option.value, organisationName: "", organisationAddress: "", organisationWebsite: "" })); }} /><span className="profile-choice-check"><Check size={13}/></span><strong>{option.title}</strong><small>{option.description}</small></label>)}
        </fieldset>
        {errors.agencyType && <small className="profile-error">{errors.agencyType}</small>}
      </section>
      {values.agencyType === "organisation" ? <section className="profile-section"><div className="profile-section-heading"><span><Building2 size={17}/></span><div><p className="eyebrow">03 · ORGANISATION DETAILS</p><h2>Your agency</h2></div></div><div className="profile-fields">{field("organisationName", "Organisation / agency name", true, "text", "Enter your agency name")}{field("organisationAddress", "Organisation address", true, "text", "Street, city, country")}{field("organisationWebsite", "Organisation website", false, "url", "https://example.com")}{field("designation", "Professional designation", false, "text", "e.g. Travel designer")}</div></section> : <section className="profile-section"><div className="profile-section-heading"><span><UserRound size={17}/></span><div><p className="eyebrow">03 · PROFESSIONAL DETAILS</p><h2>Your practice</h2></div></div><div className="profile-fields profile-fields-single">{field("designation", "Professional designation", false, "text", "e.g. Independent travel advisor")}</div></section>}
      <div className="profile-submit-row"><p>DEMO ONLY · Profile data stays in this browser.</p><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving profile…" : isProfileComplete ? "Save changes" : "Create Profile"}<ArrowRightIcon/></button></div>
      {notice && <p className={`profile-notice ${notice.includes("could not") || notice.includes("unavailable") ? "is-error" : ""}`} role="status">{notice}</p>}
    </form>
  </div>;
}

function ArrowRightIcon() { return <span aria-hidden="true">→</span>; }
