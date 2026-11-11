# Package Builder frontend update

## Files added
- `src/components/PackageBuilderPage.jsx`
- `src/components/ItineraryStudioPage.jsx`
- `src/components/package-builder.css`
- `src/components/PackageBuilderPage.test.jsx`

## Files modified
- `src/App.jsx` — registers real lazy-loaded pages for `/app/packages` and `/app/itinerary-studio`.

## Install
Copy the contents of this `frontend` folder over your existing `frontend` folder. Keep your `.env` file if you have one; this archive includes only `.env.example`.

Run from `frontend`:
```bash
npm install
npm run dev
```

Run checks:
```bash
npm test
npm run build
```

## Important integration boundary
This frontend phase provides a real package-building workflow, supplier inventory browsing, browser-local draft persistence, and a customer-facing print preview. It does not claim server-side persistence, a calculated selling price, or public share links. Those require the Phase 2 backend package endpoints and quote API, which are not part of the Phase 1 backend yet. No fake package prices or margin figures are displayed.
