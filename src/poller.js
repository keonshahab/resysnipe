const cron = require('node-cron');
const config = require('./config');
const resyAdapter = require('./adapters/resy');
const opentableAdapter = require('./adapters/opentable');
const { sendSlotAlert, sendBookingConfirmation } = require('./notifications/email');
const watchlist = require('./watchlist.json');

const adapters = {
  resy: resyAdapter,
  opentable: opentableAdapter,
};

const seenSlots = new Set();

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function filterSlots(slots, filters) {
  return slots.filter((slot) => {
    // Filter by seat type
    if (filters.seatTypes && filters.seatTypes.length > 0) {
      const seatType = slot.config?.type;
      if (seatType && !filters.seatTypes.includes(seatType)) return false;
    }

    // Filter out GDA-only if requested
    if (filters.excludeGDAOnly && slot.is_global_dining_access) {
      return false;
    }

    // Filter by max cancellation fee
    if (filters.maxCancellationFee !== null && filters.maxCancellationFee !== undefined) {
      const fee = slot.payment?.cancellation_fee || 0;
      if (fee > filters.maxCancellationFee) return false;
    }

    return true;
  });
}

async function processWatch(watch) {
  const adapter = adapters[watch.platform];
  if (!adapter) {
    log(`[${watch.id}] Unknown platform: ${watch.platform}`);
    return;
  }

  for (const date of watch.dates) {
    try {
      log(`[${watch.id}] Checking ${watch.venueName} on ${date} for ${watch.partySize} guests...`);

      let slots = await adapter.checkAvailability({
        venueId: watch.venueId,
        date,
        partySize: watch.partySize,
        timeRange: watch.timeRange,
      });

      if (watch.filters) {
        slots = filterSlots(slots, watch.filters);
      }

      // Find new slots we haven't seen before
      const newSlots = slots.filter((slot) => {
        const token = slot.config?.token;
        if (!token || seenSlots.has(token)) return false;
        seenSlots.add(token);
        return true;
      });

      if (newSlots.length === 0) {
        log(`[${watch.id}] No new slots for ${watch.venueName} on ${date}`);
        continue;
      }

      log(`[${watch.id}] Found ${newSlots.length} new slot(s) for ${watch.venueName} on ${date}!`);

      // Auto-book if enabled globally and per-watch
      if (config.autoBook && watch.autoBook && adapter.autoBook) {
        const slot = newSlots[0]; // Book the first matching slot
        try {
          log(`[${watch.id}] Auto-booking ${slot.date?.start} at ${watch.venueName}...`);
          await adapter.autoBook(slot, watch.partySize);
          log(`[${watch.id}] Successfully auto-booked!`);
          await sendBookingConfirmation(watch, slot, date);
        } catch (err) {
          log(`[${watch.id}] Auto-book failed: ${err.message}`);
          // Fall back to sending an alert
          await sendSlotAlert(watch, newSlots, date);
        }
      } else {
        await sendSlotAlert(watch, newSlots, date);
        log(`[${watch.id}] Alert email sent`);
      }
    } catch (err) {
      log(`[${watch.id}] Error checking ${watch.venueName} on ${date}: ${err.message}`);
    }
  }
}

async function pollAll() {
  log('--- Poll cycle starting ---');
  const enabledWatches = watchlist.watches.filter((w) => w.enabled);
  log(`Processing ${enabledWatches.length} active watch(es)`);

  for (const watch of enabledWatches) {
    await processWatch(watch);
  }

  log('--- Poll cycle complete ---');
}

function start() {
  const interval = config.pollIntervalMinutes;
  log(`Starting poller — checking every ${interval} minute(s)`);
  log(`Auto-book global setting: ${config.autoBook ? 'ENABLED' : 'DISABLED'}`);

  // Run immediately on start
  pollAll();

  // Then schedule
  cron.schedule(`*/${interval} * * * *`, pollAll);
}

module.exports = { start, pollAll };
