import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import CommandPalette from "./CommandPalette.jsx";

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const setup = () => render(<MemoryRouter><CommandPalette open onClose={() => {}} /><Where /></MemoryRouter>);
const item = { id: "item_0001", name: "Ortisei Guesthouse – double room", supplier_name: "Ortisei Guesthouse", destination: "dolomites-italy" };

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("CommandPalette inventory search", () => {
  it("does not call the API for fewer than two characters", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "o" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(spy).not.toHaveBeenCalled();
  });

  it("debounces, then lists inventory items that open the drawer", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ items: [item] })));
    setup();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "or" } });
    fireEvent.change(input, { target: { value: "ortisei" } });
    await vi.advanceTimersByTimeAsync(400);
    const row = await screen.findByRole("option", { name: /Ortisei Guesthouse – double room/ });
    expect(spy).toHaveBeenCalledTimes(1);                       // typing burst = one request
    expect(String(spy.mock.calls[0][0])).toContain("/api/inventory?q=ortisei&page_size=5");
    expect(row).toHaveTextContent("INVENTORY");
    fireEvent.click(row);
    expect(screen.getByTestId("where")).toHaveTextContent("/app/inventory?item=item_0001");
  });

  it("falls back to page and destination results when the API fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "kyoto" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(await screen.findByRole("option", { name: /Kyoto/ })).toBeInTheDocument();
    expect(screen.queryByText("INVENTORY")).toBeNull();
  });
});
