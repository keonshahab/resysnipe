const express = require('express');
const axios = require('axios');
const config = require('../../src/config');
const { parseReleasePolicy } = require('../../src/mode-detector');
const router = express.Router();

const BASE_URL = 'https://api.resy.com';

function getHeaders() {
  return {
    authorization: `ResyAPI api_key="${config.resy.apiKey}"`,
    'x-resy-auth-token': config.resy.authToken,
    'x-resy-universal-auth': config.resy.authToken,
    origin: 'https://resy.com',
    referer: 'https://resy.com/',
    accept: 'application/json, text/plain, */*',
    'cache-control': 'no-cache',
  };
}

router.get('/:venueId', async (req, res) => {
  const venueId = parseInt(req.params.venueId, 10);
  if (!venueId) return res.status(400).json({ error: 'Invalid venueId' });

  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 5000));
    const fetch = axios.get(`${BASE_URL}/3/venue`, {
      headers: getHeaders(),
      params: { id: venueId },
      timeout: 5000,
    });

    const result = await Promise.race([fetch, timeout]);
    if (result === 'TIMEOUT') {
      return res.json({ venue: null, needToKnow: null, releasePolicy: null });
    }

    const data = result.data || {};

    // need_to_know is in the content array as an item with name: 'need_to_know'
    let needToKnow = null;
    if (Array.isArray(data.content)) {
      const ntk = data.content.find((c) => c.name === 'need_to_know');
      needToKnow = ntk?.body || null;
    }
    // Fallback to top-level fields
    if (!needToKnow) {
      needToKnow = data.need_to_know || null;
    }

    const releasePolicy = parseReleasePolicy(needToKnow);

    res.json({
      venue: data,
      needToKnow,
      releasePolicy,
    });
  } catch (err) {
    console.error('Venue info error:', err.message);
    res.json({ venue: null, needToKnow: null, releasePolicy: null });
  }
});

module.exports = router;
