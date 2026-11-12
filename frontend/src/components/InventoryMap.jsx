import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { TIER_LABELS, TYPE_COLORS, TYPE_LABELS } from "../lib/inventory.js";

function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points.map((p) => [p.lat, p.lon]), { padding: [36, 36], maxZoom: 12 });
  }, [map, points]);
  return null;
}

/** One circle marker per filtered result. CircleMarkers need no image assets, so
 *  nothing breaks under the bundler (Leaflet's default pin icons do). */
export default function InventoryMap({ points, onSelect }) {
  return <MapContainer className="inv-map" center={[20, 10]} zoom={2} scrollWheelZoom={false} worldCopyJump>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={18} />
    <FitToPoints points={points} />
    {points.map((p) => <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={7} pathOptions={{ color: "#fbfaf6", weight: 1.5, fillColor: TYPE_COLORS[p.type] || "#172b40", fillOpacity: 0.92 }} eventHandlers={{ click: () => onSelect(p.id) }}>
      <Tooltip direction="top" offset={[0, -6]}><strong>{p.name}</strong><br />{TYPE_LABELS[p.type]} · {TIER_LABELS[p.tier]}</Tooltip>
    </CircleMarker>)}
  </MapContainer>;
}
