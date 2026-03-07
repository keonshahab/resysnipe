# Reservation Sniper — Claude Code Build Spec

## Overview

Personal reservation monitoring tool that polls Resy and OpenTable for availability at target restaurants and sends email alerts when slots open up. Runs on macOS, designed to be modular so adapters can later be extracted as OpenClaw skills.

---

## Architecture

```
reservation-sniper/
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

## Phase 2 (Future)

- OpenTable adapter (reverse-engineer their availability API)
- Simple web dashboard to manage watchlist
- OpenClaw skill extraction (each adapter becomes a standalone skill)
- Booking confirmation details in email alerts
- Token expiration monitoring and refresh

---

## Claude Code Prompt

Copy and paste this into Claude Code to build the project:

```
Build a Node.js reservation sniper app based on this spec. The app monitors Resy for restaurant reservation availability and auto-books when slots open. This project is in a git repo at https://github.com/keonshahab/resysnipe.

Key requirements:

ARCHITECTURE:
- Modular adapter pattern: src/adapters/resy.js and src/adapters/opentable.js (stub)
- Each adapter exports: checkAvailability({ venueId, date, partySize, timeRange }) and getVenueInfo(venueId)
- src/notifications/email.js for Nodemailer alerts
- src/poller.js for the cron loop
- src/config.js loads .env via dotenv
- watchlist.json for target restaurants

RESY ADAPTER:
- GET https://api.resy.com/4/find with params: venue_id, day (YYYY-MM-DD), party_size, lat=0, long=0
- Auth headers on every request:
  - authorization: ResyAPI api_key="VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"
  - x-resy-auth-token: <from .env RESY_AUTH_TOKEN>
  - x-resy-universal-auth: <same token>
  - origin: https://resy.com
  - referer: https://resy.com/
  - accept: application/json
  - cache-control: no-cache
- Slots are in results.venues[].slots[] — each has config.token, date.start, date.end, quantity, is_global_dining_access, payment info

AUTO-BOOKING FLOW (two POST requests):
1. POST /3/details with payload: { commit: 0, config_id: slot.config.token, day: "YYYY-MM-DD", party_size: N }
   - Response contains book_token somewhere in the JSON body
2. POST /3/book with payload: { book_token: "<from step 1>", struct_payment_method: {"id": <from .env RESY_PAYMENT_METHOD_ID as integer>}, source_id: "resy.com-venue-card", venue_marketing_opt_in: 0 }
   - Returns 201 Created on success

POLLER:
- node-cron, runs every 60 seconds
- For each enabled watch in watchlist.json: check availability, filter by timeRange and seatTypes
- Track seen slots in-memory (Set of config.token values) to only act on NEW slots
- If new slot found AND autoBook is true on the watch AND AUTO_BOOK=true in .env: run the auto-book flow, then send confirmation email
- If autoBook is false: just send alert email with booking link
- Handle errors gracefully — log and continue, never crash

EMAIL:
- Nodemailer with Gmail app password
- Include: restaurant name, time, seat type, GDA status, cancellation fee, direct Resy link
- Different subject line for "auto-booked" vs "slot available"

WATCHLIST FORMAT:
{
  "watches": [{
    "id": "watch-1",
    "enabled": true,
    "platform": "resy",
    "venueId": 55555,
    "venueName": "Carne Mare",
    "dates": ["2026-03-14", "2026-03-15"],
    "partySize": 2,
    "timeRange": { "earliest": "18:00", "latest": "21:00" },
    "autoBook": true,
    "filters": { "excludeGDAOnly": false, "maxCancellationFee": null, "seatTypes": ["Dining Room"] }
  }]
}

CREATE THE ACTUAL .env FILE (not just .env.example) with these values:
RESY_API_KEY=VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5
RESY_AUTH_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJleHAiOjE3NzY3OTgxNjUsInVpZCI6ODA0NjQ4MiwiZ3QiOiJjb25zdW1lciIsImdzIjpbXSwibGFuZyI6ImVuLXVzIiwiZXh0cmEiOnsiZ3Vlc3RfaWQiOjM2Njc2NTE2fX0.AV-Gl92bgkbGuJAQJn24QrwCggGiP-McjMPAB0u8IgFFAVNXOCZUc_ttsYAun23ltynMgY-JjtD3dsMAJ29lRKv4ASYBKU7DU7fFAJtMECNjKdNWb4aLLTN8XUH_9VX53c2CBtlZlPDhfXH0nd0imdL2Mq9fswB5hmDwExJswQso1JqU
RESY_PAYMENT_METHOD_ID=15332505
EMAIL_FROM=kshahab6@gmail.com
EMAIL_TO=kshahab6@gmail.com
EMAIL_PASSWORD=sugvpllytuvkwoen
POLL_INTERVAL_MINUTES=1
AUTO_BOOK=false

Also create a .env.example with placeholder values (no real secrets).

CRITICAL: Create .gitignore FIRST before anything else, and make sure it includes:
node_modules/
.env

Also include:
- test-resy.js script to verify API connectivity (fetches availability for venue 55555)
- Clean console logging with timestamps
- README.md with setup and usage instructions

Start building the complete project now.
```
