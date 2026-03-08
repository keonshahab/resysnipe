require('dotenv').config();
const express = require('express');
const path = require('path');
const WatchManager = require('./manager');
const { router: eventsRouter, broadcast } = require('./api/events');
const { router: watchesRouter, setManager } = require('./api/watches');
const searchRouter = require('./api/search');
const venueRouter = require('./api/venue');
const availabilityRouter = require('./api/availability');
const hitlistRouter = require('./api/hitlist');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/search', searchRouter);
app.use('/api/venue', venueRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/hitlist', hitlistRouter);
app.use('/api/watches', watchesRouter);
app.use('/api/events', eventsRouter);

// SPA fallback (skip /api paths)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize watch manager
const manager = new WatchManager(broadcast);
setManager(manager);
manager.loadFromDisk();

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] ResySnipe dashboard running at http://localhost:${PORT}`);
  // Start all enabled watches
  manager.startAll();
});
