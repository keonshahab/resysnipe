const express = require('express');
const axios = require('axios');
const config = require('../../src/config');
const router = express.Router();

const BASE_URL = 'https://api.resy.com';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const QUERIES = ['a', 'e', 'the', 'bar', 'la', 'le', 'st', 'c', 'r', 'b'];

const log = (msg) => console.log(`[${new Date().toISOString()}] [hitlist] ${msg}`);

let cache = { data: null, timestamp: 0 };

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

async function searchPage(query, perPage = 20) {
  const today = new Date().toISOString().split('T')[0];
  const response = await axios.post(
    `${BASE_URL}/3/venuesearch/search`,
    {
      geo: { latitude: 40.7359, longitude: -73.9904 },
      highlight: { pre_tag: '', post_tag: '' },
      per_page: perPage,
      query,
      slot_filter: { day: today, party_size: 2 },
      types: ['venue', 'cuisine'],
    },
    { headers: getHeaders() }
  );

  const hits = response.data?.search?.hits || [];
  log(`query="${query}" returned ${hits.length} hits, ${hits.filter((h) => h.favorite).length} favorites`);
  return hits;
}

async function fetchHitlist() {
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const seen = new Set();
  const favorites = [];

  // Fan out multiple queries to find favorites across the catalog
  const allHits = await Promise.all(
    QUERIES.map((q) => searchPage(q).catch(() => []))
  );

  for (const hits of allHits) {
    for (const h of hits) {
      if (!h.favorite) continue;
      const id = h.id?.resy || h.id;
      if (seen.has(id)) continue;
      seen.add(id);
      favorites.push({
        id,
        name: (h.name || '').replace(/<\/?b>/g, ''),
        neighborhood: h.neighborhood || '',
        cuisine: h.cuisine || [],
        priceRange: h.price_range_id || h.price_range || 0,
        rating: h.rating || 0,
        isGDA: h.is_global_dining_access || false,
        image: (h.images || [])[0] || null,
      });
    }
  }

  log(`Found ${favorites.length} unique favorites from ${QUERIES.length} queries`);
  cache = { data: favorites, timestamp: Date.now() };
  return favorites;
}

router.get('/', async (req, res) => {
  try {
    const results = await fetchHitlist();
    res.json(results);
  } catch (err) {
    console.error('Hitlist error:', err.response?.status, err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch hitlist' });
  }
});

module.exports = router;
