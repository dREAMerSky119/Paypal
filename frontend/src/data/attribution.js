// Single source of truth for the attribution page. Mirrors docs/data-sources.md:
// only sources the code actually uses are in `usedSources`; anything the plan named
// but the repo does not call yet is listed separately so we never over-claim.
export const usedSources = [
  { name: "Hotel Booking Demand", by: "Antonio, Almeida & Nunes (2019), Data in Brief 22", use: "Calibrates seasonality and validates the anomaly detector against known rate outliers.", licence: "CC BY 4.0", url: "https://www.sciencedirect.com/science/article/pii/S2352340918315191" },
  { name: "OpenStreetMap", by: "© OpenStreetMap contributors", use: "Map tiles and map data on the inventory and related-spots maps.", licence: "ODbL 1.0", url: "https://www.openstreetmap.org/copyright" },
  { name: "Wikipedia", by: "Wikipedia contributors", use: "Attraction text on related spots. Each result keeps its page link.", licence: "CC BY-SA 4.0", url: "https://en.wikipedia.org/wiki/Wikipedia:Copyrights" },
  { name: "Wikivoyage", by: "Wikivoyage contributors", use: "Destination travel-guide text.", licence: "CC BY-SA 3.0", url: "https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft" },
  { name: "Wikimedia Pageviews", by: "Wikimedia Foundation", use: "Popularity signal for ranking related spots.", licence: "CC0", url: "https://dumps.wikimedia.org/other/pageviews/readme.html" },
  { name: "Overture Maps Places", by: "Overture Maps Foundation", use: "Optional offline enrichment of supplier names and coordinates.", licence: "CDLA-Permissive 2.0", url: "https://docs.overturemaps.org/attribution/" },
  { name: "UK government GHG conversion factors 2026", by: "DESNZ and DEFRA", use: "Carbon factors behind the responsible-travel score.", licence: "Open Government Licence v3.0", url: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting" },
  { name: "ECB euro reference rates", by: "European Central Bank", use: "FX reference values in the simulator. Values in this build are labelled assumptions, not live rates.", licence: "Free reuse, source: ECB", url: "https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html" },
  { name: "OurAirports", by: "David Megginson", use: "Airport coordinates for travel-time estimates.", licence: "Public domain", url: "https://ourairports.com/data/" },
];

export const notUsedYet = [
  { name: "Inside Airbnb", note: "Named in the plan; no code reads it today." },
  { name: "Open-Meteo", note: "Planned for climate normals (CC BY 4.0); nothing calls it today." },
  { name: "World Bank indicators", note: "Inspired the shape of the demand series only. The values are synthetic, not World Bank figures." },
];
