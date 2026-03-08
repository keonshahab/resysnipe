const fs = require('fs');
const path = require('path');
const resy = require('../src/adapters/resy');
const config = require('../src/config');
const { sendBookingConfirmation, sendSlotAlert } = require('../src/notifications/email');
const { detectMode, parseReleasePolicy, getReleaseTime } = require('../src/mode-detector');

const WATCHLIST_PATH = path.join(__dirname, '..', 'src', 'watchlist.json');
const MAX_JITTER_MS = 200;

const log = (msg) => console.log(`[${new Date().toISOString()}] [manager] ${msg}`);

class WatchManager {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.watches = new Map(); // id -> { config, state }
    this.timers = new Map(); // id -> { abort }
    this.seenSlots = new Map(); // id -> Set of tokens
  }

  loadFromDisk() {
    try {
      const data = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
      for (const w of data.watches || []) {
        this.watches.set(w.id, {
          config: w,
          state: {
            status: 'stopped',
            pollCount: 0,
            slotsFound: 0,
            lastCheck: null,
            startedAt: null,
            bookedTime: null,
            bookedAt: null,
            error: null,
          },
        });
        this.seenSlots.set(w.id, new Set());
      }
      log(`Loaded ${this.watches.size} watches from disk`);
    } catch (err) {
      log(`Failed to load watchlist: ${err.message}`);
    }
  }

  saveToDisk() {
    const watches = [];
    for (const [, entry] of this.watches) {
      watches.push(entry.config);
    }
    fs.writeFileSync(WATCHLIST_PATH, JSON.stringify({ watches }, null, 2) + '\n');
  }

  getAllWatches() {
    const result = [];
    for (const [id, entry] of this.watches) {
      result.push({ ...entry.config, ...entry.state, id });
    }
    return result;
  }

  createWatch(body) {
    const id = body.id || `watch-${Date.now()}`;
    const watchConfig = {
      id,
      enabled: true,
      mode: body.mode || 'monitor',
      platform: body.platform || 'resy',
      venueId: body.venueId,
      venueName: body.venueName,
      neighborhood: body.neighborhood,
      cuisine: body.cuisine,
      targetDate: body.targetDate,
      dates: body.dates,
      partySize: body.partySize || 2,
      timeRange: body.timeRange,
      autoBook: body.autoBook !== false,
      pollIntervalMs: body.pollIntervalMs,
      releaseTime: body.releaseTime,
      filters: body.filters || {},
      seatType: body.filters?.seatTypes?.[0] || 'Dining Room',
    };

    this.watches.set(id, {
      config: watchConfig,
      state: {
        status: 'stopped',
        pollCount: 0,
        slotsFound: 0,
        lastCheck: null,
        startedAt: null,
        bookedTime: null,
        bookedAt: null,
        error: null,
      },
    });
    this.seenSlots.set(id, new Set());
    this.saveToDisk();
    this.startWatch(id);
    return this.getWatch(id);
  }

  deleteWatch(id) {
    if (!this.watches.has(id)) return false;
    this.stopWatch(id);
    this.watches.delete(id);
    this.seenSlots.delete(id);
    this.saveToDisk();
    this.broadcastAll();
    return true;
  }

  getWatch(id) {
    const entry = this.watches.get(id);
    if (!entry) return null;
    return { ...entry.config, ...entry.state, id };
  }

  startWatch(id) {
    const entry = this.watches.get(id);
    if (!entry) return null;

    // Stop existing timer if running
    this.stopTimer(id);

    const mode = entry.config.mode || 'monitor';
    entry.state.status = mode === 'release' ? 'waiting' : mode === 'cancellation' ? 'polling' : 'monitoring';
    entry.state.startedAt = Date.now();
    entry.state.pollCount = 0;
    entry.state.slotsFound = 0;
    entry.state.error = null;

    log(`Starting watch ${id} in ${mode} mode`);
    this.broadcastAll();

    if (mode === 'release') {
      this.runReleaseSnipe(id);
    } else if (mode === 'cancellation') {
      this.runCancellationLoop(id);
    } else {
      this.runMonitorLoop(id);
    }

    return this.getWatch(id);
  }

  stopWatch(id) {
    const entry = this.watches.get(id);
    if (!entry) return null;
    this.stopTimer(id);
    entry.state.status = 'stopped';
    this.broadcastAll();
    return this.getWatch(id);
  }

  stopTimer(id) {
    const timer = this.timers.get(id);
    if (timer) {
      timer.aborted = true;
      if (timer.timeout) clearTimeout(timer.timeout);
      this.timers.delete(id);
    }
  }

  broadcastAll() {
    this.broadcast({ type: 'watches', data: this.getAllWatches() });
  }

  broadcastEvent(watchId, type, data) {
    this.broadcast({ type, watchId, data, timestamp: Date.now() });
  }

  filterSlots(slots, watch) {
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

  async poll(id) {
    const entry = this.watches.get(id);
    if (!entry) return { slots: [] };

    const w = entry.config;
    const targetDate = w.targetDate || (w.dates && w.dates[0]);
    if (!targetDate) return { slots: [] };

    entry.state.pollCount++;
    entry.state.lastCheck = Date.now();

    const slots = await resy.checkAvailability({
      venueId: w.venueId,
      date: targetDate,
      partySize: w.partySize,
      timeRange: w.timeRange,
    });

    const filtered = this.filterSlots(slots, w);
    entry.state.slotsFound = filtered.length;

    this.broadcastEvent(id, 'poll', {
      pollCount: entry.state.pollCount,
      slotsFound: filtered.length,
      lastCheck: entry.state.lastCheck,
    });

    return { slots: filtered, targetDate };
  }

  async tryBook(id, slot) {
    const entry = this.watches.get(id);
    if (!entry) return false;

    if (!config.autoBook || !entry.config.autoBook) {
      log(`[${id}] Auto-book disabled, sending alert instead`);
      const targetDate = entry.config.targetDate || entry.config.dates?.[0];
      try { await sendSlotAlert(entry.config, [slot], targetDate); } catch (e) { /* ignore */ }
      return false;
    }

    const time = slot.date?.start?.split(' ')[1]?.substring(0, 5) || '??:??';
    log(`[${id}] Booking ${time} at ${entry.config.venueName}...`);

    await resy.autoBook(slot, entry.config.partySize);

    entry.state.status = 'booked';
    entry.state.bookedTime = time;
    entry.state.bookedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    log(`[${id}] BOOKED! ${entry.config.venueName} at ${time}`);
    this.broadcastEvent(id, 'booked', { time, seatType: slot.config?.type });
    this.broadcastAll();

    const targetDate = entry.config.targetDate || entry.config.dates?.[0];
    try { await sendBookingConfirmation(entry.config, slot, targetDate); } catch (e) {
      log(`[${id}] Email failed: ${e.message}`);
    }

    return true;
  }

  async runMonitorLoop(id) {
    const timer = { aborted: false };
    this.timers.set(id, timer);

    const intervalMs = 60000; // 60s for monitor

    const tick = async () => {
      if (timer.aborted) return;

      try {
        const { slots, targetDate } = await this.poll(id);
        const seen = this.seenSlots.get(id) || new Set();
        const newSlots = slots.filter((s) => {
          const token = s.config?.token;
          if (!token || seen.has(token)) return false;
          seen.add(token);
          return true;
        });

        if (newSlots.length > 0) {
          log(`[${id}] ${newSlots.length} new slot(s) found`);
          this.broadcastEvent(id, 'slot_found', { count: newSlots.length });
          await this.tryBook(id, newSlots[0]);
        }
      } catch (err) {
        log(`[${id}] Monitor error: ${err.message}`);
        this.broadcastEvent(id, 'error', { message: err.message });
      }

      if (!timer.aborted) {
        timer.timeout = setTimeout(tick, intervalMs);
      }
    };

    tick();
  }

  async runCancellationLoop(id) {
    const timer = { aborted: false };
    this.timers.set(id, timer);
    const entry = this.watches.get(id);
    const intervalMs = entry.config.pollIntervalMs || 3000;

    const tick = async () => {
      if (timer.aborted) return;

      try {
        const { slots } = await this.poll(id);
        if (slots.length > 0) {
          const booked = await this.tryBook(id, slots[0]);
          if (booked) {
            this.stopTimer(id);
            return;
          }
        }
      } catch (err) {
        if ((entry.state.pollCount % 10) === 1) {
          log(`[${id}] Cancellation poll error: ${err.message}`);
        }
      }

      // Check if target date passed
      const targetDate = entry.config.targetDate;
      if (targetDate && targetDate < new Date().toISOString().split('T')[0]) {
        log(`[${id}] Target date passed — stopping`);
        entry.state.status = 'stopped';
        this.broadcastAll();
        return;
      }

      if (!timer.aborted) {
        const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
        timer.timeout = setTimeout(tick, intervalMs + jitter);
      }
    };

    tick();
  }

  async runReleaseSnipe(id) {
    const timer = { aborted: false };
    this.timers.set(id, timer);
    const entry = this.watches.get(id);
    const releaseTime = new Date(entry.config.releaseTime);
    const startAt = releaseTime.getTime() - 5000;
    const deadline = releaseTime.getTime() + 120000;
    const intervalMs = entry.config.pollIntervalMs || 500;

    const waitMs = startAt - Date.now();
    if (waitMs > 0) {
      log(`[${id}] Waiting ${Math.round(waitMs / 1000)}s until release snipe starts`);
      await new Promise((resolve) => {
        timer.timeout = setTimeout(resolve, waitMs);
      });
    }

    if (timer.aborted) return;
    entry.state.status = 'polling';
    this.broadcastAll();
    log(`[${id}] Release snipe active — polling every ${intervalMs}ms`);

    const tick = async () => {
      if (timer.aborted || Date.now() > deadline) {
        if (!timer.aborted) {
          log(`[${id}] Release snipe timed out`);
          entry.state.status = 'failed';
          entry.state.error = 'Timed out after 2 minutes';
          this.broadcastAll();
        }
        return;
      }

      try {
        const { slots } = await this.poll(id);
        if (slots.length > 0) {
          const booked = await this.tryBook(id, slots[0]);
          if (booked) {
            this.stopTimer(id);
            return;
          }
        }
      } catch (err) {
        if ((entry.state.pollCount % 10) === 1) {
          log(`[${id}] Release poll error: ${err.message}`);
        }
      }

      if (!timer.aborted) {
        const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
        timer.timeout = setTimeout(tick, intervalMs + jitter);
      }
    };

    tick();
  }

  startAll() {
    for (const [id, entry] of this.watches) {
      if (entry.config.enabled) {
        this.startWatch(id);
      }
    }
  }
}

module.exports = WatchManager;
