import React, { useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Match } from "../lib/bsm";
import { parseDate, dayKey } from "../lib/bsm";
import MatchPopup from "./MatchPopup";

// Leaflet icon fix for Next.js
import L from "leaflet";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

interface FieldGroup {
  fieldKey: string;
  field: NonNullable<Match["field"]>;
  matches: (Match & { leagueName: string; leagueId: string })[];
}

interface Props {
  matches: (Match & { leagueName: string; leagueId: string })[];
  selectedDay: string;
}

export default function MapView({ matches, selectedDay }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [51.1657, 10.4515],
      zoom: 6,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Group all matches by day key once; only recomputed when `matches` changes,
  // not on every day switch.
  const matchesByDay = useMemo(() => {
    const map = new Map<string, (Match & { leagueName: string; leagueId: string })[]>();
    for (const m of matches) {
      const key = dayKey(parseDate(m.time));
      const list = map.get(key);
      if (list) list.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [matches]);

  // Update markers when the grouped matches or selected day changes
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    const dayMatches = matchesByDay.get(dayKey(parseDate(selectedDay))) ?? [];

    // Group by field key
    const fieldMap = new Map<string, FieldGroup>();
    for (const match of dayMatches) {
      if (!match.field) continue;
      const key = `${match.field.name}|${match.field.postal_code}`;
      if (!fieldMap.has(key)) {
        fieldMap.set(key, { fieldKey: key, field: match.field, matches: [] });
      }
      fieldMap.get(key)!.matches.push(match);
    }

    const fieldGroups = Array.from(fieldMap.values());

    markersLayerRef.current.clearLayers();

    const coords: { group: FieldGroup; lat: number; lng: number }[] = [];
    for (const group of fieldGroups) {
      const { lat, lng } = group.field;
      if (typeof lat === "number" && typeof lng === "number") {
        coords.push({ group, lat, lng });
      }
    }

    for (const { group, lat, lng } of coords) {
      const popupHtml = renderToStaticMarkup(
        <MatchPopup
          fieldName={group.field.name}
          fieldAddress={`${group.field.street}, ${group.field.postal_code} ${group.field.city}`}
          matches={group.matches}
        />
      );

      const marker = L.marker([lat, lng]);
      marker.bindPopup(popupHtml, {
        maxWidth: 360,
        className: "umpire-popup",
      });
      markersLayerRef.current.addLayer(marker);
    }

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map(({ lat, lng }) => [lat, lng] as [number, number]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [matchesByDay, selectedDay]);

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: "400px" }} />
      <style>{`
        .umpire-popup .leaflet-popup-content-wrapper {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .umpire-popup .leaflet-popup-content {
          margin: 0;
          color: #e2e8f0;
        }
        .umpire-popup .leaflet-popup-tip {
          background: #1e293b;
        }
        .umpire-popup .leaflet-popup-close-button {
          color: #64748b;
          padding: 6px 8px;
        }
        .umpire-popup .leaflet-popup-close-button:hover {
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}
