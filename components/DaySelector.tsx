import React, { useEffect, useRef } from "react";
import { parseDate } from "../lib/bsm";

interface Props {
  days: string[];
  selectedDay: string | null;
  matchCountByDay: Record<string, number>;
  onSelect: (day: string) => void;
}

export default function DaySelector({ days, selectedDay, matchCountByDay, onSelect }: Props) {
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedDay]);

  function formatDayLabel(dateStr: string): string {
    return parseDate(dateStr).toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "Europe/Berlin",
    });
  }

  return (
    <div style={{
      display: "flex",
      gap: "8px",
      overflowX: "auto",
      padding: "12px 16px",
      backgroundColor: "#0f172a",
      borderBottom: "1px solid #1e293b",
      scrollbarWidth: "thin",
      scrollbarColor: "#334155 #0f172a",
    }}>
      {days.map((day) => {
        const isActive = day === selectedDay;
        return (
          <button
            key={day}
            ref={isActive ? activeButtonRef : undefined}
            onClick={() => onSelect(day)}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: isActive ? 700 : 500,
              backgroundColor: isActive ? "#3b82f6" : "#1e293b",
              color: isActive ? "#ffffff" : "#94a3b8",
              transition: "background-color 0.15s, color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {formatDayLabel(day)}
            <span style={{
              marginLeft: "6px",
              padding: "2px 6px",
              borderRadius: "10px",
              fontSize: "11px",
              backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "#334155",
              color: isActive ? "#ffffff" : "#64748b",
            }}>
              {matchCountByDay[day] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
