/**
 * Release snipe engine — high-frequency polling with instant booking.
 * Designed for restaurants that release reservations at a specific time.
 */

const resy = require('./adapters/resy');
const config = require('./config');
const { sendBookingConfirmation } = require('./notifications/email');

const TIMEOUT_MS = 120000; // 2 minutes
const LEAD_TIME_MS = 5000; // start 5 seconds early

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

async function sleepUntil(targetTime) {
  const now = Date.now();
  const target = targetTime.getTime();
  if (target <= now) return;
  const ms = target - now;
  log(`Waiting ${Math.round(ms / 1000)}s until ${targetTime.toISOString()}...`);
  await sleep(ms);
}

async function snipe(watch) {
  if (!config.autoBook) {
    log('ABORT: AUTO_BOOK is not enabled in .env — set AUTO_BOOK=true to use snipe mode');
    process.exit(1);
  }

  const releaseTime = new Date(watch.releaseTime);
  const startPollingAt = new Date(releaseTime.getTime() - LEAD_TIME_MS);
  const deadline = new Date(releaseTime.getTime() + TIMEOUT_MS);
  const interval = watch.pollIntervalMs || 500;
  const targetDate = watch.targetDate;

  log(`Target: ${watch.venueName} (${watch.venueId})`);
  log(`Date: ${targetDate} | Party: ${watch.partySize} | Interval: ${interval}ms`);
  log(`Release time: ${releaseTime.toISOString()}`);
  log(`Will start polling at: ${startPollingAt.toISOString()}`);
  log(`Deadline: ${deadline.toISOString()}`);

  // Wait until lead time before release
  await sleepUntil(startPollingAt);

  log(`Snipe started — polling every ${interval}ms`);

  let pollCount = 0;

  while (Date.now() < deadline.getTime()) {
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
          // Continue polling — slot might have been grabbed, but others may appear
        }
      }
    } catch (err) {
      // Only log errors occasionally to avoid flooding
      if (pollCount % 10 === 1) {
        log(`Poll #${pollCount} error: ${err.response?.status || ''} ${err.message}`);
      }
    }

    // Wait remainder of interval
    const elapsed = Date.now() - pollStart;
    if (elapsed < interval) {
      await sleep(interval - elapsed);
    }
  }

  log(`Timed out after ${pollCount} polls over 2 minutes — no slots booked for ${watch.venueName}`);
  return { success: false, pollCount };
}

module.exports = { snipe };
