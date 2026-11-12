const normalise = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Flatten pages and destinations into one searchable list. */
export function buildSearchIndex({ pages = [], destinations = [] }) {
  return [
    ...pages.map((p) => ({
      id: `page:${p.to}`,
      type: "Page",
      label: p.label,
      hint: p.hint ?? "",
      to: p.to,
      keywords: normalise(`${p.label} ${p.hint ?? ""} ${p.keywords ?? ""}`),
    })),
    ...destinations.map((d) => ({
      id: `destination:${d.slug}`,
      type: "Destination",
      label: d.cardTitle,
      hint: d.type,
      to: `/destinations/${d.slug}`,
      keywords: normalise(`${d.cardTitle} ${d.name} ${d.country} ${d.type} ${(d.highlights ?? []).join(" ")}`),
    })),
  ];
}

/** Rank by label prefix, then label match, then keyword match. Empty query lists everything in index order. */
export function searchIndex(index, query, limit = 8) {
  const q = normalise(query);
  if (!q) return index.slice(0, limit);
  return index
    .map((item) => {
      const label = normalise(item.label);
      let score = 0;
      if (label.startsWith(q)) score = 3;
      else if (label.includes(q)) score = 2;
      else if (item.keywords.includes(q)) score = 1;
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}

const DEST_NAMES = {};

/** API inventory page -> palette rows. Each opens the item's drawer on the inventory page. */
export function inventoryResultsToItems(data, destinations = []) {
  for (const d of destinations) DEST_NAMES[d.slug] = d.cardTitle;
  return (data?.items ?? []).map((i) => ({
    id: `inventory:${i.id}`,
    type: "Inventory",
    label: i.name,
    hint: [i.supplier_name, DEST_NAMES[i.destination] ?? i.destination].filter(Boolean).join(" · "),
    to: `/app/inventory?item=${encodeURIComponent(i.id)}`,
    keywords: "",
  }));
}
