# ResySnipe

Reservation monitoring tool that polls Resy for availability at target restaurants and sends email alerts (or auto-books) when slots open up.

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   - `RESY_AUTH_TOKEN` — Your Resy JWT session token (grab from browser DevTools)
   - `RESY_PAYMENT_METHOD_ID` — Your saved payment method ID (for auto-booking)
   - `EMAIL_PASSWORD` — Gmail App Password (not your regular password)

3. Edit `src/watchlist.json` to add the restaurants you want to monitor.

## Usage

**Test Resy API connectivity:**
```bash
npm run test-resy
```

**Start the poller:**
```bash
npm start
```

The poller runs on a cron schedule (default: every 1 minute) and checks all enabled watches in the watchlist.

## Auto-Booking

Auto-booking has two safety switches — both must be enabled:

1. `AUTO_BOOK=true` in `.env` (global kill switch)
2. `"autoBook": true` on the individual watch in `watchlist.json`

When both are true and a matching slot is found, it will automatically book the first available slot and send a confirmation email.

## Watchlist

Edit `src/watchlist.json` to configure watches. Each watch supports:

- `venueId` — Resy venue ID
- `dates` — Array of dates to check (YYYY-MM-DD)
- `partySize` — Number of guests
- `timeRange` — Earliest/latest times (HH:MM)
- `autoBook` — Per-watch auto-book toggle
- `filters` — Seat type, GDA exclusion, max cancellation fee
