import { createClient } from "@supabase/supabase-js";
import { discoverLeagues, fetchLeagueMatches, Match } from "../lib/bsm";
import { MANUAL_LEAGUES } from "../lib/config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service-Role, nur in CI, nie im Frontend!
);

function addressKey(field?: Match["field"]): string | null {
  if (!field) return null;
  return `${field.street}, ${field.postal_code} ${field.city}`.trim();
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    address
  )}&format=json&limit=1&countrycodes=de`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Umpire-Map-Sync/1.0 (github.com/riser999-999/Umpire_Map)" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function main() {
  const discovered = await discoverLeagues();
  const allLeagues = [
    ...discovered,
    ...MANUAL_LEAGUES.map((l) => ({ ...l, acronym: l.id, classification: "" })),
  ];
  const uniqueLeagues = Array.from(new Map(allLeagues.map((l) => [l.url, l])).values());

  // 1) Ligen speichern
  if (uniqueLeagues.length > 0) {
    const { error: leagueError } = await supabase.from("leagues").upsert(
      uniqueLeagues.map((l) => ({
        id: l.id,
        name: l.name,
        acronym: l.acronym,
        classification: l.classification,
      }))
    );
    if (leagueError) throw leagueError;
  }

  // 2) Bereits bekannte Venues laden, um Doppel-Geocoding zu vermeiden
  const { data: existingVenues, error: venueLoadError } = await supabase.from("venues").select("*");
  if (venueLoadError) throw venueLoadError;
  const venueMap = new Map<string, any>((existingVenues ?? []).map((v: any) => [v.address_key, v]));

  // 3) Spiele je Liga holen
  const allMatches: (Match & { leagueName: string; leagueId: string })[] = [];
  for (const league of uniqueLeagues) {
    const matches = await fetchLeagueMatches(league.url);
    if (!matches) continue;
    for (const m of matches) allMatches.push({ ...m, leagueName: league.name, leagueId: league.id });
  }

  // 4) Fehlende Adressen sequentiell geocodieren (Nominatim erlaubt max. 1 req/sec)
  for (const m of allMatches) {
    const key = addressKey(m.field);
    if (!key || venueMap.has(key)) continue;

    const coords = await geocode(key);
    const { data: inserted, error: upsertError } = await supabase
      .from("venues")
      .upsert(
        {
          address_key: key,
          name: m.field?.name,
          street: m.field?.street,
          postal_code: m.field?.postal_code,
          city: m.field?.city,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          geocoded_at: new Date().toISOString(),
        },
        { onConflict: "address_key" }
      )
      .select()
      .single();

    if (upsertError) {
      console.warn(`Konnte Venue "${key}" nicht speichern:`, upsertError.message);
      continue;
    }
    if (inserted) venueMap.set(key, inserted);

    // Nominatim Nutzungsbedingungen: max. 1 Request pro Sekunde
    await new Promise((r) => setTimeout(r, 1100));
  }

  // 5) Spiele speichern, mit venue_id verknuepft
  const rows = allMatches.map((m) => {
    const key = addressKey(m.field);
    const venue = key ? venueMap.get(key) : null;
    return {
      id: m.id,
      match_id: m.match_id,
      time: m.time,
      state: m.state,
      human_state: m.human_state,
      home_runs: m.home_runs,
      away_runs: m.away_runs,
      home_team_name: m.home_team_name,
      away_team_name: m.away_team_name,
      league_id: m.leagueId,
      league_name: m.leagueName,
      venue_id: venue?.id ?? null,
      umpire_assignments: m.umpire_assignments ?? [],
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error: matchError } = await supabase.from("matches").upsert(rows);
    if (matchError) throw matchError;
  }

  console.log(`Sync fertig: ${rows.length} Spiele, ${venueMap.size} Venues.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
