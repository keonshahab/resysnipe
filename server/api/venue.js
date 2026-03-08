const express = require('express');
const resy = require('../../src/adapters/resy');
const { parseReleasePolicy } = require('../../src/mode-detector');
const router = express.Router();

router.get('/:venueId', async (req, res) => {
  const venueId = parseInt(req.params.venueId, 10);
  if (!venueId) return res.status(400).json({ error: 'Invalid venueId' });

  try {
    const [venueInfo, needToKnow] = await Promise.all([
      resy.getVenueInfo(venueId).catch(() => null),
      resy.getVenueNeedToKnow(venueId).catch(() => null),
    ]);

    const releasePolicy = parseReleasePolicy(needToKnow);

    res.json({
      venue: venueInfo,
      needToKnow,
      releasePolicy,
    });
  } catch (err) {
    console.error('Venue info error:', err.message);
    res.status(500).json({ error: 'Failed to fetch venue info' });
  }
});

module.exports = router;
