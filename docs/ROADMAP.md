# ResySnipe — Roadmap & TODO

## Next Session — Calendar View & Filters
- [ ] 30-day calendar view when selecting a restaurant (color-coded: green = available, amber = filling up, pink = sold out, gray = not released) — inspired by snagnyc.com
- [ ] Filter bar on dashboard: date picker, time buckets (< 2pm, 2-6, 6-8, 8pm+), party size toggle, area dropdown, cuisine dropdown
- [ ] Status sidebar filter: All / Sniping / Available / Sold Out
- [ ] Create a burner Resy account for sniping (keep main account safe). Add support for multiple accounts in .env so you can switch from the dashboard

## Phase 4 — Multi-Platform
- [ ] OpenTable adapter (reverse-engineer availability + booking API)
- [ ] SevenRooms adapter (Major Food Group: Carbone, Sadelle's, Dirty French, etc.)
- [ ] Unified search across all three platforms
- [ ] Platform indicator on watch cards (Resy / OpenTable / SevenRooms badge)

## Phase 5 — Discovery & Intelligence
- [ ] Eater/Infatuation integration: scrape "best of" lists, match to Resy venue IDs, show as suggestion cards on New Snipe screen
- [ ] Release calendar: visual calendar showing when reservations drop for all watched restaurants
- [ ] Success analytics: track booking success rate by restaurant, time of day, mode

## Belt & Suspenders
- [ ] Resy notify subscription: subscribe to Resy's built-in notify system alongside polling for double coverage (notify_options field in API response)

## Polish
- [ ] Monitor mode: show available time slots with one-click book buttons
- [ ] Hitlist: fetch images for all saved restaurants (not just fallback)
- [ ] Rate limiting protection: add backoff if Resy returns 429, rotate between accounts

## Done
- [x] Phase 1: Core engine — Resy API, monitor mode, email alerts, auto-booking
- [x] Phase 2: Release snipe (500ms at release time) + cancellation snipe (3s continuous)
- [x] Phase 2: Mode auto-detection from need_to_know text
- [x] Phase 3: Web dashboard — Express + React + SSE
- [x] Phase 3: Search → Configure → Activate flow
- [x] Phase 3: Date range picker (from/to, auto-expands)
- [x] Phase 3: Light theme redesign (inspired by snagnyc.com)
- [x] Phase 3.1: Hitlist / Your Saves with hardcoded fallback
- [x] Phase 3.2: Watch grouping by restaurant + date range
- [x] Phase 3.2: Delete All button
- [x] Phase 3.2: Confirmation dialogs before booking/deleting
- [x] Email changed to ksresy@gmail.com
