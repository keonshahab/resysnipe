const express = require('express');
const resy = require('../../src/adapters/resy');
const router = express.Router();

router.get('/:venueId', async (req, res) => {
  const venueId = parseInt(req.params.venueId, 10);
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const partySize = parseInt(req.query.party_size, 10) || 2;

  if (!venueId) return res.status(400).json({ error: 'Invalid venueId' });

  try {
    const slots = await resy.checkAvailability({ venueId, date, partySize });
    res.json({ count: slots.length, slots });
  } catch (err) {
    console.error('Availability error:', err.message);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

module.exports = router;
