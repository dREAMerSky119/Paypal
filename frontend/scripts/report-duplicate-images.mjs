// Lists Unsplash photo IDs used more than once in data/destinations.js, with
// where each one is used. Run: npm run report:images
// It reports only: replacing an ID needs a human to pick a photo that really
// shows the place, and this script cannot check that.
import { destinations } from "../src/data/destinations.js";

const uses = new Map();
const add = (id, where) => {
  if (!id) return;
  if (!uses.has(id)) uses.set(id, []);
  uses.get(id).push(where);
};

for (const d of destinations) {
  add(d.cardImage, `${d.slug} · card`);
  add(d.heroImage, `${d.slug} · hero`);
  for (const a of d.attractions ?? []) add(a.image, `${d.slug} · ${a.name}`);
}

const dupes = [...uses].filter(([, where]) => where.length > 1);
const crossPlace = dupes.filter(([, where]) => new Set(where.map((w) => w.split(" · ")[0])).size > 1);

console.log(`${uses.size} distinct photo IDs, ${dupes.length} reused, ${crossPlace.length} shared between different destinations.\n`);
for (const [id, where] of crossPlace) {
  console.log(`${id}\n  ${where.join("\n  ")}\n`);
}
