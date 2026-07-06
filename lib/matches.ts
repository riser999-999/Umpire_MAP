import { createClient } from "@supabase/supabase-js";
import type { Match } from "./bsm";

export type MatchWithLeague = Match & { leagueName: string; leagueId: string };

export async function fetchMatchesFromSupabase(): Promise<MatchWithLeague[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Anon-Key, read-only dank RLS-Policy
  );

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
      leagueId:league_id,
      leagueName:league_name,
      leagueInfo:leagues(name, acronym, classification),
      field:venues(name, street, postal_code, city, lat, lng)
    `)
    .order("time", { ascending: true });

  if (error) throw error;

  // Supabase liefert 1:1-Relationen als Array zurueck - hier normalisieren,
  // damit die Struktur exakt dem urspruenglichen Match-Interface entspricht
  // (match.league.acronym, match.field.lat, etc.), so bleibt MatchPopup.tsx
  // unveraendert kompatibel.
  return (data ?? []).map((m: any) => {
    const leagueInfo = Array.isArray(m.leagueInfo) ? m.leagueInfo[0] : m.leagueInfo;
    const field = Array.isArray(m.field) ? m.field[0] ?? null : m.field;
    const { leagueInfo: _drop, ...rest } = m;
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
}
