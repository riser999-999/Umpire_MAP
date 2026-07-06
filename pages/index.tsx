import React, { useMemo, useState } from "react";
import type { GetStaticProps } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import { parseDate } from "../lib/bsm";
import { fetchMatchesFromSupabase, type MatchWithLeague } from "../lib/matches";
import DaySelector from "../components/DaySelector";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

export const getStaticProps: GetStaticProps<{ initialMatches: MatchWithLeague[] }> = async () => {
  const initialMatches = await fetchMatchesFromSupabase();
  return {
    props: { initialMatches },
    revalidate: 60,
  };
};

function getDayKey(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Single pass over matches: groups by calendar day (Europe/Berlin) and counts
// per day, instead of re-scanning the full match list once per render.
function groupByDay(matches: MatchWithLeague[]): {
  sortedDays: string[];
  matchCountByDay: Record<string, number>;
} {
  const repByKey = new Map<string, string>();
  const countByKey = new Map<string, number>();

  for (const m of matches) {
    const key = getDayKey(m.time);
    if (!repByKey.has(key)) repByKey.set(key, m.time);
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  const sortedDays = Array.from(repByKey.values()).sort(
    (a, b) => parseDate(a).getTime() - parseDate(b).getTime()
  );

  const matchCountByDay: Record<string, number> = {};
  Array.from(repByKey.entries()).forEach(([key, rep]) => {
    matchCountByDay[rep] = countByKey.get(key) ?? 0;
  });

  return { sortedDays, matchCountByDay };
}

function selectDefaultDay(days: string[]): string | null {
  if (!days.length) return null;
  
  // Get current date in Europe/Berlin timezone
  const nowBerlin = new Date().toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // Find today's matches
  const todayMatches = days.filter((d) => getDayKey(d) === nowBerlin);
  if (todayMatches.length) return todayMatches[0];
  
  // If no today, find future matches
  const now = new Date();
  const future = days.filter((d) => parseDate(d) >= now);
  if (future.length) return future[0];
  
  // Otherwise return the last day
  return days[days.length - 1];
}

interface HomePageProps {
  initialMatches: MatchWithLeague[];
}

export default function HomePage({ initialMatches }: HomePageProps) {
  const [matches] = useState<MatchWithLeague[]>(initialMatches);
  const { sortedDays, matchCountByDay } = useMemo(() => groupByDay(matches), [matches]);
  const [selectedDay, setSelectedDay] = useState<string | null>(() => selectDefaultDay(sortedDays));

  return (
    <>
      <Head>
        <title>Umpire Map – Spielorte Übersicht</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0f172a",
      }}>
        {/* Header */}
        <header style={{
          padding: "16px 20px 12px",
          backgroundColor: "#0f172a",
          borderBottom: "1px solid #1e293b",
          flexShrink: 0,
        }}>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>
            ⚾ UMPIRE MAP
          </h1>
          <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
            Spielorte Saison 2026
          </p>
        </header>

        {/* Day Selector */}
        {sortedDays.length > 0 && (
          <DaySelector
            days={sortedDays}
            selectedDay={selectedDay}
            matchCountByDay={matchCountByDay}
            onSelect={setSelectedDay}
          />
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selectedDay && (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              fontSize: "14px",
            }}>
              Keine Spiele für diesen Tag gefunden.
            </div>
          )}

          {selectedDay && (
            <MapView matches={matches} selectedDay={selectedDay} />
          )}
        </main>
      </div>
    </>
  );
}
