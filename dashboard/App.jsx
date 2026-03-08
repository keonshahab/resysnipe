import { useState, useEffect, useRef, useCallback } from "react";

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

// ─── MOCK DATA (simulates what SSE/API would return) ───
const MOCK_WATCHES = [
  {
    id: "booked-torrisi",
    venueName: "Torrisi",
    venueId: 64593,
    neighborhood: "SoHo",
    cuisine: "Italian",
    targetDate: "2026-03-14",
    partySize: 2,
    timeRange: { earliest: "18:00", latest: "21:00" },
    mode: "cancellation",
    status: "booked",
    seatType: "Dining Room",
    bookedTime: "7:30 PM",
    bookedAt: "2:47 PM",
    pollCount: 2847,
    startedAt: Date.now() - 3600000 * 4,
  },
  {
    id: "snipe-carbone",
    venueName: "Carbone",
    venueId: 6194,
    neighborhood: "Greenwich Village",
    cuisine: "Italian",
    targetDate: "2026-03-21",
    partySize: 2,
    timeRange: { earliest: "19:00", latest: "21:00" },
    mode: "cancellation",
    status: "polling",
    seatType: "Dining Room",
    pollCount: 3412,
    lastCheck: Date.now() - 2000,
    slotsFound: 0,
    startedAt: Date.now() - 3600000 * 2.78,
  },
  {
    id: "release-donangie",
    venueName: "Don Angie",
    venueId: 12345,
    neighborhood: "West Village",
    cuisine: "Italian-American",
    targetDate: "2026-04-07",
    partySize: 2,
    timeRange: { earliest: "19:00", latest: "21:00" },
    mode: "release",
    status: "waiting",
    seatType: "Dining Room",
    releaseTime: "2026-04-07T10:00:00-04:00",
    pollCount: 0,
    startedAt: Date.now(),
  },
  {
    id: "watch-carnemare",
    venueName: "Carne Mare",
    venueId: 55555,
    neighborhood: "Seaport",
    cuisine: "Steakhouse",
    targetDate: "2026-03-15",
    partySize: 2,
    timeRange: { earliest: "19:00", latest: "21:00" },
    mode: "monitor",
    status: "monitoring",
    seatType: "Dining Room",
    pollCount: 847,
    lastCheck: Date.now() - 30000,
    slotsFound: 3,
    startedAt: Date.now() - 3600000,
  },
];

const MOCK_SEARCH_RESULTS = [
  { id: 64593, name: "Torrisi", neighborhood: "SoHo", cuisine: ["Italian"], priceRange: 4, rating: 4.8, isGDA: true },
  { id: 6194, name: "Carbone", neighborhood: "Greenwich Village", cuisine: ["Italian"], priceRange: 4, rating: 4.7, isGDA: true },
  { id: 12345, name: "Don Angie", neighborhood: "West Village", cuisine: ["Italian-American"], priceRange: 3, rating: 4.6, isGDA: false },
  { id: 55555, name: "Carne Mare", neighborhood: "Seaport", cuisine: ["Steakhouse", "Italian"], priceRange: 3, rating: 4.5, isGDA: true },
  { id: 10726, name: "Crown Shy", neighborhood: "Financial District", cuisine: ["American", "Contemporary"], priceRange: 4, rating: 4.7, isGDA: true },
];

// ─── UTILITY FUNCTIONS ───
function formatTimeAgo(ts) {
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
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime24to12(t) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
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
    polling: mode === "cancellation" ? "SNIPING" : "SNIPING",
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
        {formatDate(watch.targetDate)} · {watch.partySize}p · {watch.seatType}
      </div>

      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textDim }}>
        {watch.status === "booked" && (
          <span style={{ color: COLORS.green }}>
            Booked {watch.bookedTime} at {watch.bookedAt}
          </span>
        )}
        {watch.status === "polling" && (
          <span>
            {watch.pollCount.toLocaleString()} polls · {watch.slotsFound} found
          </span>
        )}
        {watch.status === "waiting" && watch.releaseTime && (
          <span>Release in {formatCountdown(watch.releaseTime)}</span>
        )}
        {watch.status === "monitoring" && (
          <span style={{ color: COLORS.amber }}>
            {watch.slotsFound} slots · {formatTimeAgo(watch.lastCheck)}
          </span>
        )}
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
            {result.cuisine[0]} · {result.neighborhood}
          </span>
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textMuted, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{priceSymbol(result.priceRange)}</span>
          <span style={{ color: COLORS.accent }}>★ {result.rating}</span>
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

function WatchDetailView({ watch, onBack }) {
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
          {formatDate(watch.targetDate)}, 2026 · {watch.partySize} guests · {watch.seatType}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textMuted }}>
          {modeLabel[watch.mode]}
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
          { label: "Polls", value: watch.pollCount.toLocaleString() },
          { label: "Interval", value: watch.mode === "monitor" ? "60s" : watch.mode === "release" ? "500ms" : "3s" },
          { label: "Running", value: running },
          { label: "Last check", value: lastCheckStr },
          { label: "Slots found", value: String(watch.slotsFound || 0) },
          {
            label: "Status",
            value: watch.status === "booked" ? `Booked ${watch.bookedTime}` : watch.status === "waiting" ? `Release in ${formatCountdown(watch.releaseTime)}` : "Active",
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

      <div style={{ marginBottom: 16, fontFamily: FONT.mono, fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Activity Log
      </div>
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "4px 0",
          maxHeight: 200,
          overflow: "auto",
        }}
      >
        {Array.from({ length: 15 }, (_, i) => {
          const t = new Date(now - i * 3000);
          const timeStr = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
          const pollNum = (watch.pollCount || 0) - i;
          return (
            <div
              key={i}
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: COLORS.textDim,
                padding: "4px 14px",
                borderBottom: i < 14 ? `1px solid ${COLORS.border}` : "none",
              }}
            >
              <span style={{ color: COLORS.textMuted }}>{timeStr}</span>
              <span style={{ marginLeft: 12 }}>Poll #{pollNum}</span>
              <span style={{ marginLeft: 8 }}>— 0 slots</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {["Pause", "Stop", "Edit"].map((label) => (
          <button
            key={label}
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              padding: "8px 16px",
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: label === "Stop" ? COLORS.red : COLORS.textMuted,
              cursor: "pointer",
              transition: "all 0.1s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewSnipeView({ onBack, onActivate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dates, setDates] = useState([""]);
  const [partySize, setPartySize] = useState(2);
  const [earliest, setEarliest] = useState("18:00");
  const [latest, setLatest] = useState("21:00");
  const [seatTypes, setSeatTypes] = useState(["Dining Room"]);
  const [previews, setPreviews] = useState([]);
  const searchTimeout = useRef(null);

  const handleSearch = useCallback((q) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    searchTimeout.current = setTimeout(() => {
      // Mock search — in production this hits /api/search?q=...
      const filtered = MOCK_SEARCH_RESULTS.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
      setResults(filtered);
    }, 150);
  }, []);

  const handleSelect = (result) => {
    setSelected({
      ...result,
      releasePolicy: result.id === 64593 ? "Releases 30 days ahead at 10:00 AM ET" : result.id === 6194 ? "Releases 14 days ahead at 12:00 PM ET" : null,
    });
    setResults([]);
    setQuery("");
  };

  useEffect(() => {
    if (!selected || dates.every((d) => !d)) {
      setPreviews([]);
      return;
    }
    const p = dates
      .filter((d) => d)
      .map((d) => {
        const dateObj = new Date(d + "T12:00:00");
        const now = new Date();
        const daysDiff = Math.ceil((dateObj - now) / 86400000);
        if (daysDiff > 30) return { date: d, mode: "release", desc: "Reservations not yet released → Release snipe" };
        // Simulate sold out for hot restaurants
        if ([64593, 6194].includes(selected.id)) return { date: d, mode: "cancellation", desc: "Sold out → Cancellation snipe (3s)" };
        return { date: d, mode: "monitor", desc: `Slots available → Monitor (60s)` };
      });
    setPreviews(p);
  }, [selected, dates]);

  return (
    <div>
      <div
        onClick={onBack}
        style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, cursor: "pointer", marginBottom: 24, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ fontSize: 16 }}>←</span> Dashboard
      </div>

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
          onBlur={(e) => (e.target.style.borderColor = COLORS.border)}
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
            <div style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, marginBottom: selected.releasePolicy ? 8 : 0 }}>
              {selected.neighborhood} · {selected.cuisine[0]} · {priceSymbol(selected.priceRange)} ·{" "}
              <span style={{ color: COLORS.accent }}>★ {selected.rating}</span>
            </div>
            {selected.releasePolicy && (
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
                {selected.releasePolicy}
              </div>
            )}
          </div>

          {/* Config */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {/* Dates */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Date(s)
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {dates.map((d, i) => (
                  <input
                    key={i}
                    type="date"
                    value={d}
                    onChange={(e) => {
                      const next = [...dates];
                      next[i] = e.target.value;
                      setDates(next);
                    }}
                    style={{
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      padding: "8px 12px",
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      color: COLORS.text,
                      outline: "none",
                      colorScheme: "dark",
                    }}
                  />
                ))}
                <button
                  onClick={() => setDates([...dates, ""])}
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    padding: "8px 12px",
                    background: "transparent",
                    border: `1px dashed ${COLORS.border}`,
                    borderRadius: 6,
                    color: COLORS.textMuted,
                    cursor: "pointer",
                  }}
                >
                  + Add date
                </button>
              </div>
            </div>

            {/* Party size */}
            <div>
              <label style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>
                Party Size
              </label>
              <select
                value={partySize}
                onChange={(e) => setPartySize(parseInt(e.target.value))}
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 12,
                  padding: "8px 12px",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  color: COLORS.text,
                  outline: "none",
                  width: "100%",
                  colorScheme: "dark",
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
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
                  type="time"
                  value={earliest}
                  onChange={(e) => setEarliest(e.target.value)}
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    padding: "8px 10px",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    color: COLORS.text,
                    outline: "none",
                    colorScheme: "dark",
                    flex: 1,
                  }}
                />
                <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLORS.textDim }}>to</span>
                <input
                  type="time"
                  value={latest}
                  onChange={(e) => setLatest(e.target.value)}
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    padding: "8px 10px",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    color: COLORS.text,
                    outline: "none",
                    colorScheme: "dark",
                    flex: 1,
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
                        fontFamily: FONT.mono,
                        fontSize: 11,
                        padding: "6px 12px",
                        background: active ? COLORS.accent + "15" : "transparent",
                        border: `1px solid ${active ? COLORS.accent + "40" : COLORS.border}`,
                        borderRadius: 6,
                        color: active ? COLORS.accent : COLORS.textMuted,
                        cursor: "pointer",
                        transition: "all 0.1s",
                      }}
                    >
                      {active ? "✓ " : ""}
                      {seat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          {previews.length > 0 && (
            <div
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                Strategy Preview
              </div>
              {previews.map((p) => (
                <div key={p.date} style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.textMuted, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: COLORS.text }}>{formatDate(p.date)}:</span>
                  <StatusDot status={p.mode === "release" ? "waiting" : p.mode === "cancellation" ? "polling" : "monitoring"} />
                  <span>{p.desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* Start button */}
          <button
            onClick={() => onActivate && onActivate({ selected, dates, partySize, earliest, latest, seatTypes })}
            disabled={!dates.some((d) => d)}
            style={{
              width: "100%",
              padding: "14px 0",
              fontFamily: FONT.mono,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: dates.some((d) => d) ? COLORS.accent : COLORS.gray,
              color: dates.some((d) => d) ? COLORS.bg : COLORS.textDim,
              border: "none",
              borderRadius: 8,
              cursor: dates.some((d) => d) ? "pointer" : "default",
              transition: "all 0.15s",
            }}
          >
            START SNIPING
          </button>
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ───
export default function App() {
  const [view, setView] = useState("dashboard"); // dashboard | new | detail
  const [watches, setWatches] = useState(MOCK_WATCHES);
  const [selectedWatch, setSelectedWatch] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      setWatches((prev) =>
        prev.map((w) => {
          if (w.status === "polling") {
            return { ...w, pollCount: w.pollCount + 1, lastCheck: Date.now() };
          }
          if (w.status === "monitoring") {
            return { ...w, pollCount: w.pollCount + 1, lastCheck: Date.now(), slotsFound: 2 + Math.floor(Math.random() * 3) };
          }
          return w;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.02em" }}>
              Resy<span style={{ color: COLORS.accent }}>Snipe</span>
            </div>
            <button
              onClick={() => setView("new")}
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                fontWeight: 600,
                padding: "8px 14px",
                background: COLORS.accent,
                color: COLORS.bg,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                letterSpacing: "0.02em",
                transition: "opacity 0.1s",
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

          {/* Watch grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {watches.map((w) => (
              <WatchCard
                key={w.id}
                watch={w}
                onClick={() => {
                  setSelectedWatch(w);
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
                  fontFamily: FONT.mono,
                  fontSize: 12,
                  padding: "10px 20px",
                  background: COLORS.accent,
                  color: COLORS.bg,
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 600,
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
          onActivate={(config) => {
            // In production: POST /api/watches → creates watch → starts snipe
            console.log("Activating:", config);
            setView("dashboard");
          }}
        />
      )}

      {view === "detail" && selectedWatch && (
        <WatchDetailView watch={selectedWatch} onBack={() => setView("dashboard")} />
      )}
    </div>
  );
}
