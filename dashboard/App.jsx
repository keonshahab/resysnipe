import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ─── DESIGN TOKENS ───
const COLORS = {
  bg: "#0a0a0c",
  surface: "#111114",
  surfaceHover: "#18181c",
  border: "#1e1e24",
  borderActive: "#2a2a32",
  text: "#e8e8ec",
  textMuted: "#6b6b78",
  textDim: "#44444f",
  accent: "#c8ff00",
  accentDim: "#6b8800",
  green: "#00e676",
  greenDim: "#003d1f",
  amber: "#ffab00",
  amberDim: "#3d2900",
  red: "#ff1744",
  redDim: "#3d0011",
  gray: "#3a3a44",
  grayDim: "#1a1a1f",
};

const FONT = {
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  sans: "'DM Sans', 'Satoshi', system-ui, sans-serif",
};

// ─── API HELPERS ───
async function apiFetch(url) {
  const res = await fetch(url);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  return res.json();
}

// ─── UTILITY FUNCTIONS ───
function formatTimeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatCountdown(targetISO) {
  if (!targetISO) return "—";
  const diff = new Date(targetISO) - Date.now();
  if (diff <= 0) return "NOW";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function priceSymbol(n) {
  return "$".repeat(n || 1);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── COMPONENTS ───

function StatusDot({ status }) {
  const colorMap = {
    booked: COLORS.green,
    polling: COLORS.amber,
    waiting: COLORS.gray,
    monitoring: COLORS.amber,
    failed: COLORS.red,
    stopped: COLORS.textDim,
  };
  const color = colorMap[status] || COLORS.textDim;
  const shouldPulse = status === "polling" || status === "monitoring";

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      {shouldPulse && (
        <span
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: color,
            opacity: 0.3,
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      )}
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color, position: "relative", zIndex: 1 }} />
    </span>
  );
}

function StatusLabel({ status, mode }) {
  const labelMap = {
    booked: "BOOKED",
    polling: "SNIPING",
    waiting: "WAITING",
    monitoring: "MONITORING",
    failed: "FAILED",
    stopped: "STOPPED",
  };
  const colorMap = {
    booked: COLORS.green,
    polling: COLORS.amber,
    waiting: COLORS.textMuted,
    monitoring: COLORS.amber,
    failed: COLORS.red,
    stopped: COLORS.textDim,
  };
  return (
    <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: colorMap[status] }}>
      {labelMap[status]}
    </span>
  );
}

function WatchCard({ watch, onClick }) {
  const bgMap = {
    booked: `linear-gradient(135deg, ${COLORS.greenDim}40, ${COLORS.surface})`,
    polling: `linear-gradient(135deg, ${COLORS.amberDim}30, ${COLORS.surface})`,
    waiting: COLORS.surface,
    monitoring: `linear-gradient(135deg, ${COLORS.amberDim}20, ${COLORS.surface})`,
    failed: `linear-gradient(135deg, ${COLORS.redDim}30, ${COLORS.surface})`,
  };
  const borderMap = {
    booked: COLORS.green + "30",
    polling: COLORS.amber + "20",
    waiting: COLORS.border,
    monitoring: COLORS.amber + "15",
    failed: COLORS.red + "20",
  };

  const seatType = watch.seatType || watch.filters?.seatTypes?.[0] || "";

  return (
    <div
      onClick={onClick}
      style={{
        background: bgMap[watch.status] || COLORS.surface,
        border: `1px solid ${borderMap[watch.status] || COLORS.border}`,
        borderRadius: 8,
        padding: "16px 18px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        minWidth: 220,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderActive;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = borderMap[watch.status] || COLORS.border;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <StatusDot status={watch.status} />
        <StatusLabel status={watch.status} mode={watch.mode} />
      </div>

      <div style={{ fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
        {watch.venueName}
      </div>

      <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>
        {watch.targetDate ? formatDate(watch.targetDate) : (watch.dates || []).map(formatDate).join(", ")} · {watch.partySize}p{seatType ? ` · ${seatType}` : ""}
      </div>

      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textDim }}>
        {watch.status === "booked" && (
          <span style={{ color: COLORS.green }}>
            Booked {watch.bookedTime} at {watch.bookedAt}
          </span>
        )}
        {watch.status === "polling" && (
          <span>
            {(watch.pollCount || 0).toLocaleString()} polls · {watch.slotsFound || 0} found
          </span>
        )}
        {watch.status === "waiting" && watch.releaseTime && (
          <span>Release in {formatCountdown(watch.releaseTime)}</span>
        )}
        {watch.status === "monitoring" && (
          <span style={{ color: COLORS.amber }}>
            {watch.slotsFound || 0} slots · {formatTimeAgo(watch.lastCheck)}
          </span>
        )}
        {watch.status === "stopped" && <span>Stopped</span>}
      </div>
    </div>
  );
}

function StatsBar({ watches }) {
  const active = watches.filter((w) => ["polling", "monitoring", "waiting"].includes(w.status)).length;
  const booked = watches.filter((w) => w.status === "booked").length;
  const totalPolls = watches.reduce((sum, w) => sum + (w.pollCount || 0), 0);

  return (
    <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, display: "flex", gap: 16 }}>
      <span>
        <span style={{ color: COLORS.text }}>{active}</span> active
      </span>
      <span>
        <span style={{ color: COLORS.green }}>{booked}</span> booked
      </span>
      <span>
        <span style={{ color: COLORS.text }}>{totalPolls.toLocaleString()}</span> polls
      </span>
    </div>
  );
}

function SearchResult({ result, onSelect }) {
  return (
    <div
      onClick={() => onSelect(result)}
      style={{
        padding: "10px 14px",
        cursor: "pointer",
        borderBottom: `1px solid ${COLORS.border}`,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: COLORS.text }}>
            {result.name}
          </span>
          <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
            {(result.cuisine || [])[0] || ""} · {result.neighborhood}
          </span>
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textMuted, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{priceSymbol(result.priceRange)}</span>
          {result.rating > 0 && <span style={{ color: COLORS.accent }}>★ {result.rating}</span>}
          {result.isGDA && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 3,
                background: COLORS.accent + "15",
                color: COLORS.accent,
                fontWeight: 600,
              }}
            >
              GDA
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function WatchDetailView({ watch, onBack, onStop, onStart, onDelete }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const running = watch.startedAt ? formatDuration(now - watch.startedAt) : "—";
  const lastCheckStr = watch.lastCheck ? formatTimeAgo(watch.lastCheck) : "—";
  const modeLabel = {
    release: "RELEASE SNIPE",
    cancellation: "CANCELLATION SNIPE",
    monitor: "MONITOR",
  };

  const seatType = watch.seatType || watch.filters?.seatTypes?.[0] || "—";

  return (
    <div>
      <div
        onClick={onBack}
        style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, cursor: "pointer", marginBottom: 24, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ fontSize: 16 }}>←</span> Dashboard
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 24, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
          {watch.venueName}
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 13, color: COLORS.textMuted }}>
          {watch.targetDate ? formatDate(watch.targetDate) : (watch.dates || []).map(formatDate).join(", ")} · {watch.partySize} guests · {seatType}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textMuted }}>
          {modeLabel[watch.mode] || watch.mode}
        </span>
        <StatusDot status={watch.status} />
        <StatusLabel status={watch.status} mode={watch.mode} />
      </div>

      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px 32px",
          marginBottom: 24,
        }}
      >
        {[
          { label: "Polls", value: (watch.pollCount || 0).toLocaleString() },
          { label: "Interval", value: watch.mode === "release" ? "500ms" : watch.mode === "cancellation" ? "3s" : "60s" },
          { label: "Running", value: running },
          { label: "Last check", value: lastCheckStr },
          { label: "Slots found", value: String(watch.slotsFound || 0) },
          {
            label: "Status",
            value: watch.status === "booked" ? `Booked ${watch.bookedTime || ""}` : watch.status === "waiting" ? `Release in ${formatCountdown(watch.releaseTime)}` : watch.status === "stopped" ? "Stopped" : "Active",
          },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 600, color: COLORS.text }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {watch.status !== "stopped" && watch.status !== "booked" && (
          <button
            onClick={() => onStop(watch.id)}
            style={{
              fontFamily: FONT.mono, fontSize: 11, padding: "8px 16px",
              background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, color: COLORS.amber, cursor: "pointer",
            }}
          >
            Stop
          </button>
        )}
        {watch.status === "stopped" && (
          <button
            onClick={() => onStart(watch.id)}
            style={{
              fontFamily: FONT.mono, fontSize: 11, padding: "8px 16px",
              background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, color: COLORS.green, cursor: "pointer",
            }}
          >
            Resume
          </button>
        )}
        <button
          onClick={() => { onDelete(watch.id); onBack(); }}
          style={{
            fontFamily: FONT.mono, fontSize: 11, padding: "8px 16px",
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 6, color: COLORS.red, cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function NewSnipeView({ onBack, onCreated }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [venueInfo, setVenueInfo] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [earliest, setEarliest] = useState("18:00");
  const [latest, setLatest] = useState("21:00");
  const [seatTypes, setSeatTypes] = useState(["Dining Room"]);
  const [submitting, setSubmitting] = useState(false);
  const [hitlist, setHitlist] = useState([]);
  const searchTimeout = useRef(null);

  useEffect(() => {
    apiFetch("/api/hitlist").then((data) => {
      setHitlist(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const handleSearch = useCallback((q) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      }
    }, 250);
  }, []);

  const handleSelect = async (result) => {
    setSelected(result);
    setResults([]);
    setQuery("");
    try {
      const info = await apiFetch(`/api/venue/${result.id}`);
      setVenueInfo(info);
    } catch {
      setVenueInfo(null);
    }
  };

  const expandedDates = (() => {
    if (!dateFrom) return [];
    if (!dateTo || dateTo <= dateFrom) return [dateFrom];
    const dates = [];
    const end = new Date(dateTo + "T12:00:00");
    let cur = new Date(dateFrom + "T12:00:00");
    while (cur <= end) {
      dates.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  })();

  const handleActivate = async () => {
    if (submitting || !selected || expandedDates.length === 0) return;
    setSubmitting(true);

    for (const date of expandedDates) {
      await apiPost("/api/watches", {
        venueId: selected.id,
        venueName: selected.name,
        neighborhood: selected.neighborhood,
        cuisine: selected.cuisine,
        targetDate: date,
        partySize,
        timeRange: { earliest, latest },
        autoBook: true,
        filters: { seatTypes },
        mode: "cancellation", // server can auto-detect, default to cancellation
        releaseTime: venueInfo?.releasePolicy ? undefined : undefined,
      });
    }

    setSubmitting(false);
    onCreated();
  };

  const policyText = venueInfo?.releasePolicy
    ? `Releases ${venueInfo.releasePolicy.advanceDays} days ahead at ${venueInfo.releasePolicy.releaseHour > 12 ? venueInfo.releasePolicy.releaseHour - 12 : venueInfo.releasePolicy.releaseHour}:${String(venueInfo.releasePolicy.releaseMinute).padStart(2, "0")} ${venueInfo.releasePolicy.releaseHour >= 12 ? "PM" : "AM"} ${venueInfo.releasePolicy.timezone}`
    : venueInfo?.needToKnow || null;

  return (
    <div>
      <div
        onClick={onBack}
        style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, cursor: "pointer", marginBottom: 24, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ fontSize: 16 }}>←</span> Dashboard
      </div>

      {/* Hitlist */}
      {!selected && hitlist.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Your Saves
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 4,
              scrollbarWidth: "thin",
            }}
          >
            {hitlist.map((h) => (
              <div
                key={h.id}
                onClick={() => handleSelect(h)}
                style={{
                  flexShrink: 0,
                  width: 160,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.accent + "40";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {h.name}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textMuted, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {h.neighborhood}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{(h.cuisine || [])[0] || ""}</span>
                  {h.rating > 0 && <span style={{ color: COLORS.accent }}>★ {h.rating}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ position: "relative", marginBottom: selected ? 24 : 0 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search restaurants..."
          style={{
            width: "100%",
            padding: "12px 16px",
            fontFamily: FONT.sans,
            fontSize: 15,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.text,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => (e.target.style.borderColor = COLORS.accent + "40")}
          onBlur={(e) => setTimeout(() => (e.target.style.borderColor = COLORS.border), 200)}
        />
        {results.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              marginTop: 4,
              zIndex: 100,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {results.map((r) => (
              <SearchResult key={r.id} result={r} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>

      {/* Selected venue */}
      {selected && (
        <>
          <div
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: 18,
              marginBottom: 20,
            }}
          >
            <div style={{ fontFamily: FONT.sans, fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
              {selected.name}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, marginBottom: policyText ? 8 : 0 }}>
              {selected.neighborhood} · {(selected.cuisine || [])[0] || ""} · {priceSymbol(selected.priceRange)}
              {selected.rating > 0 && <>{" · "}<span style={{ color: COLORS.accent }}>★ {selected.rating}</span></>}
            </div>
            {policyText && (
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: COLORS.accent,
                  background: COLORS.accent + "10",
                  padding: "6px 10px",
                  borderRadius: 4,
                  display: "inline-block",
                }}
              >
                {policyText}
              </div>
            )}
          </div>

          {/* Config */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {/* Date range */}
            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  if (!dateTo || e.target.value > dateTo) setDateTo(e.target.value);
                }}
                style={{
                  fontFamily: FONT.mono, fontSize: 12, padding: "8px 12px", width: "100%",
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, color: COLORS.text, outline: "none", colorScheme: "dark", boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                To
              </label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  fontFamily: FONT.mono, fontSize: 12, padding: "8px 12px", width: "100%",
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, color: COLORS.text, outline: "none", colorScheme: "dark", boxSizing: "border-box",
                }}
              />
            </div>
            {expandedDates.length > 1 && (
              <div style={{ gridColumn: "1 / -1", fontFamily: FONT.mono, fontSize: 11, color: COLORS.textMuted }}>
                {expandedDates.length} days: {expandedDates.map(formatDate).join(", ")}
              </div>
            )}

            {/* Party size */}
            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Party Size
              </label>
              <select
                value={partySize}
                onChange={(e) => setPartySize(parseInt(e.target.value))}
                style={{
                  fontFamily: FONT.mono, fontSize: 12, padding: "8px 12px",
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, color: COLORS.text, outline: "none", width: "100%", colorScheme: "dark",
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Time range */}
            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Time Range
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)}
                  style={{
                    fontFamily: FONT.mono, fontSize: 12, padding: "8px 10px",
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: 6, color: COLORS.text, outline: "none", colorScheme: "dark", flex: 1,
                  }}
                />
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textDim }}>to</span>
                <input
                  type="time" value={latest} onChange={(e) => setLatest(e.target.value)}
                  style={{
                    fontFamily: FONT.mono, fontSize: 12, padding: "8px 10px",
                    background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                    borderRadius: 6, color: COLORS.text, outline: "none", colorScheme: "dark", flex: 1,
                  }}
                />
              </div>
            </div>

            {/* Seat types */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Seat Type
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Dining Room", "Bar", "Patio"].map((seat) => {
                  const active = seatTypes.includes(seat);
                  return (
                    <button
                      key={seat}
                      onClick={() => {
                        if (active) setSeatTypes(seatTypes.filter((s) => s !== seat));
                        else setSeatTypes([...seatTypes, seat]);
                      }}
                      style={{
                        fontFamily: FONT.mono, fontSize: 11, padding: "6px 12px",
                        background: active ? COLORS.accent + "15" : "transparent",
                        border: `1px solid ${active ? COLORS.accent + "40" : COLORS.border}`,
                        borderRadius: 6,
                        color: active ? COLORS.accent : COLORS.textMuted,
                        cursor: "pointer", transition: "all 0.1s",
                      }}
                    >
                      {active ? "✓ " : ""}{seat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleActivate}
            disabled={expandedDates.length === 0 || submitting}
            style={{
              width: "100%",
              padding: "14px 0",
              fontFamily: FONT.mono,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: expandedDates.length > 0 && !submitting ? COLORS.accent : COLORS.gray,
              color: expandedDates.length > 0 && !submitting ? COLORS.bg : COLORS.textDim,
              border: "none",
              borderRadius: 8,
              cursor: expandedDates.length > 0 && !submitting ? "pointer" : "default",
              transition: "all 0.15s",
            }}
          >
            {submitting ? "CREATING..." : expandedDates.length > 1 ? `START SNIPING (${expandedDates.length} DAYS)` : "START SNIPING"}
          </button>
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ───
function App() {
  const [view, setView] = useState("dashboard");
  const [watches, setWatches] = useState([]);
  const [selectedWatch, setSelectedWatch] = useState(null);

  // Fetch watches on load
  useEffect(() => {
    apiFetch("/api/watches").then(setWatches).catch(() => {});
  }, []);

  // SSE connection for live updates
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "watches") {
          setWatches(event.data);
        } else if (event.type === "poll" || event.type === "booked" || event.type === "slot_found") {
          // Incremental update — refetch full list
          apiFetch("/api/watches").then(setWatches).catch(() => {});
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  const handleStop = async (id) => {
    await apiPost(`/api/watches/${id}/stop`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  const handleStart = async (id) => {
    await apiPost(`/api/watches/${id}/start`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  const handleDelete = async (id) => {
    await apiDelete(`/api/watches/${id}`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        color: COLORS.text,
        padding: "24px 28px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(2.2); opacity: 0; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 4px; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
        }
      `}</style>

      {view === "dashboard" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.02em" }}>
              Resy<span style={{ color: COLORS.accent }}>Snipe</span>
            </div>
            <button
              onClick={() => setView("new")}
              style={{
                fontFamily: FONT.mono, fontSize: 11, fontWeight: 600,
                padding: "8px 14px", background: COLORS.accent,
                color: COLORS.bg, border: "none", borderRadius: 6,
                cursor: "pointer", letterSpacing: "0.02em", transition: "opacity 0.1s",
              }}
              onMouseEnter={(e) => (e.target.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.target.style.opacity = "1")}
            >
              + NEW SNIPE
            </button>
          </div>

          <div style={{ marginBottom: 24 }}>
            <StatsBar watches={watches} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {watches.map((w) => (
              <WatchCard
                key={w.id}
                watch={w}
                onClick={() => {
                  setSelectedWatch(w.id);
                  setView("detail");
                }}
              />
            ))}
          </div>

          {watches.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontFamily: FONT.mono, fontSize: 13, color: COLORS.textDim, marginBottom: 16 }}>No active watches</div>
              <button
                onClick={() => setView("new")}
                style={{
                  fontFamily: FONT.mono, fontSize: 12, padding: "10px 20px",
                  background: COLORS.accent, color: COLORS.bg, border: "none",
                  borderRadius: 6, cursor: "pointer", fontWeight: 600,
                }}
              >
                + New Snipe
              </button>
            </div>
          )}
        </>
      )}

      {view === "new" && (
        <NewSnipeView
          onBack={() => setView("dashboard")}
          onCreated={async () => {
            const data = await apiFetch("/api/watches");
            setWatches(data);
            setView("dashboard");
          }}
        />
      )}

      {view === "detail" && selectedWatch && (() => {
        const detailWatch = watches.find((w) => w.id === selectedWatch) || null;
        return detailWatch ? (
          <WatchDetailView
            watch={detailWatch}
            onBack={() => setView("dashboard")}
            onStop={handleStop}
            onStart={handleStart}
            onDelete={handleDelete}
          />
        ) : null;
      })()}
    </div>
  );
}

// ─── MOUNT ───
createRoot(document.getElementById("root")).render(<App />);
