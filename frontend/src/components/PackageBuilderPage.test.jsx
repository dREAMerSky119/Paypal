import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PackageBuilderPage from "./PackageBuilderPage.jsx";
import ItineraryStudioPage from "./ItineraryStudioPage.jsx";

vi.mock("../lib/api.js",()=>({api:vi.fn(async()=>({items:[{id:"stay-1",name:"Garden House",supplier_name:"Local host",destination:"kyoto-japan",type:"stay",unit:"per_room_night"},{id:"exp-1",name:"Tea ceremony",supplier_name:"Kyoto guide",destination:"kyoto-japan",type:"experience",unit:"per_person"}]}))}));
beforeEach(()=>localStorage.clear());
describe("Package Builder",()=>{
 it("renders the trip form and advances only with required trip details",async()=>{
  render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:/package builder/i})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:/continue/i})).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/departure date/i),{target:{value:"2026-12-10"}});
  expect(screen.getByRole("button",{name:/continue/i})).toBeEnabled();
 });
 it("adds a stay from supplier inventory",async()=>{
  render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/destination/i),{target:{value:"kyoto-japan"}});
  fireEvent.click(screen.getByRole("button",{name:/stay/i}));
  await waitFor(()=>expect(screen.getByText("Garden House")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button",{name:/add garden house/i}));
  expect(screen.getByText(/garden house/i)).toBeInTheDocument();
 });
 it("does not invent a quote in the review step",()=>{
  render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
  fireEvent.click(screen.getByRole("button",{name:/review/i}));
  expect(screen.getByText(/live package quote is not connected yet/i)).toBeInTheDocument();
 });
});
describe("Itinerary Studio",()=>{
 it("shows the empty state until a local draft exists",()=>{
  render(<MemoryRouter initialEntries={["/app/itinerary-studio"]}><ItineraryStudioPage/></MemoryRouter>);
  expect(screen.getByRole("heading",{name:/your next journey starts here/i})).toBeInTheDocument();
 });
});
