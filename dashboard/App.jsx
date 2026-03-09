import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ─── DESIGN TOKENS (warm/light theme) ───
const C = {
  bg: "#faf9f6",
  surface: "#ffffff",
  surfaceHover: "#f5f3ef",
  border: "#e8e4de",
  borderHover: "#d4cfc7",
  text: "#1a1a1a",
  textSecondary: "#6b6560",
  textMuted: "#9e9892",
  accent: "#e85d3a",
  accentHover: "#d14e2d",
  green: "#2d8b4e",
  greenBg: "#e8f5ee",
  amber: "#c47f17",
  amberBg: "#fef7e6",
  red: "#c23a22",
  redBg: "#fdecea",
  grayBg: "#f0eeea",
};

const F = {
  sans: "'DM Sans', 'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
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

// ─── UTILITIES ───
function formatTimeAgo(ts) {
  if (!ts) return "";
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
  if (!targetISO) return "";
  const diff = new Date(targetISO) - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWatchDates(w) {
  if (w.targetDate) return formatDate(w.targetDate);
  if (w.dates?.length) return w.dates.map(formatDate).join(", ");
  return "";
}

function statusInfo(status) {
  const map = {
    booked: { label: "Booked", color: C.green, bg: C.greenBg },
    polling: { label: "Sniping", color: C.amber, bg: C.amberBg },
    waiting: { label: "Waiting", color: C.textMuted, bg: C.grayBg },
    monitoring: { label: "Available", color: C.green, bg: C.greenBg },
    failed: { label: "Failed", color: C.red, bg: C.redBg },
    stopped: { label: "Stopped", color: C.textMuted, bg: C.grayBg },
  };
  return map[status] || { label: status, color: C.textMuted, bg: C.grayBg };
}

// ─── STATUS BADGE ───
function StatusBadge({ status }) {
  const s = statusInfo(status);
  return (
    <span
      style={{
        fontFamily: F.sans,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 20,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// ─── HEADER ───
function Header({ watches, onNew, view, onBack }) {
  const available = watches.filter((w) => w.status === "monitoring").length;
  const sniping = watches.filter((w) => ["polling", "waiting"].includes(w.status)).length;
  const soldOut = watches.filter((w) => w.status === "polling" && w.slotsFound === 0).length;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 0",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {view !== "dashboard" && (
          <span
            onClick={onBack}
            style={{ fontSize: 18, cursor: "pointer", color: C.textSecondary, lineHeight: 1 }}
          >
            ←
          </span>
        )}
        <span
          style={{
            fontFamily: F.sans,
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.03em",
            cursor: view !== "dashboard" ? "pointer" : "default",
          }}
          onClick={view !== "dashboard" ? onBack : undefined}
        >
          Resy<span style={{ color: C.accent }}>Snipe</span>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {view === "dashboard" && (
          <div style={{ fontFamily: F.sans, fontSize: 13, color: C.textSecondary, display: "flex", gap: 16 }}>
            {available > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} />
                {available} Available
              </span>
            )}
            {sniping > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber, display: "inline-block" }} />
                {sniping} Sniping
              </span>
            )}
          </div>
        )}
        {view === "dashboard" && (
          <button
            onClick={onNew}
            style={{
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 600,
              padding: "9px 18px",
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.accentHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.accent)}
          >
            + New Snipe
          </button>
        )}
      </div>
    </div>
  );
}

// ─── RESTAURANT CARD (dashboard + hitlist) ───
function RestaurantCard({ name, neighborhood, cuisine, image, status, dates, partySize, slotsFound, pollCount, lastCheck, bookedTime, onClick, compact }) {
  const s = status ? statusInfo(status) : null;
  const imgUrl = typeof image === "string" ? image : image?.url || null;

  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.2s, transform 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        border: `1px solid ${C.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Image */}
      <div
        style={{
          height: compact ? 120 : 160,
          background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : `linear-gradient(135deg, #e8e4de, #d4cfc7)`,
          position: "relative",
        }}
      >
        {s && (
          <div style={{ position: "absolute", top: 10, right: 10 }}>
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: compact ? "10px 12px" : "14px 16px" }}>
        <div
          style={{
            fontFamily: F.sans,
            fontSize: compact ? 14 : 16,
            fontWeight: 600,
            color: C.text,
            marginBottom: 3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: F.sans,
            fontSize: compact ? 12 : 13,
            color: C.textSecondary,
            marginBottom: status ? 8 : 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {neighborhood}{cuisine?.length > 0 ? ` · ${cuisine[0]}` : ""}
        </div>

        {/* Watch-specific info */}
        {status && (
          <div style={{ fontFamily: F.sans, fontSize: 12, color: C.textMuted }}>
            {dates && <span>{dates}{partySize ? ` · ${partySize} guests` : ""}</span>}
            {status === "booked" && bookedTime && (
              <div style={{ color: C.green, fontWeight: 500, marginTop: 2 }}>
                Booked at {bookedTime}
              </div>
            )}
            {status === "polling" && (
              <div style={{ marginTop: 2 }}>
                {pollCount?.toLocaleString()} polls · {slotsFound || 0} found
              </div>
            )}
            {status === "monitoring" && (
              <div style={{ color: C.green, marginTop: 2 }}>
                {slotsFound || 0} slots available
              </div>
            )}
            {lastCheck && (
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>
                Checked {formatTimeAgo(lastCheck)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SEARCH RESULT ROW ───
function SearchResult({ result, onSelect }) {
  const imgUrl = (result.images || [])[0];
  const imgSrc = typeof imgUrl === "string" ? imgUrl : imgUrl?.url || null;

  return (
    <div
      onClick={() => onSelect(result)}
      style={{
        padding: "10px 14px",
        cursor: "pointer",
        borderBottom: `1px solid ${C.border}`,
        transition: "background 0.1s",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {imgSrc && (
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: `url(${imgSrc}) center/cover no-repeat`,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.text }}>
          {result.name}
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 12, color: C.textSecondary }}>
          {result.neighborhood}{(result.cuisine || [])[0] ? ` · ${result.cuisine[0]}` : ""}
          {result.rating > 0 && <span style={{ color: C.amber }}> ★ {result.rating}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── WATCH DETAIL VIEW ───
function WatchDetailView({ watch, onStop, onStart, onDelete }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const running = watch.startedAt ? formatDuration(now - watch.startedAt) : "";
  const seatType = watch.seatType || watch.filters?.seatTypes?.[0] || "";
  const modeLabel = { release: "Release Snipe", cancellation: "Cancellation Snipe", monitor: "Monitor" };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, color: C.text }}>
            {watch.venueName}
          </span>
          <StatusBadge status={watch.status} />
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 15, color: C.textSecondary }}>
          {getWatchDates(watch)} · {watch.partySize} guests{seatType ? ` · ${seatType}` : ""}
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 13, color: C.textMuted, marginTop: 4 }}>
          {modeLabel[watch.mode] || "Monitor"}
        </div>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "20px 24px",
          marginBottom: 28,
        }}
      >
        {[
          { label: "Polls", value: (watch.pollCount || 0).toLocaleString() },
          { label: "Slots Found", value: String(watch.slotsFound || 0) },
          { label: "Interval", value: watch.mode === "release" ? "500ms" : watch.mode === "cancellation" ? "3s" : "60s" },
          { label: "Running", value: running || "\u2014" },
          { label: "Last Check", value: watch.lastCheck ? formatTimeAgo(watch.lastCheck) : "\u2014" },
          {
            label: "Status",
            value:
              watch.status === "booked"
                ? `Booked ${watch.bookedTime || ""}`
                : watch.status === "waiting"
                ? `Release ${formatCountdown(watch.releaseTime)}`
                : statusInfo(watch.status).label,
          },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 18, fontWeight: 600, color: C.text }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {watch.status !== "stopped" && watch.status !== "booked" && (
          <button
            onClick={() => onStop(watch.id)}
            style={{
              fontFamily: F.sans, fontSize: 13, fontWeight: 500, padding: "10px 20px",
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.amber, cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
          >
            Stop
          </button>
        )}
        {watch.status === "stopped" && (
          <button
            onClick={() => onStart(watch.id)}
            style={{
              fontFamily: F.sans, fontSize: 13, fontWeight: 500, padding: "10px 20px",
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.green, cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
          >
            Resume
          </button>
        )}
        <button
          onClick={() => onDelete(watch.id)}
          style={{
            fontFamily: F.sans, fontSize: 13, fontWeight: 500, padding: "10px 20px",
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.red, cursor: "pointer", transition: "background 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── NEW SNIPE VIEW ───
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
    apiFetch("/api/hitlist")
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        if (arr.length > 0) setHitlist(arr);
      })
      .catch(() => {});
  }, []);

  const handleSearch = useCallback((q) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
    }, 250);
  }, []);

  const handleSelect = async (result) => {
    setSelected(result);
    setResults([]);
    setQuery("");
    try {
      const info = await apiFetch(`/api/venue/${result.id}`);
      setVenueInfo(info);
    } catch { setVenueInfo(null); }
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

    const dateRange = expandedDates.length === 1
      ? formatDate(expandedDates[0])
      : `${formatDate(expandedDates[0])} – ${formatDate(expandedDates[expandedDates.length - 1])}`;
    const msg = `This will create ${expandedDates.length} watch${expandedDates.length > 1 ? "es" : ""} for ${selected.name} (${dateRange}), polling every 3s in cancellation mode with auto-book enabled.\n\nProceed?`;
    if (!window.confirm(msg)) return;

    setSubmitting(true);
    for (const date of expandedDates) {
      await apiPost("/api/watches", {
        venueId: selected.id,
        venueName: selected.name,
        neighborhood: selected.neighborhood,
        cuisine: selected.cuisine,
        image: selected.image || (selected.images || [])[0] || null,
        targetDate: date,
        partySize,
        timeRange: { earliest, latest },
        autoBook: true,
        filters: { seatTypes },
        mode: "cancellation",
      });
    }
    setSubmitting(false);
    onCreated();
  };

  const policyText = venueInfo?.releasePolicy
    ? `Releases ${venueInfo.releasePolicy.advanceDays} days ahead at ${venueInfo.releasePolicy.releaseHour > 12 ? venueInfo.releasePolicy.releaseHour - 12 : venueInfo.releasePolicy.releaseHour}:${String(venueInfo.releasePolicy.releaseMinute).padStart(2, "0")} ${venueInfo.releasePolicy.releaseHour >= 12 ? "PM" : "AM"} ${venueInfo.releasePolicy.timezone}`
    : typeof venueInfo?.needToKnow === "string" ? venueInfo.needToKnow : null;

  const inputStyle = {
    fontFamily: F.sans, fontSize: 14, padding: "10px 14px", width: "100%",
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontFamily: F.sans, fontSize: 12, fontWeight: 500, color: C.textSecondary,
    display: "block", marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Search — always on top */}
      {!selected && (
        <div style={{ position: "relative", marginBottom: 24 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search restaurants..."
            style={{
              ...inputStyle,
              fontSize: 16,
              padding: "14px 18px",
              borderRadius: 10,
            }}
            onFocus={(e) => (e.target.style.borderColor = C.accent)}
            onBlur={(e) => setTimeout(() => (e.target.style.borderColor = C.border), 200)}
          />
          {results.length > 0 && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                marginTop: 4, zIndex: 100, overflow: "hidden",
                boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
              }}
            >
              {results.map((r) => (
                <SearchResult key={r.id} result={r} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hitlist compact grid */}
      {!selected && hitlist.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.textSecondary, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Your Saves
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {hitlist.map((h) => {
              const imgUrl = typeof h.image === "string" ? h.image : h.image?.url || null;
              return (
                <div
                  key={h.id}
                  onClick={() => handleSelect(h)}
                  style={{
                    background: C.surface, borderRadius: 10, overflow: "hidden", cursor: "pointer",
                    border: `1px solid ${C.border}`, transition: "box-shadow 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                >
                  <div style={{
                    height: 120,
                    background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : `linear-gradient(135deg, #e8e4de, #d4cfc7)`,
                  }} />
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 2,
                    }}>
                      {h.name}
                    </div>
                    <div style={{
                      fontFamily: F.sans, fontSize: 11, color: C.textMuted,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {h.neighborhood}{(h.cuisine || [])[0] ? ` · ${typeof h.cuisine[0] === "string" ? h.cuisine[0] : h.cuisine[0]}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected venue config */}
      {selected && (
        <>
          <div
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
              overflow: "hidden", marginBottom: 24,
            }}
          >
            {(selected.image || (selected.images || [])[0]) && (
              <div
                style={{
                  height: 180,
                  background: `url(${typeof (selected.image || selected.images?.[0]) === "string" ? (selected.image || selected.images[0]) : (selected.image || selected.images?.[0])?.url || ""}) center/cover no-repeat`,
                }}
              />
            )}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                    {selected.name}
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, color: C.textSecondary }}>
                    {selected.neighborhood}{(selected.cuisine || [])[0] ? ` · ${selected.cuisine[0]}` : ""}
                    {selected.rating > 0 && <span style={{ color: C.amber }}> ★ {selected.rating}</span>}
                  </div>
                </div>
                <button
                  onClick={() => { setSelected(null); setVenueInfo(null); }}
                  style={{
                    fontFamily: F.sans, fontSize: 13, color: C.textMuted,
                    background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
                  }}
                >
                  Change
                </button>
              </div>
              {policyText && (
                <div
                  style={{
                    fontFamily: F.sans, fontSize: 13, color: C.amber, background: C.amberBg,
                    padding: "8px 12px", borderRadius: 6, marginTop: 12,
                  }}
                >
                  {policyText}
                </div>
              )}
            </div>
          </div>

          {/* Config form */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  if (!dateTo || e.target.value > dateTo) setDateTo(e.target.value);
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
            </div>
            {expandedDates.length > 1 && (
              <div style={{ gridColumn: "1 / -1", fontFamily: F.sans, fontSize: 13, color: C.textSecondary }}>
                {expandedDates.length} days: {expandedDates.map(formatDate).join(", ")}
              </div>
            )}

            <div>
              <label style={labelStyle}>Party Size</label>
              <select value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value))} style={inputStyle}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n} guest{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Time Range</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <span style={{ fontFamily: F.sans, fontSize: 13, color: C.textMuted }}>to</span>
                <input type="time" value={latest} onChange={(e) => setLatest(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Seat Type</label>
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
                        fontFamily: F.sans, fontSize: 13, padding: "8px 16px",
                        background: active ? C.accent : C.surface,
                        border: `1px solid ${active ? C.accent : C.border}`,
                        borderRadius: 8,
                        color: active ? "#fff" : C.textSecondary,
                        cursor: "pointer", transition: "all 0.15s", fontWeight: active ? 600 : 400,
                      }}
                    >
                      {seat}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={handleActivate}
            disabled={expandedDates.length === 0 || submitting}
            style={{
              width: "100%", padding: "14px 0", fontFamily: F.sans, fontSize: 15, fontWeight: 600,
              background: expandedDates.length > 0 && !submitting ? C.accent : C.border,
              color: expandedDates.length > 0 && !submitting ? "#fff" : C.textMuted,
              border: "none", borderRadius: 10,
              cursor: expandedDates.length > 0 && !submitting ? "pointer" : "default",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (expandedDates.length > 0 && !submitting) e.currentTarget.style.background = C.accentHover; }}
            onMouseLeave={(e) => { if (expandedDates.length > 0 && !submitting) e.currentTarget.style.background = C.accent; }}
          >
            {submitting ? "Creating..." : expandedDates.length > 1 ? `Start Sniping (${expandedDates.length} days)` : "Start Sniping"}
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

  useEffect(() => {
    apiFetch("/api/watches").then(setWatches).catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "watches") {
          setWatches(event.data);
        } else if (event.type === "poll" || event.type === "booked" || event.type === "slot_found") {
          apiFetch("/api/watches").then(setWatches).catch(() => {});
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  // Backfill images for watches missing them
  useEffect(() => {
    const needsImage = watches.filter((w) => !w.image && w.venueName);
    if (needsImage.length === 0) return;
    const seen = new Set();
    for (const w of needsImage) {
      if (seen.has(w.venueId)) continue;
      seen.add(w.venueId);
      apiFetch(`/api/search?q=${encodeURIComponent(w.venueName)}`)
        .then((results) => {
          const match = (Array.isArray(results) ? results : []).find((r) => String(r.id) === String(w.venueId));
          if (match) {
            const img = match.image || (match.images || [])[0] || null;
            if (img) {
              setWatches((prev) => prev.map((pw) => pw.venueId === w.venueId && !pw.image ? { ...pw, image: img } : pw));
            }
          }
        })
        .catch(() => {});
    }
  }, [watches.length]);

  const handleStop = async (id) => {
    await apiPost(`/api/watches/${id}/stop`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  const handleStart = async (id) => {
    const w = watches.find((w) => w.id === id);
    if (w?.autoBook) {
      if (!window.confirm(`This will resume sniping for ${w.venueName} with auto-book enabled. Continue?`)) return;
    }
    await apiPost(`/api/watches/${id}/start`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this watch?")) return;
    await apiDelete(`/api/watches/${id}`);
    const data = await apiFetch("/api/watches");
    setWatches(data);
    if (selectedWatch === id) setView("dashboard");
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`Delete all ${watches.length} watches? This cannot be undone.`)) return;
    await apiDelete("/api/watches/all");
    const data = await apiFetch("/api/watches");
    setWatches(data);
  };

  const goBack = () => setView("dashboard");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: ${C.bg}; }
        ::selection { background: ${C.accent}22; }
        input, select { font-family: ${F.sans}; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>
        <Header
          watches={watches}
          view={view}
          onNew={() => setView("new")}
          onBack={goBack}
        />

        {/* DASHBOARD */}
        {view === "dashboard" && (() => {
          // Group watches by venueId
          const groups = [];
          const groupMap = new Map();
          for (const w of watches) {
            const key = w.venueId || w.id;
            if (!groupMap.has(key)) {
              const group = { venueId: key, venueName: w.venueName, neighborhood: w.neighborhood, cuisine: w.cuisine, image: w.image, watches: [] };
              groupMap.set(key, group);
              groups.push(group);
            }
            const g = groupMap.get(key);
            g.watches.push(w);
            if (!g.image && w.image) g.image = w.image;
          }

          return (
            <>
              {watches.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <button
                    onClick={handleDeleteAll}
                    style={{
                      fontFamily: F.sans, fontSize: 12, fontWeight: 500, padding: "6px 14px",
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
                      color: C.red, cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.redBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = C.surface)}
                  >
                    Delete All
                  </button>
                </div>
              )}
              {groups.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 0" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 18, color: C.textMuted, marginBottom: 20 }}>
                    No active watches yet
                  </div>
                  <button
                    onClick={() => setView("new")}
                    style={{
                      fontFamily: F.sans, fontSize: 14, fontWeight: 600, padding: "12px 24px",
                      background: C.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    + New Snipe
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 18 }}>
                  {groups.map((g) => {
                    const totalPolls = g.watches.reduce((s, w) => s + (w.pollCount || 0), 0);
                    const totalSlots = g.watches.reduce((s, w) => s + (w.slotsFound || 0), 0);
                    const latestCheck = Math.max(...g.watches.map((w) => w.lastCheck || 0));
                    const booked = g.watches.find((w) => w.status === "booked");
                    const anyPolling = g.watches.some((w) => ["polling", "waiting"].includes(w.status));
                    const bestStatus = booked ? "booked" : anyPolling ? "polling" : g.watches[0]?.status || "stopped";
                    const allDates = g.watches.map((w) => w.targetDate || (w.dates || [])[0]).filter(Boolean).sort();
                    const dateLabel = allDates.length === 0 ? "" : allDates.length === 1 ? formatDate(allDates[0]) : `${formatDate(allDates[0])} – ${formatDate(allDates[allDates.length - 1])}`;
                    const datesWithSlots = g.watches.filter((w) => (w.slotsFound || 0) > 0).length;

                    return (
                      <RestaurantCard
                        key={g.venueId}
                        name={g.venueName}
                        neighborhood={g.neighborhood || ""}
                        cuisine={g.cuisine}
                        image={g.image}
                        status={bestStatus}
                        dates={dateLabel + (g.watches.length > 1 ? ` (${g.watches.length} days)` : "")}
                        partySize={g.watches[0]?.partySize}
                        slotsFound={totalSlots}
                        pollCount={totalPolls}
                        lastCheck={latestCheck || null}
                        bookedTime={booked?.bookedTime}
                        onClick={() => {
                          setSelectedWatch(g.watches[0].id);
                          setView("detail");
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* NEW SNIPE */}
        {view === "new" && (
          <NewSnipeView
            onBack={goBack}
            onCreated={async () => {
              const data = await apiFetch("/api/watches");
              setWatches(data);
              setView("dashboard");
            }}
          />
        )}

        {/* DETAIL */}
        {view === "detail" && selectedWatch && (() => {
          const detailWatch = watches.find((w) => w.id === selectedWatch) || null;
          if (!detailWatch) return null;
          // Find sibling watches (same venue)
          const siblings = watches.filter((w) => w.venueId === detailWatch.venueId);
          return (
            <div>
              <WatchDetailView
                watch={detailWatch}
                onStop={handleStop}
                onStart={handleStart}
                onDelete={handleDelete}
              />
              {siblings.length > 1 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>
                    All dates for {detailWatch.venueName} ({siblings.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {siblings.map((w) => (
                      <div
                        key={w.id}
                        onClick={() => setSelectedWatch(w.id)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px", background: w.id === selectedWatch ? C.surfaceHover : C.surface,
                          border: `1px solid ${w.id === selectedWatch ? C.accent : C.border}`,
                          borderRadius: 8, cursor: "pointer", transition: "all 0.1s",
                        }}
                      >
                        <div style={{ fontFamily: F.sans, fontSize: 13, color: C.text }}>
                          {getWatchDates(w)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: F.mono, fontSize: 12, color: C.textMuted }}>
                            {(w.pollCount || 0).toLocaleString()} polls · {w.slotsFound || 0} found
                          </span>
                          <StatusBadge status={w.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── MOUNT ───
createRoot(document.getElementById("root")).render(<App />);
