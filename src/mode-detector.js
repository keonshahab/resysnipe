/**
 * Parses Resy venue need_to_know text to determine reservation release policy
 * and auto-detect whether to use monitor mode or release snipe mode.
 */

function parseReleasePolicy(needToKnowText) {
  if (!needToKnowText) return null;

  // Match patterns like:
  // "Reservations can be made up to 30 days in advance, starting at 10:00 AM EST"
  // "Reservations are released 14 days in advance at 9:00 AM ET"
  // "Book up to 21 days ahead starting at 12:00 PM EDT"
  const daysMatch = needToKnowText.match(/(\d+)\s*days?\s*(?:in advance|ahead|out)/i);
  const timeMatch = needToKnowText.match(
    /(?:at|starting at|beginning at)\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*(E[SD]T|ET|C[SD]T|CT|P[SD]T|PT)/i
  );

  if (!daysMatch || !timeMatch) return null;

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3].toUpperCase();
  const timezone = timeMatch[4].toUpperCase();

  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  return {
    advanceDays: parseInt(daysMatch[1], 10),
    releaseHour: hour,
    releaseMinute: minute,
    timezone,
  };
}

// Map timezone abbreviations to UTC offset in minutes
function getTimezoneOffset(tz) {
  const offsets = {
    EST: -300, ET: -300, EDT: -240,
    CST: -360, CT: -360, CDT: -300,
    PST: -480, PT: -480, PDT: -420,
  };
  return offsets[tz] ?? -300; // default to ET
}

function getReleaseTime(targetDate, policy) {
  // The release date is: targetDate minus advanceDays
  const target = new Date(targetDate + 'T00:00:00Z');
  const releaseDate = new Date(target);
  releaseDate.setUTCDate(releaseDate.getUTCDate() - policy.advanceDays);

  const year = releaseDate.getUTCFullYear();
  const month = String(releaseDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(releaseDate.getUTCDate()).padStart(2, '0');
  const hour = String(policy.releaseHour).padStart(2, '0');
  const min = String(policy.releaseMinute).padStart(2, '0');

  // Build the release time in the venue's local timezone, then convert to UTC
  const offsetMinutes = getTimezoneOffset(policy.timezone);
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const offsetStr = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

  return new Date(`${year}-${month}-${day}T${hour}:${min}:00${offsetStr}`);
}

/**
 * Determines which mode to use for a given watch:
 *   - "release"      — target date is outside the booking window (reservations haven't dropped yet)
 *   - "cancellation"  — target date is inside the window AND no matching slots available
 *   - "monitor"       — target date is inside the window AND slots are currently available
 *
 * @param {object} watch - Watch config
 * @param {string} needToKnowText - Venue's need_to_know text
 * @param {object} [options]
 * @param {number} [options.availableSlots] - Number of currently available matching slots (for cancellation detection)
 */
function detectMode(watch, needToKnowText, options = {}) {
  const policy = parseReleasePolicy(needToKnowText);
  if (!policy) return { mode: 'monitor', policy: null };

  const targetDate = watch.targetDate || (watch.dates && watch.dates[0]);
  if (!targetDate) return { mode: 'monitor', policy };

  const releaseTime = getReleaseTime(targetDate, policy);

  if (releaseTime > new Date()) {
    return { mode: 'release', releaseTime: releaseTime.toISOString(), policy };
  }

  // Reservations are already open — check if any slots are available
  if (typeof options.availableSlots === 'number' && options.availableSlots === 0) {
    return { mode: 'cancellation', policy };
  }

  return { mode: 'monitor', policy };
}

module.exports = { parseReleasePolicy, getReleaseTime, detectMode };
