import type { NextApiRequest, NextApiResponse } from "next";
import { getCoords, setCoords } from "../../lib/geocodeCache";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { q } = req.query;
  if (!q || typeof q !== "string") return res.status(400).json({ error: "Query 'q' fehlt" });

  const cached = getCoords(q);
  if (cached) return res.status(200).json(cached);

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=de`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Umpire-Map/1.0 (github.com/riser999-999/Umpire_Map)" },
    });
    if (!response.ok) return res.status(502).json({ error: "Nominatim nicht erreichbar" });

    const data = await response.json();
    if (!data.length) return res.status(404).json({ error: "Keine Koordinaten gefunden" });

    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    setCoords(q, result);

    res.setHeader("Cache-Control", "s-maxage=86400");
    res.status(200).json(result);
  } catch (err) {
    console.error("Geocoding error:", err);
    res.status(500).json({ error: "Geocoding fehlgeschlagen" });
  }
}
