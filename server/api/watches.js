const express = require('express');
const router = express.Router();

// Manager is injected after creation
let manager;
function setManager(m) { manager = m; }

router.get('/', (req, res) => {
  res.json(manager.getAllWatches());
});

router.post('/', (req, res) => {
  try {
    const watch = manager.createWatch(req.body);
    res.status(201).json(watch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const removed = manager.deleteWatch(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Watch not found' });
  res.json({ ok: true });
});

router.post('/:id/start', (req, res) => {
  const watch = manager.startWatch(req.params.id);
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  res.json(watch);
});

router.post('/:id/stop', (req, res) => {
  const watch = manager.stopWatch(req.params.id);
  if (!watch) return res.status(404).json({ error: 'Watch not found' });
  res.json(watch);
});

module.exports = { router, setManager };
