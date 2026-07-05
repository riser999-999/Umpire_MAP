import React, { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Match } from "../lib/bsm";
import { parseDate } from "../lib/bsm";
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

async function geocodeField(field: NonNullable<Match["field"]>): Promise<{ lat: number; lng: number } | null> {
  const q = `${field.street}, ${field.postal_code} ${field.city}, Deutschland`;
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function MapView({ matches, selectedDay }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [geocodingStatus, setGeocodingStatus] = useState<"idle" | "loading" | "done">("idle");

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

  // Update markers when matches or selected day changes
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    const dayMatches = matches.filter((m) => {
      const d = parseDate(m.time).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const sel = parseDate(selectedDay).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return d === sel;
    });

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
    if (fieldGroups.length === 0) return;

    setGeocodingStatus("loading");

    let cancelled = false;

    (async () => {
      // OPTION 1: Parallelize geocoding instead of sequential requests
      const geocodePromises = fieldGroups.map((group) => geocodeField(group.field));
      const geocodeResults = await Promise.all(geocodePromises);
      
      const coords: { group: FieldGroup; lat: number; lng: number }[] = [];
      for (let i = 0; i < fieldGroups.length; i++) {
        const result = geocodeResults[i];
        if (result) {
          coords.push({ group: fieldGroups[i], lat: result.lat, lng: result.lng });
        }
      }

      if (cancelled || !markersLayerRef.current || !mapRef.current) return;

      markersLayerRef.current.clearLayers();

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

      setGeocodingStatus("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [matches, selectedDay]);

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      {geocodingStatus === "loading" && (
        <div style={{
          position: "absolute",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          backgroundColor: "#1e293b",
          color: "#94a3b8",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "13px",
          border: "1px solid #334155",
          pointerEvents: "none",
        }}>
          Spielorte werden gesucht...
        </div>
      )}
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
