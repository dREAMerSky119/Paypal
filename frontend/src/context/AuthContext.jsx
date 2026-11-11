import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";
import { clearDemoSession, getSavedProfile, readDemoSession, saveProfile, writeDemoSession } from "../lib/profileStorage.js";
import { currencyForNationality } from "../lib/currency.js";
import { setDisplayCurrency } from "../lib/fx.js";

const AuthContext = createContext(null);

export function getInitials(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join("").toLocaleUpperCase();
  return `${Array.from(parts[0])[0]}${Array.from(parts.at(-1))[0]}`.toLocaleUpperCase();
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(() => {
    const session = readDemoSession();
    return session ? { email: session.email, profile: getSavedProfile(session.email) } : null;
  });

  const login = useCallback((email) => {
    const session = writeDemoSession(email);
    const next = { email: session.email, profile: getSavedProfile(session.email) };
    setAccount(next);
    return next;
  }, []);

  const logout = useCallback(() => {
    clearDemoSession();
    setAccount(null);
  }, []);

  const createProfile = useCallback((profile) => {
    if (!account?.email) throw new Error("Sign in to create a profile.");
    const saved = saveProfile(account.email, profile);
    setAccount((current) => current?.email === account.email ? { ...current, profile: saved } : current);
    return saved;
  }, [account?.email]);

  const updateProfile = createProfile;
  const profile = account?.profile || null;
  const value = useMemo(() => ({
    email: account?.email || "",
    profile,
    fullName: profile?.fullName || "",
    initials: getInitials(profile?.fullName),
    designation: profile?.designation || "Travel professional",
    organisationName: profile?.organisationName || "",
    preferredCurrency: profile?.preferredCurrency || currencyForNationality(profile?.nationality) || "USD",
    isLoggedIn: Boolean(account?.email),
    isProfileComplete: Boolean(profile?.fullName),
    login,
    logout,
    createProfile,
    updateProfile,
  }), [account?.email, profile, login, logout, createProfile, updateProfile]);

  // Every page that shows money reads the preferred currency from the shared exchange-rate layer.
  useLayoutEffect(() => { setDisplayCurrency(value.preferredCurrency); }, [value.preferredCurrency]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  // Tolerant fallback: components rendered without a provider (some tests,
  // error boundaries) behave as signed out instead of crashing.
  return useContext(AuthContext) ?? {
    email: "", profile: null, fullName: "", initials: "",
    designation: "Travel professional", organisationName: "", preferredCurrency: "USD",
    isLoggedIn: false, isProfileComplete: false,
    login: () => {}, logout: () => {}, createProfile: () => {}, updateProfile: () => {},
  };
}
