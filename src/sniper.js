/**
 * Snipe engine — high-frequency polling with instant booking.
 * Supports two modes:
 *   - "release" — waits for release time, polls for 2 minutes
 *   - "cancellation" — starts immediately, runs until booking or target date passes
 */

const resy = require('./adapters/resy');
const config = require('./config');
const { sendBookingConfirmation } = require('./notifications/email');

const RELEASE_TIMEOUT_MS = 120000; // 2 minutes for release mode
const LEAD_TIME_MS = 5000; // start 5 seconds early for release mode
const MAX_JITTER_MS = 200; // random jitter to stagger requests

const log = (msg) => console.log(`[${new Date().toISOString()}] [sniper] ${msg}`);

function filterSlots(slots, watch) {
  return slots.filter((slot) => {
    if (watch.filters?.seatTypes?.length > 0) {
      const seatType = slot.config?.type;
      if (seatType && !watch.filters.seatTypes.includes(seatType)) return false;
    }
    if (watch.filters?.excludeGDAOnly && slot.is_global_dining_access) return false;
    if (watch.filters?.maxCancellationFee != null) {
      if ((slot.payment?.cancellation_fee || 0) > watch.filters.maxCancellationFee) return false;
    }
    return true;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter() {
  return Math.floor(Math.random() * MAX_JITTER_MS);
}

async function sleepUntil(targetTime) {
  const now = Date.now();
  const target = targetTime.getTime();
  if (target <= now) return;
  const ms = target - now;
  log(`Waiting ${Math.round(ms / 1000)}s until ${targetTime.toISOString()}...`);
  await sleep(ms);
}

function isTargetDatePassed(targetDate) {
  const today = new Date().toISOString().split('T')[0];
  return targetDate < today;
}

/**
 * Core polling loop shared by both release and cancellation modes.
 * Returns { success, slot, pollCount } or { success: false, pollCount }.
 */
async function pollLoop(watch, { deadline, interval, modeLabel }) {
  let pollCount = 0;
  const targetDate = watch.targetDate;

  log(`${modeLabel} snipe active — polling every ${interval}ms`);

  while (Date.now() < deadline) {
    const pollStart = Date.now();
    pollCount++;

    try {
      const slots = await resy.checkAvailability({
        venueId: watch.venueId,
        date: targetDate,
        partySize: watch.partySize,
        timeRange: watch.timeRange,
      });

      const filtered = filterSlots(slots, watch);

      if (filtered.length > 0) {
        const elapsed = Date.now() - pollStart;
        const slot = filtered[0];
        const time = slot.date?.start?.split(' ')[1]?.substring(0, 5) || '??:??';
        log(`SLOT FOUND in ${elapsed}ms (poll #${pollCount}) — ${time} ${slot.config?.type || ''}`);
        log(`Booking immediately...`);

        try {
          await resy.autoBook(slot, watch.partySize);
          log(`BOOKED! ${watch.venueName} on ${targetDate} at ${time}`);

          try {
            await sendBookingConfirmation(watch, slot, targetDate);
            log('Confirmation email sent');
          } catch (emailErr) {
            log(`Email failed (but booking succeeded): ${emailErr.message}`);
          }

          return { success: true, slot, pollCount };
        } catch (bookErr) {
          log(`Booking failed: ${bookErr.response?.status} ${bookErr.response?.data?.message || bookErr.message}`);
        }
      }
    } catch (err) {
      if (pollCount % 10 === 1) {
        log(`Poll #${pollCount} error: ${err.response?.status || ''} ${err.message}`);
      }
    }

    // Wait remainder of interval + random jitter to stagger requests
    const elapsed = Date.now() - pollStart;
    const wait = Math.max(0, interval - elapsed) + jitter();
    if (wait > 0) await sleep(wait);

    // For cancellation mode: check if target date has passed (every 60 polls)
    if (modeLabel === 'Cancellation' && pollCount % 60 === 0) {
      if (isTargetDatePassed(targetDate)) {
        log(`Target date ${targetDate} has passed — stopping`);
        break;
      }
    }
  }

  return { success: false, pollCount };
}

/**
 * Release snipe — waits for release time, polls aggressively for 2 minutes.
 */
async function snipeRelease(watch) {
  const releaseTime = new Date(watch.releaseTime);
  const startPollingAt = new Date(releaseTime.getTime() - LEAD_TIME_MS);
  const deadline = releaseTime.getTime() + RELEASE_TIMEOUT_MS;
  const interval = watch.pollIntervalMs || 500;

  log(`Mode: RELEASE SNIPE`);
  log(`Target: ${watch.venueName} (${watch.venueId})`);
  log(`Date: ${watch.targetDate} | Party: ${watch.partySize} | Interval: ${interval}ms`);
  log(`Release time: ${releaseTime.toISOString()}`);
  log(`Deadline: ${new Date(deadline).toISOString()}`);

  await sleepUntil(startPollingAt);

  const result = await pollLoop(watch, { deadline, interval, modeLabel: 'Release' });

  if (!result.success) {
    log(`Timed out after ${result.pollCount} polls over 2 minutes — no slots booked for ${watch.venueName}`);
  }
  return result;
}

/**
 * Cancellation snipe — starts immediately, runs until booking or target date passes.
 */
async function snipeCancellation(watch) {
  const interval = watch.pollIntervalMs || 3000;
  // Deadline: end of target date (midnight ET next day, approximated as 5AM UTC)
  const deadlineDate = new Date(watch.targetDate + 'T05:00:00Z');
  const deadline = deadlineDate.getTime();

  const hoursLeft = Math.round((deadline - Date.now()) / 3600000);

  log(`Mode: CANCELLATION SNIPE`);
  log(`Target: ${watch.venueName} (${watch.venueId})`);
  log(`Date: ${watch.targetDate} | Party: ${watch.partySize} | Interval: ${interval}ms`);
  log(`Will run for up to ~${hoursLeft} hours until target date passes`);
  log(`Polling starts NOW`);

  const result = await pollLoop(watch, { deadline, interval, modeLabel: 'Cancellation' });

  if (!result.success) {
    log(`No cancellation slots found after ${result.pollCount} polls for ${watch.venueName}`);
  }
  return result;
}

/**
 * Main entry point — dispatches to the right snipe mode.
 */
async function snipe(watch) {
  if (!config.autoBook) {
    log('ABORT: AUTO_BOOK is not enabled in .env — set AUTO_BOOK=true to use snipe mode');
    process.exit(1);
  }

  const mode = watch.mode || 'release';

  if (mode === 'cancellation') {
    return snipeCancellation(watch);
  }
  return snipeRelease(watch);
}

module.exports = { snipe, snipeRelease, snipeCancellation };
