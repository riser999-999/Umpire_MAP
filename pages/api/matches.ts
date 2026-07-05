import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id,
      time,
      home_team_name,
      away_team_name,
      leagueId:league_id,
      leagueName:league_name,
      field:venues(name, street, postal_code, city, lat, lng)
    `)
    .order("time", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Fehler beim Laden der Spiele" });
  }

  const normalized = (data ?? []).map((m: any) => ({
    ...m,
    field: Array.isArray(m.field) ? m.field[0] ?? null : m.field,
  }));

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.status(200).json(normalized);
}
