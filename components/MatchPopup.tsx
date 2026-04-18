import React from "react";
import { formatTime, positionLabel } from "../lib/bsm";
import type { Match } from "../lib/bsm";

interface Props {
  fieldName: string;
  fieldAddress: string;
  matches: (Match & { leagueName: string; leagueId: string })[];
}

function stateColor(state: string): string {
  switch (state) {
    case "confirmed": return "#22c55e";
    case "cancelled": return "#ef4444";
    case "postponed": return "#f59e0b";
    case "final": return "#6366f1";
    default: return "#64748b";
  }
}

export default function MatchPopup({ fieldName, fieldAddress, matches }: Props) {
  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      minWidth: "260px",
      maxWidth: "340px",
      color: "#e2e8f0",
    }}>
      <div style={{
        padding: "10px 12px 8px",
        borderBottom: "1px solid #334155",
        backgroundColor: "#0f172a",
        borderRadius: "6px 6px 0 0",
      }}>
        <div style={{ fontWeight: 700, fontSize: "14px", color: "#f1f5f9" }}>
          📍 {fieldName}
        </div>
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
          {fieldAddress}
        </div>
      </div>

      {matches.map((match) => (
        <div key={match.id} style={{
          padding: "10px 12px",
          backgroundColor: "#1e293b",
          borderBottom: "1px solid #334155",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "#f1f5f9", flex: 1 }}>
              {match.home_team_name} vs {match.away_team_name}
            </div>
            {match.home_runs !== null && match.away_runs !== null && (
              <div style={{
                fontWeight: 700,
                fontSize: "13px",
                color: "#3b82f6",
                whiteSpace: "nowrap",
              }}>
                {match.home_runs} : {match.away_runs}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
              🕐 {formatTime(match.time)} Uhr
            </span>
            <span style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "4px",
              backgroundColor: "#1e3a5f",
              color: "#93c5fd",
            }}>
              {match.league.acronym || match.league.name}
            </span>
            <span style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "4px",
              backgroundColor: stateColor(match.state) + "22",
              color: stateColor(match.state),
            }}>
              {match.human_state}
            </span>
          </div>

          {match.umpire_assignments && match.umpire_assignments.length > 0 && (
            <div style={{ borderTop: "1px solid #334155", paddingTop: "6px" }}>
              {match.umpire_assignments.map((ua, i) => (
                <div key={i} style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.6" }}>
                  <span style={{ color: "#64748b" }}>{positionLabel(ua.assignment_type)}:</span>{" "}
                  {ua.license.person.first_name} {ua.license.person.last_name}
                  {ua.crew_chief && (
                    <span style={{ marginLeft: "4px", color: "#fbbf24", fontSize: "10px" }}>CC</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
