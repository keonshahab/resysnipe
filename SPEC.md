# Reservation Sniper — Claude Code Build Spec

## Overview

Personal reservation monitoring tool that polls Resy and OpenTable for availability at target restaurants and sends email alerts when slots open up. Runs on macOS, designed to be modular so adapters can later be extracted as OpenClaw skills.

---

## Architecture

### Phase 1 (Current)

```
resysnipe/
├── src/
│   ├── adapters/
│   │   ├── resy.js            # Resy API client
│   │   └── opentable.js       # OpenTable API client (stub for now)
│   ├── notifications/
│   │   └── email.js            # Nodemailer email alerts
│   ├── poller.js               # Cron-based polling loop
│   ├── config.js               # Loads .env config
│   └── watchlist.json          # Target restaurants/dates/preferences
├── index.js                    # Entry point — starts the poller
├── test-resy.js                # Quick script to test Resy API connectivity
├── package.json
├── .env.example                # Template for secrets
└── .gitignore
```

### Phase 2 (Release Snipe)

```
resysnipe/
├── src/
│   ├── adapters/
│   │   ├── resy.js            # Resy API client (+ need_to_know parsing)
│   │   └── opentable.js       # OpenTable API client (stub)
│   ├── notifications/
│   │   └── email.js            # Nodemailer email alerts
│   ├── sniper.js               # Release snipe mode — high-frequency polling + instant booking
│   ├── mode-detector.js        # Parses need_to_know to determine monitor vs release mode
│   ├── poller.js               # Cron-based polling loop (monitor mode)
│   ├── config.js               # Loads .env config
│   └── watchlist.json          # Target restaurants/dates/preferences
├── index.js                    # Entry point — starts the poller (monitor mode)
├── snipe.js                    # Entry point — runs a single release snipe
├── test-resy.js                # Quick script to test Resy API connectivity
├── package.json
├── .env.example
└── .gitignore
```

### Phase 3 (Web Dashboard)

```
resysnipe/
├── src/
│   ├── adapters/
│   │   ├── resy.js            # Resy API client
│   │   └── opentable.js       # OpenTable API client (stub)
│   ├── notifications/
│   │   └── email.js            # Nodemailer email alerts
│   ├── sniper.js               # Release snipe engine
│   ├── mode-detector.js        # Monitor vs release mode detection
│   ├── poller.js               # Cron-based polling loop
│   ├── config.js               # Loads .env config
│   └── watchlist.json          # Target restaurants/dates/preferences
├── server/
│   ├── index.js                # Express API server
│   ├── routes/
│   │   ├── venues.js           # Search venues, fetch need_to_know metadata
│   │   ├── watches.js          # CRUD for watches (read/write watchlist.json)
│   │   └── status.js           # Watch status (monitoring, waiting, booked, etc.)
│   └── orchestrator.js         # Manages running pollers + snipers per watch
├── web/
│   ├── src/
│   │   ├── App.jsx             # Main React app
│   │   ├── components/
│   │   │   ├── VenueSearch.jsx     # Restaurant search bar
│   │   │   ├── WatchForm.jsx       # Date/party/time picker, creates a watch
│   │   │   ├── WatchList.jsx       # Dashboard of all active watches
│   │   │   └── WatchCard.jsx       # Single watch status card
│   │   └── index.jsx
│   ├── public/
│   │   └── index.html
│   └── package.json            # React/Vite config
├── index.js                    # CLI entry point — starts poller
├── snipe.js                    # CLI entry point — single release snipe
├── test-resy.js
├── package.json
├── .env.example
└── .gitignore
```

Each adapter exports the same interface so they're interchangeable:
```js
// Every adapter must export:
module.exports = {
  name: 'resy',                          // adapter identifier
  checkAvailability({ venueId, date, partySize, timeRange }) => Promise<Slot[]>,
  getVenueInfo(venueId) => Promise<Venue>,
}
```

---

## Resy API Details (Reverse-Engineered)

### Authentication Headers

Every request to `api.resy.com` needs these headers:

```
authorization: ResyAPI api_key="VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"
x-resy-auth-token: <JWT from .env>
x-resy-universal-auth: <same JWT from .env>
origin: https://resy.com
referer: https://resy.com/
accept: application/json, text/plain, */*
cache-control: no-cache
```

The `api_key` appears to be a shared/public key. The JWT tokens are user-specific session tokens.

### Key Endpoint: Collection/Venue Search

```
GET https://api.resy.com/3/collection/venues
```

**Query params:**
- `location_id` — e.g. `ny`
- `collection_id` — e.g. `14` (Global Dining Access)
- `day` — `YYYY-MM-DD`
- `party_size` — integer
- `limit` — results per page
- `offset` — pagination offset
- `finder` — `4`
- `isAuth` — `true`

### Response Structure

The response is `{ query, results: { venues: [...] } }`.

Each venue object contains:

```json
{
  "venue": {
    "id": { "resy": 55555 },
    "name": "Carne Mare",
    "type": "Italian",
    "url_slug": "carne-mare",
    "price_range": 3,
    "rating": 4.5452,
    "location": {
      "neighborhood": "Seaport",
      "geo": { "lat": 40.70651, "lon": -74.00202 },
      "name": "New York"
    }
  },
  "templates": { ... },
  "slots": [ ... ]
}
```

### Slot Structure (This is the key data)

Each slot represents one bookable time:

```json
{
  "config": {
    "token": "rgs://resy/55555/4122748/2/2026-03-07/2026-03-07/17:00:00/2/Dining Room",
    "type": "Dining Room"
  },
  "date": {
    "start": "2026-03-07 17:00:00",
    "end": "2026-03-07 19:15:00"
  },
  "exclusive": {
    "id": 1000,
    "is_eligible": true
  },
  "is_global_dining_access": true,
  "size": { "min": 1, "max": 2 },
  "quantity": 3,
  "template": { "id": 4122748 },
  "payment": {
    "is_paid": true,
    "cancellation_fee": 25.0,
    "secs_cancel_cut_off": 86400
  }
}
```

**Important slot fields:**
- `config.token` — The booking token. Format: `rgs://resy/{venueId}/{templateId}/{serviceTypeId}/{day}/{day}/{time}/{partySize}/{seatType}`
- `date.start` / `date.end` — The reservation time window
- `quantity` — How many of this slot are still available
- `is_global_dining_access` — Whether this is an AmEx GDA exclusive slot
- `exclusive.id` — `1000` = GDA exclusive, `0` = open to everyone
- `payment.is_paid` — Whether booking requires a deposit/cancellation fee
- `payment.cancellation_fee` — Fee if you cancel
- `size.min` / `size.max` — Party size range for this slot
- `template.id` — Links to the template object which has more details about the reservation type

### Per-Venue Availability Endpoint

For polling a SPECIFIC restaurant (more efficient than the collection endpoint), use:

```
GET https://api.resy.com/4/find
```

**Query params:**
- `lat` — latitude (e.g. `40.7128`)
- `long` — longitude (e.g. `-74.0060`)
- `day` — `YYYY-MM-DD`
- `party_size` — integer
- `venue_id` — the Resy venue ID (e.g. `55555`)

This returns the same slot structure but for a single venue. **Use this endpoint for polling** — it's lighter weight than the collection endpoint.

### Booking Flow (COMPLETE — Reverse-Engineered)

The booking flow is two POST requests:

**Step 1: Get Details + Book Token**

```
POST https://api.resy.com/3/details
Content-Type: application/x-www-form-urlencoded (or JSON)
Headers: same auth headers as above

Payload:
{
  "commit": 0,
  "config_id": "rgs://resy/40703/1569131/1/2026-03-07/2026-03-07/14:30:00/2/The Bar Room",
  "day": "2026-03-07",
  "party_size": 2
}
```

- `commit: 0` means "preview only, don't book yet"
- `config_id` is the `config.token` from the slot in the availability response

Response includes:
- `payment.config.type` — "free" (no deposit) or paid
- `user.payment_methods[]` — your saved cards with `id`, `type`, `display` (last 4 digits)
- `cancellation` policy details
- A `book_token` (check response body and/or Set-Cookie headers)

**Step 2: Complete Booking**

```
POST https://api.resy.com/3/book
Headers: same auth headers
Returns: 201 Created on success

Payload:
{
  "book_token": "<long encrypted token from /3/details response>",
  "struct_payment_method": {"id": 15332505},
  "source_id": "resy.com-venue-card",
  "venue_marketing_opt_in": 0
}
```

- `book_token` — encrypted token returned by `/3/details`
- `struct_payment_method.id` — payment method ID from user's saved cards (15332505 = AmEx ending 3003)
- `source_id` — always `"resy.com-venue-card"`
- `venue_marketing_opt_in` — always `0`

**Auto-Book Flow in Code:**
```js
async function autoBook(slot, partySize) {
  // Step 1: Get book_token
  const details = await resyPost('/3/details', {
    commit: 0,
    config_id: slot.config.token,
    day: slot.date.start.split(' ')[0],
    party_size: partySize
  });

  const bookToken = details.book_token; // extract from response

  // Step 2: Book it
  const booking = await resyPost('/3/book', {
    book_token: bookToken,
    struct_payment_method: { id: parseInt(process.env.RESY_PAYMENT_METHOD_ID) },
    source_id: 'resy.com-venue-card',
    venue_marketing_opt_in: 0
  });

  return booking; // 201 = success
}
```

---

## OpenTable API Details

OpenTable doesn't have an official API. For the initial build, create a **stub adapter** that:
1. Accepts the same interface as the Resy adapter
2. Logs a "not yet implemented" message
3. Returns empty results

We'll reverse-engineer OpenTable's availability endpoint later using the same DevTools approach.

---

## Watchlist Format

```json
{
  "watches": [
    {
      "id": "watch-1",
      "enabled": true,
      "platform": "resy",
      "venueId": 55555,
      "venueName": "Carne Mare",
      "dates": ["2026-03-14", "2026-03-15"],
      "partySize": 2,
      "timeRange": {
        "earliest": "18:00",
        "latest": "21:00"
      },
      "autoBook": true,
      "filters": {
        "excludeGDAOnly": false,
        "maxCancellationFee": null,
        "seatTypes": ["Dining Room"]
      }
    }
  ]
}
```

---

## Poller Logic

- Use `node-cron` to run every 2 minutes
- For each enabled watch in the watchlist:
  - Call the appropriate adapter's `checkAvailability()`
  - Filter results by time range, seat type, and other filters
  - Compare against previously seen slots (keep a simple in-memory Set of `config.token` values)
  - If new slots found → send email notification
- Log all activity with timestamps
- Handle errors gracefully — don't crash on a single failed request

---

## Email Notification

Use Nodemailer with Gmail App Password.

Email should include:
- Restaurant name
- Available time slots (formatted nicely)
- Direct link to book on Resy: `https://resy.com/cities/new-york-ny/{url_slug}?date={date}&seats={partySize}`
- Whether it's a GDA slot or regular
- Cancellation fee if applicable

---

## .env.example

```
# Resy
RESY_API_KEY=VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5
RESY_AUTH_TOKEN=your_jwt_token_here
RESY_PAYMENT_METHOD_ID=15332505

# Email (Gmail with App Password)
EMAIL_FROM=your.email@gmail.com
EMAIL_TO=your.email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password

# Polling
POLL_INTERVAL_MINUTES=2

# Auto-booking (set to true to enable)
AUTO_BOOK=false
```

---

## Phase 1 Deliverables (This Build)

1. ✅ Working Resy adapter that fetches availability for a specific venue+date+party
2. ✅ OpenTable stub adapter (same interface, no-op)
3. ✅ Watchlist config file with per-watch `autoBook` flag
4. ✅ Poller that runs on a cron schedule (every 60-90 seconds)
5. ✅ Email notifications when new slots appear
6. ✅ Auto-booking: when `autoBook: true` and a matching slot is found, call /3/details → /3/book instantly
7. ✅ Safety: `AUTO_BOOK=false` in .env as a global kill switch (must be `true` AND per-watch `autoBook: true`)
8. ✅ `test-resy.js` script to verify API connectivity
9. ✅ Clean logging with timestamps

## Phase 2 — Release Snipe Mode

### Concept

Many high-demand restaurants (e.g. Torrisi, 4 Charles, Don Angie) release reservations on a fixed schedule — typically X days in advance at a specific time (e.g. "30 days out at 10:00 AM ET"). These slots get booked within seconds of release.

Release snipe mode handles this by:
1. Auto-detecting the release schedule from Resy's `need_to_know` venue metadata
2. Starting high-frequency polling (every 500ms) 5 seconds before release time
3. Instantly booking the first matching slot via `/3/details` -> `/3/book`
4. Exiting after a successful booking or a 2-minute timeout

### need_to_know Parsing

The Resy API response includes a `need_to_know` field on each venue with text like:

> "Reservations can be made up to 30 days in advance, starting at 10:00 AM EST."

The mode detector (`src/mode-detector.js`) should parse this to extract:
- **Advance window** — how many days ahead reservations open (e.g. `30`)
- **Release time** — what time they become available (e.g. `10:00 AM EST`)

Given a target date, the detector calculates the exact release datetime. If that datetime is in the future, the watch should use release snipe mode. If it's in the past (reservations are already open), use normal monitor/polling mode.

### Sniper Logic (`src/sniper.js`)

```js
// Core loop (simplified):
async function snipe(watch) {
  const releaseTime = new Date(watch.releaseTime);
  const startPollingAt = new Date(releaseTime.getTime() - 5000); // 5 sec early
  const deadline = new Date(releaseTime.getTime() + 120000);     // 2 min timeout
  const interval = watch.pollIntervalMs || 500;

  // Wait until 5 seconds before release
  await sleepUntil(startPollingAt);

  log(`Snipe started for ${watch.venueName} — polling every ${interval}ms`);

  while (Date.now() < deadline) {
    const start = Date.now();
    try {
      const slots = await resy.checkAvailability({
        venueId: watch.venueId,
        date: watch.targetDate,
        partySize: watch.partySize,
        timeRange: watch.timeRange,
      });

      const filtered = applyFilters(slots, watch.filters);

      if (filtered.length > 0) {
        log(`SLOT FOUND in ${Date.now() - start}ms — booking immediately`);
        const result = await resy.autoBook(filtered[0], watch.partySize);
        log(`BOOKED! ${watch.venueName} on ${watch.targetDate}`);
        await sendBookingConfirmation(watch, filtered[0], watch.targetDate);
        return result;
      }
    } catch (err) {
      log(`Poll error: ${err.message}`);
    }

    // Wait remainder of interval
    const elapsed = Date.now() - start;
    if (elapsed < interval) await sleep(interval - elapsed);
  }

  log(`Snipe timed out after 2 minutes for ${watch.venueName}`);
}
```

### Mode Detector (`src/mode-detector.js`)

```js
// Parses need_to_know text to extract release policy
function parseReleasePolicy(needToKnowText) {
  // Match patterns like:
  // "Reservations can be made up to 30 days in advance, starting at 10:00 AM EST"
  // "Reservations are released 14 days in advance at 9:00 AM ET"
  const daysMatch = needToKnowText.match(/(\d+)\s*days?\s*(in advance|ahead|out)/i);
  const timeMatch = needToKnowText.match(/(?:at|starting at)\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*(E[SD]T|ET)/i);

  if (!daysMatch || !timeMatch) return null;

  return {
    advanceDays: parseInt(daysMatch[1]),
    releaseHour: parseInt(timeMatch[1]) + (timeMatch[3] === 'PM' && timeMatch[1] !== '12' ? 12 : 0),
    releaseMinute: parseInt(timeMatch[2]),
    timezone: timeMatch[4],
  };
}

// Given a target date and release policy, returns the release datetime
function getReleaseTime(targetDate, policy) {
  // targetDate minus advanceDays = the day reservations open
  // At policy.releaseHour:releaseMinute in policy.timezone
}

// Determines which mode to use for a given watch
function detectMode(watch, needToKnowText) {
  const policy = parseReleasePolicy(needToKnowText);
  if (!policy) return { mode: 'monitor' }; // can't determine, default to polling

  const releaseTime = getReleaseTime(watch.targetDate || watch.dates[0], policy);

  if (releaseTime > new Date()) {
    return { mode: 'release', releaseTime: releaseTime.toISOString() };
  }
  return { mode: 'monitor' };
}
```

### Watchlist Format (Release Mode)

Release snipe watches use `"mode": "release"` with additional fields:

```json
{
  "id": "snipe-torrisi",
  "enabled": true,
  "mode": "release",
  "platform": "resy",
  "venueId": 64593,
  "venueName": "Torrisi",
  "releaseTime": "2026-03-08T10:00:00-05:00",
  "targetDate": "2026-04-07",
  "partySize": 2,
  "timeRange": { "earliest": "18:00", "latest": "21:00" },
  "autoBook": true,
  "pollIntervalMs": 500,
  "filters": { "seatTypes": ["Dining Room"] }
}
```

Key differences from monitor mode:
- `mode` — `"release"` instead of omitted/`"monitor"`
- `releaseTime` — ISO datetime with timezone offset for when slots drop
- `targetDate` — single date string (not an array)
- `pollIntervalMs` — polling frequency during snipe (default 500ms)
- `autoBook` — should always be `true` for release snipes (the whole point is to book instantly)

### Cancellation Snipe Mode

For hot restaurants where reservations are already within the booking window but completely sold out. Cancellations appear and get grabbed within seconds, so 60-second polling is too slow.

**How it works:**
- Polls every 1-2 seconds (configurable via `pollIntervalMs`, default 1000ms)
- Starts immediately — no waiting for a release time
- Runs continuously until a matching slot is found or the target date passes
- The instant a slot appears, fires `/3/details` -> `/3/book` (same booking flow as release snipe)
- `AUTO_BOOK=true` must be set in `.env`
- Sends confirmation email on success

**Rate limiting:** Polling every 1 second = 60 requests/minute per restaurant. When watching multiple restaurants, a random jitter of 0-200ms is added to each poll to stagger requests and avoid all watches firing simultaneously.

**Watchlist Format (Cancellation Mode):**

```json
{
  "id": "cancel-torrisi",
  "enabled": true,
  "mode": "cancellation",
  "platform": "resy",
  "venueId": 64593,
  "venueName": "Torrisi",
  "targetDate": "2026-03-14",
  "partySize": 2,
  "timeRange": { "earliest": "18:00", "latest": "21:00" },
  "autoBook": true,
  "pollIntervalMs": 1000,
  "filters": { "seatTypes": ["Dining Room"] }
}
```

Key differences from release mode:
- `mode` — `"cancellation"` instead of `"release"`
- No `releaseTime` — starts polling immediately
- `pollIntervalMs` — default 1000ms (vs 500ms for release)
- Runs until target date passes (not a 2-minute window)

### Three Modes Summary

| Mode | When to use | Poll interval | Duration | Trigger |
|------|------------|---------------|----------|---------|
| **monitor** | Slots available, want alerts | 60s (cron) | Ongoing | `node index.js` |
| **release** | Reservations haven't dropped yet | 500ms | 2 min window | `node snipe.js` |
| **cancellation** | Sold out, watching for cancellations | 1000ms | Until target date | `node snipe.js` |

### Mode Auto-Detection

The mode detector (`src/mode-detector.js`) now supports all three modes:

```js
detectMode(watch, needToKnowText, { availableSlots })
```

Logic:
1. Parse `need_to_know` to get release policy (advance days + release time)
2. If target date's release time is in the future → `"release"` mode
3. If release time has passed AND `availableSlots === 0` → `"cancellation"` mode
4. If release time has passed AND slots are available → `"monitor"` mode

### snipe.js Entry Point

```bash
# Run a specific snipe by watch ID
node snipe.js snipe-torrisi
node snipe.js cancel-torrisi

# Run all enabled release + cancellation watches
node snipe.js
```

The entry point auto-resolves mode when not explicitly set: fetches venue metadata, checks current availability, and determines the right approach.

### Phase 2 Deliverables

1. `src/sniper.js` — Snipe engine supporting both release and cancellation modes with shared polling loop
2. `src/mode-detector.js` — Parses `need_to_know` text, determines release/cancellation/monitor mode
3. `snipe.js` — CLI entry point for running release and cancellation snipes
4. Updated `src/adapters/resy.js` — `getVenueNeedToKnow(venueId)` method
5. Updated watchlist format supporting `mode: "release"` and `mode: "cancellation"` entries
6. Millisecond-precision logging for speed tracking
7. Random jitter (0-200ms) to stagger requests across multiple watches
8. 2-minute timeout for release mode; runs until target date for cancellation mode
9. Email confirmation on successful snipe booking

---

## Phase 3 — Web Dashboard

### Concept

A localhost web UI where the user picks a restaurant and date — the app handles everything else. No need to manually determine modes, calculate release times, or edit JSON files.

### User Flow

1. **Search** — User types a restaurant name. The app hits the Resy API to find matching venues.
2. **Select** — User picks a venue. The app fetches its `need_to_know` metadata to determine the reservation release policy.
3. **Configure** — User picks a date, party size, and preferred time range.
4. **Auto-detect mode** — The app calculates:
   - If reservations for the target date are already open -> **monitor mode** (poll for cancellations every 60s)
   - If reservations haven't been released yet -> **release snipe mode** (calculates exact release datetime, waits, then polls at 500ms)
5. **Dashboard** — Shows all active watches with live status: `waiting for release`, `monitoring`, `sniping`, `booked`, `failed`, `timed out`.
6. **Notifications** — Email on successful booking (same as Phase 1/2).

### Backend (Express)

`server/index.js` — Express app serving the API and static React build.

**API Routes:**

`server/routes/venues.js`:
- `GET /api/venues/search?q=torrisi` — Search Resy for venues by name
- `GET /api/venues/:venueId/info` — Fetch venue details including `need_to_know`, returns parsed release policy

`server/routes/watches.js`:
- `GET /api/watches` — List all watches from watchlist.json
- `POST /api/watches` — Create a new watch (auto-detects mode from venue metadata)
- `PUT /api/watches/:id` — Update a watch
- `DELETE /api/watches/:id` — Remove a watch
- `POST /api/watches/:id/start` — Start monitoring/sniping a watch
- `POST /api/watches/:id/stop` — Stop a watch

`server/routes/status.js`:
- `GET /api/status` — Returns status of all running watches (mode, last poll time, slots found, etc.)

`server/orchestrator.js`:
- Manages running poller and sniper instances per watch
- Starts/stops watches dynamically
- Tracks status in memory: `{ watchId: { mode, status, lastPoll, slotsFound, error } }`
- When a watch is created via the API, orchestrator auto-determines mode and starts it

### Frontend (React + Vite)

Simple, clean UI with these components:

`VenueSearch.jsx`:
- Text input with debounced search
- Dropdown showing matching venues with name, neighborhood, cuisine type
- On select, fetches venue info and opens WatchForm

`WatchForm.jsx`:
- Shows venue name, release policy (parsed from need_to_know)
- Date picker, party size selector, time range inputs
- Shows auto-detected mode: "Will monitor for cancellations" or "Will snipe at [release time]"
- Submit creates the watch and starts it

`WatchList.jsx`:
- Dashboard grid of all watches
- Each watch shows: venue name, date, mode, status badge, time until release (if applicable)

`WatchCard.jsx`:
- Single watch card with status indicator
- Status badges: `Waiting` (yellow), `Monitoring` (blue), `Sniping` (orange), `Booked` (green), `Failed` (red)
- If release mode: countdown timer to release time
- Stop/delete buttons

### Resy Venue Search Endpoint

For the venue search feature, use:

```
GET https://api.resy.com/3/venue_search
```

or alternatively filter from the `/3/collection/venues` response. The exact search endpoint needs to be confirmed via DevTools — if a dedicated search endpoint doesn't exist, use the collection endpoint and filter client-side by name.

### Phase 3 Deliverables

1. Express API server (`server/`) with venue search, watch CRUD, and status endpoints
2. Orchestrator that manages poller + sniper instances per watch
3. React frontend (`web/`) with venue search, watch creation, and status dashboard
4. Auto-mode detection: user picks restaurant + date, app figures out the rest
5. Live status updates on the dashboard
6. Runs on localhost only — no authentication needed
7. `npm run dashboard` script to start both backend and frontend

---

## Future Phases

- OpenTable adapter (reverse-engineer their availability API)
- OpenClaw skill extraction (each adapter becomes a standalone skill)
- Token expiration monitoring and refresh
- Multiple location support (not just NY)
- Booking history log
- SMS notifications via Twilio

---

## Claude Code Prompt — Phase 1

Copy and paste this into Claude Code to build Phase 1:

```
Read SPEC.md and build the entire project based on it.
```

---

## Claude Code Prompt — Phase 2

Copy and paste this into Claude Code to build Phase 2:

```
Read SPEC.md and build Phase 2 — Release Snipe Mode. The existing Phase 1 code is already built and working. Add the following to the project:

KEY FILES TO CREATE:

1. src/sniper.js — Release snipe engine
   - Takes a watch config with mode: "release"
   - Calculates when to start based on releaseTime (5 seconds early)
   - Polls checkAvailability every pollIntervalMs (default 500ms)
   - Filters slots by timeRange and filters.seatTypes
   - The instant a matching slot is found, calls resy.autoBook(slot, partySize)
   - Sends booking confirmation email on success
   - Logs with millisecond timestamps: `[2026-03-08T15:00:00.123Z]`
   - Times out after 2 minutes past releaseTime
   - Exits process on success or timeout

2. src/mode-detector.js — Determines monitor vs release mode
   - parseReleasePolicy(needToKnowText) — regex parses strings like "Reservations can be made up to 30 days in advance, starting at 10:00 AM EST"
   - Extracts: advanceDays (integer), releaseHour, releaseMinute, timezone
   - getReleaseTime(targetDate, policy) — given a target date and policy, returns the Date when those reservations will be released
   - detectMode(watch, needToKnowText) — returns { mode: 'release', releaseTime } or { mode: 'monitor' }

3. snipe.js — CLI entry point
   - Usage: node snipe.js [watch-id]
   - If watch-id provided, runs that specific snipe from watchlist.json
   - If no watch-id, runs all enabled watches with mode: "release"
   - Loads watch from src/watchlist.json, passes to sniper.js
   - If watch doesn't have releaseTime set but has a targetDate, use mode-detector to auto-calculate it

UPDATE EXISTING FILES:

4. src/adapters/resy.js — Add a getVenueNeedToKnow(venueId) method
   - Fetches venue info and extracts the need_to_know text
   - This is used by mode-detector to determine release schedule

5. src/watchlist.json — Add a sample release snipe entry:
   {
     "id": "snipe-torrisi",
     "enabled": true,
     "mode": "release",
     "platform": "resy",
     "venueId": 64593,
     "venueName": "Torrisi",
     "releaseTime": "2026-03-08T10:00:00-05:00",
     "targetDate": "2026-04-07",
     "partySize": 2,
     "timeRange": { "earliest": "18:00", "latest": "21:00" },
     "autoBook": true,
     "pollIntervalMs": 500,
     "filters": { "seatTypes": ["Dining Room"] }
   }

6. package.json — Add script: "snipe": "node snipe.js"

IMPORTANT DETAILS:
- The sniper must be FAST. Minimize overhead in the hot loop — no unnecessary logging per poll, just log when slots are found or errors occur.
- Use process.hrtime.bigint() or Date.now() for millisecond-precision timing
- The resy adapter already has checkAvailability() and autoBook() — reuse them
- Global AUTO_BOOK=true in .env is still required as a safety switch
- Handle network errors in the poll loop gracefully — log and retry, don't crash
- The sniper should work standalone (node snipe.js) without the main poller running

Start building Phase 2 now.
```
