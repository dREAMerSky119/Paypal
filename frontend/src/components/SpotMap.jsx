import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points.map((p) => [p.lat, p.lon]), { padding: [36, 36], maxZoom: 13 });
  }, [map, points]);
  return null;
}

/** Anchor (dark) plus its related spots (gold) on one map. CircleMarkers need no
 *  image assets, so nothing breaks under the bundler. Points without coordinates
 *  are filtered by the caller, never crash the map. */
export default function SpotMap({ points, onSelect }) {
  if (!points.length) return null;
  const [anchor, ...rest] = points;
  return (
    <MapContainer className="rs-map" center={[anchor.lat, anchor.lon]} zoom={9} scrollWheelZoom={false} worldCopyJump>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={18}
      />
      <FitToPoints points={points} />
      <CircleMarker center={[anchor.lat, anchor.lon]} radius={9}
        pathOptions={{ color: "#fbfaf6", weight: 2, fillColor: "#172b40", fillOpacity: 0.95 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>{anchor.name}</Tooltip>
      </CircleMarker>
      {rest.map((p) => (
        <CircleMarker key={p.spot_id} center={[p.lat, p.lon]} radius={7}
          pathOptions={{ color: "#fbfaf6", weight: 1.5, fillColor: "#9a8053", fillOpacity: 0.92 }}
          eventHandlers={onSelect ? { click: () => onSelect(p.spot_id) } : undefined}>
          <Tooltip direction="top" offset={[0, -6]}><strong>{p.name}</strong><br />{p.reason}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
