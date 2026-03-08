const config = require('./src/config');
const { snipe } = require('./src/sniper');
const { detectMode } = require('./src/mode-detector');
const resy = require('./src/adapters/resy');
const watchlist = require('./src/watchlist.json');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function resolveWatch(watch) {
  // If mode and releaseTime are already set, nothing to resolve
  if (watch.mode === 'cancellation') return watch;
  if (watch.mode === 'release' && watch.releaseTime) return watch;

  // Try to auto-detect mode from venue metadata
  log(`[${watch.id}] Fetching venue metadata to auto-detect mode...`);
  try {
    const needToKnow = await resy.getVenueNeedToKnow(watch.venueId);
    if (needToKnow) {
      log(`[${watch.id}] need_to_know: "${needToKnow}"`);

      // Check current availability to distinguish cancellation vs monitor
      const targetDate = watch.targetDate || (watch.dates && watch.dates[0]);
      let availableSlots;
      if (targetDate) {
        try {
          const slots = await resy.checkAvailability({
            venueId: watch.venueId,
            date: targetDate,
            partySize: watch.partySize,
            timeRange: watch.timeRange,
          });
          availableSlots = slots.length;
          log(`[${watch.id}] Current availability: ${availableSlots} matching slot(s)`);
        } catch (err) {
          log(`[${watch.id}] Could not check current availability: ${err.message}`);
        }
      }

      const result = detectMode(watch, needToKnow, { availableSlots });
      log(`[${watch.id}] Auto-detected mode: ${result.mode}`);

      if (result.mode === 'release' && result.releaseTime) {
        return { ...watch, mode: 'release', releaseTime: result.releaseTime };
      }
      if (result.mode === 'cancellation') {
        return { ...watch, mode: 'cancellation' };
      }
    } else {
      log(`[${watch.id}] No need_to_know text found for venue`);
    }
  } catch (err) {
    log(`[${watch.id}] Failed to fetch venue metadata: ${err.message}`);
  }
  return watch;
}

async function main() {
  const watchId = process.argv[2];

  let watches;
  if (watchId) {
    const watch = watchlist.watches.find((w) => w.id === watchId);
    if (!watch) {
      log(`Watch "${watchId}" not found in watchlist.json`);
      process.exit(1);
    }
    watches = [watch];
  } else {
    watches = watchlist.watches.filter(
      (w) => w.enabled && (w.mode === 'release' || w.mode === 'cancellation' || w.mode === 'snipe')
    );
  }

  if (watches.length === 0) {
    log('No snipe watches found. Add watches with "mode": "release" or "cancellation" to watchlist.json.');
    process.exit(0);
  }

  log(`Found ${watches.length} snipe watch(es)`);

  for (const watch of watches) {
    const resolved = await resolveWatch(watch);

    if (resolved.mode === 'release' && !resolved.releaseTime) {
      log(`[${watch.id}] Skipping — release mode but no releaseTime and could not auto-detect`);
      continue;
    }

    if (!resolved.targetDate) {
      log(`[${watch.id}] Skipping — no targetDate specified`);
      continue;
    }

    log(`[${watch.id}] Starting ${resolved.mode} snipe for ${watch.venueName}...`);
    const result = await snipe(resolved);

    if (result.success) {
      log(`[${watch.id}] Snipe successful after ${result.pollCount} polls!`);
    } else {
      log(`[${watch.id}] Snipe ended after ${result.pollCount} polls — no booking`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
