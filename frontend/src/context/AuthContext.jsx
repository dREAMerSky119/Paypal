import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clearDemoSession, getSavedProfile, readDemoSession, saveProfile, writeDemoSession } from "../lib/profileStorage.js";
import { currencyForNationality } from "../lib/currency.js";

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
    preferredCurrency: profile?.preferredCurrency || currencyForNationality(profile?.nationality) || "USD",
    isLoggedIn: Boolean(account?.email),
    isProfileComplete: Boolean(profile?.fullName),
    login,
    logout,
    createProfile,
    updateProfile,
  }), [account?.email, profile, login, logout, createProfile, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
