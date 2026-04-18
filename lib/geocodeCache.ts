// In-Memory-Cache für Geocoding-Ergebnisse (überlebt pro Server-Instanz)
const cache = new Map<string, { lat: number; lng: number }>();

export function getCoords(key: string) {
  return cache.get(key) ?? null;
}

export function setCoords(key: string, coords: { lat: number; lng: number }) {
  cache.set(key, coords);
}
