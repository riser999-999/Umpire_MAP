import type { NextApiRequest, NextApiResponse } from "next";
import { fetchMatchesFromSupabase } from "../../lib/matches";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const matches = await fetchMatchesFromSupabase();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fehler beim Laden der Spiele" });
  }
}
