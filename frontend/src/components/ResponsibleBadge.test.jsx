import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImpactCard, ResponsibleBadge, ScoreExplainer, SelfReportedLines } from "./ResponsibleBadge.jsx";

const badge = { label: "Verified responsible partner", score: 65, basis: "verified_claims_only", threshold: 60 };

describe("ResponsibleBadge", () => {
  it("renders only when the server sent a badge", () => {
    const { container, rerender } = render(<ResponsibleBadge badge={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ResponsibleBadge badge={badge} />);
    expect(screen.getByText("Verified responsible partner")).toBeInTheDocument();
  });
});

describe("SelfReportedLines", () => {
  it("shows claims as labelled text and never as a badge", () => {
    render(<SelfReportedLines claims={[{ label: "Certification", claim: "Says it is certified", status: "self_reported" }]} />);
    expect(screen.getByText(/not counted toward the score/i)).toBeInTheDocument();
    expect(screen.getByText("self reported")).toBeInTheDocument();
    expect(screen.queryByText("Verified responsible partner")).not.toBeInTheDocument();
  });
  it("renders nothing without claims", () => {
    const { container } = render(<SelfReportedLines claims={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const checks = {
  responsible_score: { score: 42.5, badge: null, message: "50% of spend is with scored partners (score 42.5). No badge: it needs 50% coverage and a score of 60.", note: "Self-reported and unverified claims are not counted." },
  carbon: { total_kg: 120.4, per_traveller_kg: 60.2, components_kg: { accommodation: 100, ground_between_stops: 20.4 }, not_included: ["flights"], assumptions: "Planning estimate, not a measured or audited footprint." },
  swap_suggestions: [{ from: { item_id: "a", name: "Old tour" }, to: { item_id: "b", name: "New tour" }, delta_sell_usd: -12.5, delta_pct: -10, reason: "That is a record of claims, not a guarantee." }],
};

describe("ImpactCard", () => {
  it("shows score, carbon with its limits, and a swap that can be applied", () => {
    const onSwap = vi.fn();
    render(<ImpactCard checks={checks} onSwap={onSwap} />);
    expect(screen.getByText(/No badge/)).toBeInTheDocument();
    expect(screen.getByText(/Not included: flights/)).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee/)).toBeInTheDocument();
    expect(screen.getByText(/−12.5 USD sell/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(onSwap).toHaveBeenCalledWith(checks.swap_suggestions[0]);
  });
  it("says not yet verified instead of a zero when nothing is scored", () => {
    render(<ImpactCard checks={{ responsible_score: { score: null, badge: null, message: "None verified.", note: "n" }, carbon: null, swap_suggestions: [] }} />);
    expect(screen.getByText("Not yet verified")).toBeInTheDocument();
  });
  it("renders nothing when the quote carries no impact data", () => {
    const { container } = render(<ImpactCard checks={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScoreExplainer", () => {
  it("renders the server copy including what the score is not", () => {
    render(<ScoreExplainer explainer={{ title: "How this score works", steps: ["Only verified claims add points."], not_this: ["It is not an audit."] }} />);
    expect(screen.getByText("How this score works")).toBeInTheDocument();
    expect(screen.getByText("It is not an audit.")).toBeInTheDocument();
  });
});
