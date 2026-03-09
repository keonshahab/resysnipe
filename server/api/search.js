const express = require('express');
const axios = require('axios');
const config = require('../../src/config');
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
    'content-type': 'application/json',
  };
}

router.get('/', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json([]);

  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.post(
      `${BASE_URL}/3/venuesearch/search`,
      {
        geo: { latitude: 40.7359, longitude: -73.9904 },
        highlight: { pre_tag: '<b>', post_tag: '</b>' },
        per_page: 5,
        query: q,
        slot_filter: { day: today, party_size: 2 },
        types: ['venue', 'cuisine'],
      },
      { headers: getHeaders() }
    );

    const hits = response.data?.search?.hits || [];
    const results = hits.map((h) => ({
      id: h.id?.resy || h.id,
      name: (h.name || '').replace(/<\/?b>/g, ''),
      neighborhood: h.neighborhood || '',
      cuisine: h.cuisine || [],
      priceRange: h.price_range_id || h.price_range || 0,
      rating: Math.round(((h.rating?.average || h.rating || 0) + Number.EPSILON) * 10) / 10,
      isGDA: h.is_global_dining_access || false,
      urlSlug: h.url_slug || '',
      images: h.images || [],
    }));

    res.json(results);
  } catch (err) {
    console.error('Search error:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
