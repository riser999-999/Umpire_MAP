import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import type { Match } from "../lib/bsm";
import { parseDate, dayKey, formatDate, formatTime } from "../lib/bsm";
import DaySelector from "../components/DaySelector";

const MapView = dynamic(() => import("../components/MapView"), { ssr: false });

type MatchWithLeague = Match & { leagueName: string; leagueId: string };

function getDayKey(dateStr: string): string {
  return dayKey(parseDate(dateStr));
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

export default function HomePage() {
  const [matches, setMatches] = useState<MatchWithLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matches")
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        const headerValue = r.headers.get("X-Last-Updated");
        if (headerValue) setLastUpdated(headerValue);
        return r.json();
      })
      .then((data: MatchWithLeague[]) => {
        setMatches(data);
        setLoading(false);

        // Build sorted unique days
        const dayMap = new Map<string, string>();
        for (const m of data) {
          const key = getDayKey(m.time);
          if (!dayMap.has(key)) dayMap.set(key, m.time);
        }
        const sortedDays = Array.from(dayMap.entries())
          .sort(([, a], [, b]) => parseDate(a).getTime() - parseDate(b).getTime())
          .map(([, time]) => time);

        const defaultDay = selectDefaultDay(sortedDays);
        setSelectedDay(defaultDay);
      })
      .catch((err) => {
        console.error(err);
        setError("Fehler beim Laden der Spieldaten. Bitte später erneut versuchen.");
        setLoading(false);
      });
  }, []);

  // Sorted unique days (representative time per day key) and match counts,
  // computed in a single pass over `matches` and only recomputed when the
  // match list itself changes (not on every day-selection re-render).
  const { sortedDays, matchCountByDay } = useMemo(() => {
    const dayRepByKey = new Map<string, string>();
    const countByKey = new Map<string, number>();
    for (const m of matches) {
      const key = getDayKey(m.time);
      if (!dayRepByKey.has(key)) dayRepByKey.set(key, m.time);
      countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    }
    const sortedDays = Array.from(dayRepByKey.entries())
      .sort(([, a], [, b]) => parseDate(a).getTime() - parseDate(b).getTime())
      .map(([, time]) => time);
    const matchCountByDay: Record<string, number> = {};
    dayRepByKey.forEach((rep, key) => {
      matchCountByDay[rep] = countByKey.get(key) ?? 0;
    });
    return { sortedDays, matchCountByDay };
  }, [matches]);

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
          {lastUpdated && (
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              Aktualisiert: {formatDate(lastUpdated)} {formatTime(lastUpdated)} Uhr
            </p>
          )}
        </header>

        {/* Day Selector */}
        {!loading && !error && sortedDays.length > 0 && (
          <DaySelector
            days={sortedDays}
            selectedDay={selectedDay}
            matchCountByDay={matchCountByDay}
            onSelect={setSelectedDay}
          />
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {loading && (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              fontSize: "15px",
            }}>
              Lade Spiele...
            </div>
          )}

          {error && (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              textAlign: "center",
              color: "#ef4444",
              fontSize: "14px",
            }}>
              {error}
            </div>
          )}

          {!loading && !error && !selectedDay && (
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

          {!loading && !error && selectedDay && (
            <MapView matches={matches} selectedDay={selectedDay} />
          )}
        </main>
      </div>
    </>
  );
}
