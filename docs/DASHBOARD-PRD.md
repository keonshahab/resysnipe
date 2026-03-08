# ResySnipe Dashboard — Product Requirements Document

## Vision

A personal, localhost-only web dashboard where you search for any NYC restaurant, pick a date and party size, and the app does the rest. No manual JSON editing, no thinking about which "mode" to use — the system figures out the optimal strategy and executes it.

You open `localhost:3000`, type "Torrisi", select April 7 for 2 people at 7pm, and hit go. The app knows Torrisi releases 30 days out at 10am, calculates that April 7 slots drop on March 8 at 10:00 AM ET, and sets up a release snipe automatically. If you pick March 14 instead, it checks availability, sees zero slots, and switches to cancellation snipe mode. If you pick a restaurant with open tables, it monitors for the best slot and alerts you.

One button. Zero config.

---

## User Flow

### 1. Search & Select a Restaurant

- Search bar at top — type restaurant name, live results appear
- Each result: name, neighborhood, cuisine, price range, rating
- Click to select → fetches venue metadata including need_to_know
- Parses release policy and displays it

### 2. Configure Your Snipe

- Restaurant card with name, image, neighborhood, rating, release policy
- Date picker (one or multiple dates)
- Party size selector (1-10)
- Time range (earliest/latest)
- Seat type filter (auto-populated from venue)
- Preview showing detected mode and why

### 3. Activate & Monitor

- "Start Sniping" button
- Live status card: mode, poll count, last check, countdown, slots found
- Green = booked, Amber = active, Gray = waiting, Red = failed

### 4. Dashboard Home

- All active watches in a grid
- Quick stats: active watches, bookings, total polls
- "+ New Snipe" button

---

## Technical Architecture

### Stack
- Backend: Express.js
- Frontend: React SPA served by Express
- Communication: REST API + SSE for live updates
- State: In-memory + watchlist.json for persistence
- Entry: npm run dashboard

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/search?q=name | GET | Search Resy venues |
| /api/venue/:venueId | GET | Venue details + release policy |
| /api/availability/:venueId | GET | Current slot availability |
| /api/watches | GET | List watches with status |
| /api/watches | POST | Create watch (auto-detects mode) |
| /api/watches/:id | DELETE | Remove watch |
| /api/watches/:id/start | POST | Start/resume |
| /api/watches/:id/stop | POST | Stop/pause |
| /api/events | GET (SSE) | Live status stream |

### Resy Search API

POST https://api.resy.com/3/venuesearch/search

Payload:
{
  "geo": { "latitude": 40.7359, "longitude": -73.9904 },
  "highlight": { "pre_tag": "<b>", "post_tag": "</b>" },
  "per_page": 5,
  "query": "search term here",
  "slot_filter": { "day": "YYYY-MM-DD", "party_size": 2 },
  "types": ["venue", "cuisine"]
}

Response: search.hits[] with id.resy, name, neighborhood, cuisine[], rating, price_range_id, is_global_dining_access, images[], favorite, url_slug, availability.slots[]

Each hit also includes need_to_know in templates[].content["en-us"].need_to_know.body

### Favorites/Hitlist

The search response includes a "favorite": true/false field on each venue indicating if the user has saved it.

### Watch Manager

- Loads watches from watchlist.json on startup
- Spins up appropriate handler per watch (monitor/release/cancellation)
- Tracks in-memory: poll count, last check, slots found, booking result
- Broadcasts via SSE
- Persists changes to watchlist.json

### Design Direction

Dark, minimal, utilitarian — Bloomberg terminal meets modern dark mode.
- Near-black background, high-contrast text
- Monospace for numbers/stats, sans-serif for labels
- Color coding: green=success, amber=active, gray=waiting, red=failed
- Subtle pulse animation on actively polling cards
- No unnecessary chrome

---

## Success Criteria

1. Open localhost:3000
2. Search "Torrisi"
3. Select it, pick date and party size
4. Hit "Start Sniping"
5. Watch live polling status
6. Get email + dashboard notification on booking

Zero JSON editing. Zero terminal commands. Just a browser.
