import { createClient } from "@supabase/supabase-js";
import { discoverLeagues, fetchLeagueMatches } from "../lib/bsm";
import { MANUAL_LEAGUES } from "../lib/config";
import type { Match } from "../lib/bsm";

type LeagueMatch = Match & { leagueId: string; leagueName: string };
type Field = NonNullable<Match["field"]>;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const NOMINATIM_DELAY_MS = 1100;
const USER_AGENT = "Umpire-Map-Sync/1.0 (github.com/riser999-999/Umpire_Map)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addressKey(field: Field): string {
  return `${field.street}|${field.postal_code}|${field.city}`.trim().toLowerCase();
}

async function geocodeAddress(field: Field): Promise<{ lat: number; lng: number } | null> {
  const q = `${field.street}, ${field.postal_code} ${field.city}, Deutschland`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=de`;

  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.error(`Nominatim returned ${res.status} for "${q}"`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.error(`No geocoding result for "${q}"`);
      return null;
    }
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error(`Geocoding failed for "${q}":`, err);
    return null;
  }
}

async function syncLeagues(
  leagues: { id: string; name: string; acronym: string; classification: string }[]
) {
  const rows = leagues.map((l) => ({
    id: l.id,
    name: l.name,
    acronym: l.acronym,
    classification: l.classification,
  }));

  const { error } = await supabase.from("leagues").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Failed to upsert leagues:", error);
    process.exit(1);
  }
  console.log(`Synced ${rows.length} leagues.`);
}

async function syncVenues(matches: LeagueMatch[]): Promise<Map<string, string>> {
  const fieldByKey = new Map<string, Field>();
  for (const m of matches) {
    if (!m.field) continue;
    const key = addressKey(m.field);
    if (!fieldByKey.has(key)) fieldByKey.set(key, m.field);
  }

  const keys = Array.from(fieldByKey.keys());
  if (keys.length === 0) return new Map();

  const { data: existing, error: fetchError } = await supabase
    .from("venues")
    .select("id, address_key")
    .in("address_key", keys);

  if (fetchError) {
    console.error("Failed to fetch existing venues:", fetchError);
    process.exit(1);
  }

  const existingKeys = new Set((existing ?? []).map((v: any) => v.address_key as string));
  const missingKeys = keys.filter((key) => !existingKeys.has(key));

  if (missingKeys.length > 0) {
    console.log(`Geocoding ${missingKeys.length} new venue address(es)...`);
    const newRows: any[] = [];

    for (const key of missingKeys) {
      const field = fieldByKey.get(key)!;
      console.log(`Geocoding: ${field.street}, ${field.postal_code} ${field.city}`);
      const coords = await geocodeAddress(field);
      newRows.push({
        address_key: key,
        name: field.name,
        street: field.street,
        postal_code: field.postal_code,
        city: field.city,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      await sleep(NOMINATIM_DELAY_MS);
    }

    const { error: upsertError } = await supabase
      .from("venues")
      .upsert(newRows, { onConflict: "address_key" });

    if (upsertError) {
      console.error("Failed to upsert venues:", upsertError);
      process.exit(1);
    }
    console.log(`Synced ${newRows.length} new venue(s).`);
  } else {
    console.log("No new venues to geocode.");
  }

  const { data: allVenues, error: refetchError } = await supabase
    .from("venues")
    .select("id, address_key")
    .in("address_key", keys);

  if (refetchError) {
    console.error("Failed to re-fetch venues:", refetchError);
    process.exit(1);
  }

  const venueIdByKey = new Map<string, string>();
  for (const v of allVenues ?? []) {
    venueIdByKey.set(v.address_key, v.id);
  }
  return venueIdByKey;
}

async function syncMatches(matches: LeagueMatch[], venueIdByKey: Map<string, string>) {
  const rows = matches.map((m) => ({
    id: m.id,
    time: m.time,
    home_team_name: m.home_team_name,
    away_team_name: m.away_team_name,
    league_id: m.leagueId,
    league_name: m.leagueName,
    venue_id: m.field ? venueIdByKey.get(addressKey(m.field)) ?? null : null,
  }));

  const { error } = await supabase.from("matches").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Failed to upsert matches:", error);
    process.exit(1);
  }
  console.log(`Synced ${rows.length} matches.`);
}

async function main() {
  console.log("Starting BSM -> Supabase sync...");

  const discovered = await discoverLeagues();
  const allLeagues = [
    ...discovered,
    ...MANUAL_LEAGUES.map((l) => ({ ...l, acronym: l.id, classification: "" })),
  ];
  const uniqueLeagues = Array.from(new Map(allLeagues.map((l) => [l.url, l])).values());

  if (uniqueLeagues.length === 0) {
    console.error("No leagues discovered, aborting sync.");
    process.exit(1);
  }

  await syncLeagues(uniqueLeagues);

  const allMatches: LeagueMatch[] = [];
  for (const league of uniqueLeagues) {
    const matches = await fetchLeagueMatches(league.url);
    if (!matches) continue;
    for (const m of matches) {
      allMatches.push({ ...m, leagueId: league.id, leagueName: league.name });
    }
  }

  const seen = new Set<number>();
  const uniqueMatches = allMatches.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(`Fetched ${uniqueMatches.length} unique matches across ${uniqueLeagues.length} leagues.`);

  const venueIdByKey = await syncVenues(uniqueMatches);
  await syncMatches(uniqueMatches, venueIdByKey);

  console.log("Sync completed successfully.");
}

main().catch((err) => {
  console.error("Sync failed with an unexpected error:", err);
  process.exit(1);
});
