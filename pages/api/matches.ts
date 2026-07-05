import type { NextApiRequest, NextApiResponse } from "next";
import { discoverLeagues, fetchLeagueMatches } from "../../lib/bsm";
import { MANUAL_LEAGUES } from "../../lib/config";
import type { Match } from "../../lib/bsm";

// Type for minimal match payload (OPTION 5: trim unnecessary fields)
type MinimalMatch = Pick<Match, 'id' | 'time' | 'field'> & {
  leagueName: string;
  leagueId: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const discovered = await discoverLeagues();
    const allLeagues = [
      ...discovered,
      ...MANUAL_LEAGUES.map((l) => ({ ...l, acronym: l.id, classification: "" })),
    ];
    const uniqueLeagues = Array.from(new Map(allLeagues.map((l) => [l.url, l])).values());

    const results = await Promise.allSettled(
      uniqueLeagues.map((league) =>
        fetchLeagueMatches(league.url).then((matches) => {
          if (!matches) return [] as MinimalMatch[];
          return matches.map((m) => ({
            id: m.id,
            time: m.time,
            field: m.field,
            leagueName: league.name,
            leagueId: league.id,
          }));
        })
      )
    );

    const allMatches = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<MinimalMatch[]>).value);

    const seen = new Set<number>();
    const unique = allMatches.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // OPTION 3: Extend cache control headers with stale-while-revalidate
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(unique);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Laden der Spiele" });
  }
}
