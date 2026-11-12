import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../lib/profileStorage.js";

const overview = { metrics: [], journeys: [], trend: { labels: ["A", "B"], values: [1, 2], summary_value: "", summary_text: "", footnote: "" }, responsible_note: "" };

function renderAt(path = "/") {
  return render(<AuthProvider><MotionConfig reducedMotion="always"><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></MotionConfig></AuthProvider>);
}

function fillPersonalDetails() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Rain Sharma" } });
  fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: "+91 98765 43210" } });
  fireEvent.change(screen.getByRole("textbox", { name: /nationality/i }), { target: { value: "Indian" } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(overview), { status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

describe("demo profile and session flow", () => {
  it("rejects invalid credentials and keeps Google sign-in explicitly unconfigured", async () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter your work email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "bad-email" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "demo" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/google oauth is not configured/i);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("starts a temporary session and sends first-time users to onboarding without saving the password", async () => {
    renderAt();
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "NEW@agency.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "not-persisted" } });
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }));
    expect(await screen.findByRole("heading", { name: /a little about you/i })).toBeInTheDocument();
    expect(screen.getAllByText("Wayfare workspace").length).toBeGreaterThan(0);
    expect(screen.queryByText("Northstar Travel")).not.toBeInTheDocument();
    const personalFields = document.querySelector(".profile-fields-personal");
    expect([...personalFields.children].map((field) => field.querySelector("input, select")?.id)).toEqual([
      "profile-fullName", "profile-phone", "profile-nationality", "profile-currency", "profile-email",
    ]);
    expect(personalFields.querySelector(".profile-field-hint")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY))).toMatchObject({ email: "new@agency.com" });
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toContain("not-persisted");
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
  });

  it("validates required data, toggles organisation details, saves, and shows profile identity in the dashboard", async () => {
    renderAt();
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "rain@agency.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "demo" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /a little about you/i });

    fireEvent.click(screen.getByRole("button", { name: /create profile/i }));
    expect(await screen.findByText("Enter your full name.")).toBeInTheDocument();
    expect(screen.getByLabelText(/organisation \/ agency name/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/self-employed/i));
    expect(screen.queryByLabelText(/organisation \/ agency name/i)).not.toBeInTheDocument();
    fillPersonalDetails();
    expect(screen.getByLabelText(/preferred display currency/i)).toHaveValue("INR");
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }));

    expect(await screen.findByRole("heading", { name: /good (morning|afternoon|evening), rain/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^profile for rain sharma$/i })).toHaveTextContent("RS");
    expect(screen.getAllByText("Rain's Workspace").length).toBeGreaterThan(0);
    const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY));
    expect(saved["rain@agency.com"]).toMatchObject({ fullName: "Rain Sharma", nationality: "Indian", preferredCurrency: "INR", agencyType: "self-employed", organisationName: "" });
  });

  it("edits identity immediately, logs out while preserving the profile, and restores it on the next login", async () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ "a@agency.com": { fullName: "Aditi Mehta", phone: "9876543210", nationality: "Indian", agencyType: "self-employed", designation: "Advisor", email: "a@agency.com" } }));
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "a@agency.com" }));
    renderAt("/app");
    expect(await screen.findByRole("heading", { name: /good (morning|afternoon|evening), aditi/i })).toBeInTheDocument();
    expect(screen.getAllByText("Aditi's Workspace").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: /edit profile for aditi mehta/i }));
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Aditi Shah" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: /^profile for aditi shah$/i })).toHaveTextContent("AS"));

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("dialog", { name: /leave your workspace/i })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^log out$/i }));
    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY))["a@agency.com"].fullName).toBe("Aditi Shah");

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "a@agency.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: /thoughtfully orchestrated/i })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: /enter agent workspace/i })[0]);
    expect(await screen.findByRole("heading", { name: /good (morning|afternoon|evening), aditi/i })).toBeInTheDocument();
  });

  it("shows the saved organisation as the workspace after profile creation and edits it immediately", async () => {
    renderAt();
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "agency@agency.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "demo" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /a little about you/i });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Mira Sen" } });
    fireEvent.change(screen.getByLabelText(/contact number/i), { target: { value: "+91 98765 43210" } });
    fireEvent.change(screen.getByRole("textbox", { name: /nationality/i }), { target: { value: "Indian" } });
    fireEvent.change(screen.getByLabelText(/organisation \/ agency name/i), { target: { value: "Horizon Journeys" } });
    fireEvent.change(screen.getByLabelText(/organisation address/i), { target: { value: "Jaipur, India" } });
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }));
    expect((await screen.findAllByText("Horizon Journeys", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agency workspace").length).toBeGreaterThan(0);

    // Creation navigates to /app after a short delay; wait for the sidebar link.
    fireEvent.click(await screen.findByRole("link", { name: /edit profile for mira sen/i }, { timeout: 3000 }));
    fireEvent.change(screen.getByLabelText(/organisation \/ agency name/i), { target: { value: "Horizon Travel Co." } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect((await screen.findAllByText("Horizon Travel Co.")).length).toBeGreaterThan(0);
  });

  it("requires an active demo session and onboarding before protected dashboard routes", async () => {
    const unauthenticated = renderAt("/app/inventory");
    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    unauthenticated.unmount();

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "unfinished@agency.com" }));
    const { unmount } = renderAt("/app/inventory");
    expect(await screen.findByRole("heading", { name: /a little about you/i })).toBeInTheDocument();
    unmount();
    // The first render was unauthenticated and is no longer needed.

    renderAt();
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "different@agency.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "any" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: /a little about you/i })).toBeInTheDocument();
  });
});
