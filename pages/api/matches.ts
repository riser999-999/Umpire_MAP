import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Anon-Key, read-only dank RLS-Policy
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabase
    .from("matches")
    .select(`
      id,
      match_id,
      time,
      state,
      human_state,
      home_runs,
      away_runs,
      home_team_name,
      away_team_name,
      umpire_assignments,
      updated_at,
      leagueId:league_id,
      leagueName:league_name,
      leagueInfo:leagues(name, acronym, classification),
      field:venues(name, street, postal_code, city, lat, lng)
    `)
    .order("time", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: "Fehler beim Laden der Spiele" });
  }

  // Letzter Sync-Zeitpunkt: sync.ts stempelt jede Zeile bei jedem Lauf neu,
  // daher ist MAX(updated_at) ueber alle Matches der letzte Sync-Zeitpunkt.
  const lastUpdated = (data ?? []).reduce<string | null>((max, m: any) => {
    if (!m.updated_at) return max;
    return !max || m.updated_at > max ? m.updated_at : max;
  }, null);

  // Supabase liefert 1:1-Relationen als Array zurueck - hier normalisieren,
  // damit die Struktur exakt dem urspruenglichen Match-Interface entspricht
  // (match.league.acronym, match.field.lat, etc.), so bleibt MatchPopup.tsx
  // unveraendert kompatibel.
  const normalized = (data ?? []).map((m: any) => {
    const leagueInfo = Array.isArray(m.leagueInfo) ? m.leagueInfo[0] : m.leagueInfo;
    const field = Array.isArray(m.field) ? m.field[0] ?? null : m.field;
    const { leagueInfo: _drop, updated_at: _drop2, ...rest } = m;
    return {
      ...rest,
      field,
      league: {
        name: leagueInfo?.name ?? m.leagueName,
        acronym: leagueInfo?.acronym ?? "",
        classification: leagueInfo?.classification ?? "",
      },
    };
  });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Last-Updated", lastUpdated ?? "");
  res.status(200).json(normalized);
}
