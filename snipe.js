const config = require('./src/config');
const { snipe } = require('./src/sniper');
const { detectMode } = require('./src/mode-detector');
const resy = require('./src/adapters/resy');
const watchlist = require('./src/watchlist.json');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function resolveReleaseTime(watch) {
  // If releaseTime is already set, use it
  if (watch.releaseTime) return watch;

  // Otherwise, try to auto-detect from venue metadata
  log(`[${watch.id}] No releaseTime set — fetching venue metadata to auto-detect...`);
  try {
    const needToKnow = await resy.getVenueNeedToKnow(watch.venueId);
    if (needToKnow) {
      log(`[${watch.id}] need_to_know: "${needToKnow}"`);
      const result = detectMode(watch, needToKnow);
      if (result.mode === 'release' && result.releaseTime) {
        log(`[${watch.id}] Auto-detected release time: ${result.releaseTime}`);
        return { ...watch, releaseTime: result.releaseTime };
      }
      log(`[${watch.id}] Could not determine release time from metadata — reservations may already be open`);
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

  // Find watches to snipe
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
      (w) => w.enabled && (w.mode === 'release' || w.mode === 'snipe')
    );
  }

  if (watches.length === 0) {
    log('No release snipe watches found. Add watches with "mode": "release" to watchlist.json.');
    process.exit(0);
  }

  log(`Found ${watches.length} snipe watch(es)`);

  for (const watch of watches) {
    const resolved = await resolveReleaseTime(watch);

    if (!resolved.releaseTime) {
      log(`[${watch.id}] Skipping — no releaseTime and could not auto-detect`);
      continue;
    }

    if (!resolved.targetDate) {
      log(`[${watch.id}] Skipping — no targetDate specified`);
      continue;
    }

    log(`[${watch.id}] Starting snipe for ${watch.venueName}...`);
    const result = await snipe(resolved);

    if (result.success) {
      log(`[${watch.id}] Snipe successful after ${result.pollCount} polls!`);
    } else {
      log(`[${watch.id}] Snipe failed after ${result.pollCount} polls`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
