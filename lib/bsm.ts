import { API_KEY, DBV_ORG_ID, RELEVANT_CLASSIFICATIONS, MANUAL_LEAGUES } from "./config";

export interface UmpireAssignment {
  assignment_type: string;
  crew_chief: boolean;
  license: {
    person: {
      first_name: string;
      last_name: string;
    };
    sleeve_number?: number;
    level: string;
  };
}

export interface Match {
  id: number;
  match_id: string;
  time: string;
  state: string;
  human_state: string;
  home_runs: number | null;
  away_runs: number | null;
  home_team_name: string;
  away_team_name: string;
  umpire_assignments: UmpireAssignment[];
  field?: {
    name: string;
    street: string;
    postal_code: string;
    city: string;
  };
  league: {
    name: string;
    acronym: string;
    classification: string;
  };
}

export interface LeagueGroup {
  id: number;
  name: string;
  acronym: string;
  classification: string;
  human_classification: string;
  sport: string;
  human_sport: string;
  age_group: string;
  human_age_group: string;
}

export function parseDate(dateStr: string): Date {
  const normalized = dateStr
    .trim()
    .replace(" ", "T")
    .replace(/\s+([+-])/, "$1")
    .replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
  return new Date(normalized);
}

export async function discoverLeagues(): Promise<{ id: string; name: string; url: string; acronym: string; classification: string }[]> {
  if (!API_KEY) {
    console.error("BSM_API_KEY is not set!");
    return [];
  }
  const url = `https://bsm.baseball-softball.de/organizations/${DBV_ORG_ID}/league_groups.json?api_key=${API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    console.error(`league_groups API returned ${res.status}`);
    return [];
  }
  const all: LeagueGroup[] = await res.json();
  const filtered = all.filter((lg) => {
    const sport = (lg.sport || lg.human_sport || "").toLowerCase();
    const isBaseball = sport.includes("baseball") && !sport.includes("softball");
    const classif = (lg.classification || lg.human_classification || "").toLowerCase();
    const isRelevant = RELEVANT_CLASSIFICATIONS.some((c) =>
      classif.includes(c.toLowerCase())
    );
    return isBaseball && isRelevant;
  });
  return filtered.map((lg) => ({
    id: String(lg.id),
    name: `${lg.name} (${lg.human_classification || lg.classification})`,
    acronym: lg.acronym,
    classification: lg.human_classification || lg.classification,
    url: `https://bsm.baseball-softball.de/league_groups/${encodeURIComponent(lg.acronym.toLowerCase())}/matches.json?api_key=${API_KEY}`,
  }));
}

export async function fetchLeagueMatches(url: string): Promise<Match[] | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.status === 404 || res.status === 422 || res.status === 400) return null;
    if (!res.ok) {
      console.warn(`BSM API ${res.status} for ${url}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err);
    return null;
  }
}

export async function fetchAllMatches(): Promise<(Match & { leagueName: string; leagueId: string })[]> {
  const discovered = await discoverLeagues();
  const allLeagues = [
    ...discovered,
    ...MANUAL_LEAGUES.map((l) => ({ ...l, acronym: l.id, classification: "" })),
  ];
  const uniqueLeagues = Array.from(new Map(allLeagues.map((l) => [l.url, l])).values());

  const results = await Promise.allSettled(
    uniqueLeagues.map((league) =>
      fetchLeagueMatches(league.url).then((matches) => {
        if (!matches) return [] as (Match & { leagueName: string; leagueId: string })[];
        return matches.map((m) => ({
          ...m,
          leagueName: league.name,
          leagueId: league.id,
        }));
      })
    )
  );

  const allMatches = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => (r as PromiseFulfilledResult<(Match & { leagueName: string; leagueId: string })[]>).value);

  const seen = new Set<number>();
  return allMatches.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function formatDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

export function formatTime(dateStr: string): string {
  return parseDate(dateStr).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function formatMonthYear(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

export function positionLabel(type: string): string {
  const map: Record<string, string> = {
    HP: "Home Plate",
    "1B": "1st Base",
    "3B": "3rd Base",
    "2B": "2nd Base",
    LF: "Left Field",
    RF: "Right Field",
  };
  return map[type] ?? type;
}
