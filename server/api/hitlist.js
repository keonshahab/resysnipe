const express = require('express');
const axios = require('axios');
const config = require('../../src/config');
const router = express.Router();

const BASE_URL = 'https://api.resy.com';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const PAGE_DELAY_MS = 2000;
const LETTER_DELAY_MS = 2000;
const PER_PAGE = 20;
const MAX_RETRIES = 2;
const API_TIMEOUT_MS = 5000;

const log = (msg) => console.log(`[${new Date().toISOString()}] [hitlist] ${msg}`);

// Hardcoded fallback when API is rate-limited
const FALLBACK_FAVORITES = [
  { id: 83681, name: "Bridges", neighborhood: "Chinatown", cuisine: ["French"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/83681/cf33acce7d9aa1040c18dc00f6ac28683a857f69/jpg/640x360" },
  { id: 1385, name: "Cervo's", neighborhood: "Lower East Side", cuisine: ["Seafood"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/1385/02287b7f01793a7cc0a9f2ade6c26011006b1268/jpg/640x360" },
  { id: 60381, name: "Le Dive", neighborhood: "Lower East Side", cuisine: ["French"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/60381/2d0e47b9eb4b6186f7df8aad4757f5fa2ef90418/jpg/640x360" },
  { id: 82951, name: "Eel Bar", neighborhood: "Lower East Side", cuisine: ["Basque"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/82951/dd5d445ed695053b60abf25648c1df78e60bfcfe/jpg/640x360" },
  { id: 76553, name: "Tigre", neighborhood: "Lower East Side", cuisine: ["Cocktail Bar"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/76553/3a637b3ac889796cdbd38d50480ebe4fb88649d6/jpg/640x360" },
  { id: 693, name: "Fish Cheeks NoHo", neighborhood: "Bowery", cuisine: ["Thai"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/693/9a1eedaeca5e483d7395bc7b65c97e690994c9ff/jpg/640x360" },
  { id: 69010, name: "Jac's on Bond", neighborhood: "NoHo", cuisine: ["Cocktail Bar"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/69010/29f932d5a5f0b0ec65a9129fca0989aa5e5fa401/jpg/640x360" },
  { id: 7490, name: "The Nines", neighborhood: "NoHo", cuisine: ["Contemporary American"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/7490/067b95cf0a9955859e69fa45e314039c7203f173/jpg/640x360" },
  { id: 74741, name: "Sip & Guzzle", neighborhood: "West Village", cuisine: ["Japanese"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/74741/a253bc48bad09ba77bc6265ceb38d397f193d284/jpg/640x360" },
  { id: 25973, name: "L'Artusi", neighborhood: "West Village", cuisine: ["Italian"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/25973/e8b7ae06cba2ff045741083ca3007c3135a0749b/jpg/640x360" },
  { id: 53199, name: "Bobo NYC", neighborhood: "West Village", cuisine: ["French"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/53199/daf433a10aff25f3e9ca46efae622fb0c994662d/jpg/640x360" },
  { id: 79460, name: "Penny", neighborhood: "East Village", cuisine: ["Seafood"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/79460/3092f0f23bbe5a7678d436f1467021fe397dfb4d/jpg/640x360" },
  { id: 62659, name: "Claud", neighborhood: "East Village", cuisine: ["European"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/62659/734f243f7d031d8e7945e14841965d7217a92536/jpg/640x360" },
  { id: 65348, name: "Rosella", neighborhood: "East Village", cuisine: ["Sushi"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/65348/e303a88136c41e58074d755afffd3f5ae0d56b6c/jpg/640x360" },
  { id: 73418, name: "Bangkok Supper Club", neighborhood: "Meatpacking District", cuisine: ["Thai"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/73418/8c065ec2064dd8ce7b717560e6941c2dcd1ae076/jpg/640x360" },
  { id: 5771, name: "Rezdora", neighborhood: "Flatiron District", cuisine: ["Italian"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/5771/37722806c2c6fb7e4a57796aa01d1569acde24ca/jpg/640x360" },
  { id: 49453, name: "Thai Diner", neighborhood: "Nolita", cuisine: ["Thai"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/49453/b006624b53bb20e668d68de15e04c7296910adf2/jpg/640x360" },
  { id: 2026, name: "Raku Soho", neighborhood: "SoHo", cuisine: ["Japanese"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/2026/6d34399244b7422e911ee9246379f4c593fbb730/jpg/640x360" },
  { id: 1543, name: "Jeju Noodle Bar", neighborhood: "West Village", cuisine: ["Korean"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/1543/8e02609bdb5ccbd19ca5eb631db57ba5eb65c068/jpg/640x360" },
  { id: 834, name: "4 Charles Prime Rib", neighborhood: "West Village", cuisine: ["Steakhouse"], priceRange: 0, rating: 0, isGDA: false, image: "https://image.resy.com/3/003/2/834/placeholder/jpg/640x360" },
];

// Cache is initialized empty — always fresh on server restart
let cache = { data: null, timestamp: 0 };
// Persistent image cache (survives hitlist cache clears)
const imageCache = new Map();
let enrichmentRunning = false;

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

function mapHit(h) {
  const rating = h.rating?.average || h.rating || 0;
  return {
    id: h.id?.resy || h.id,
    name: (h.name || '').replace(/<\/?b>/g, ''),
    neighborhood: h.neighborhood || '',
    cuisine: h.cuisine || [],
    priceRange: h.price_range_id || h.price_range || 0,
    rating: typeof rating === 'number' ? Math.round(rating * 10) / 10 : 0,
    isGDA: h.is_global_dining_access || false,
    image: (h.images || [])[0] || null,
  };
}

async function searchQuery(query, perPage = PER_PAGE, page = 0) {
  const today = new Date().toISOString().split('T')[0];
  const res = await axios.post(
    `${BASE_URL}/3/venuesearch/search`,
    {
      geo: { latitude: 40.7359, longitude: -73.9904 },
      highlight: { pre_tag: '', post_tag: '' },
      per_page: perPage,
      page,
      query,
      slot_filter: { day: today, party_size: 2 },
      types: ['venue', 'cuisine'],
    },
    { headers: getHeaders(), timeout: API_TIMEOUT_MS }
  );
  return res.data?.search || {};
}

function collectFavorites(hits, seen, favorites) {
  for (const h of hits || []) {
    if (!h.favorite) continue;
    const id = h.id?.resy || h.id;
    if (seen.has(id)) continue;
    seen.add(id);
    favorites.push(mapHit(h));
  }
}

// Paginate through all results of a broad query
async function paginatedScan() {
  const seen = new Set();
  const favorites = [];

  let totalPages = 1;
  for (let page = 0; page < totalPages; page++) {
    let search = null;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        search = await searchQuery('new york', PER_PAGE, page);
        break;
      } catch {
        if (retry < MAX_RETRIES - 1) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!search) { log(`page ${page} failed — aborting scan`); break; }

    if (page === 0) {
      totalPages = search.nbPages || 1;
      log(`Scanning ${totalPages} pages (${search.nbHits} venues)...`);
    }

    collectFavorites(search.hits, seen, favorites);

    if (page < totalPages - 1) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  log(`Paginated scan: ${favorites.length} favorites across ${totalPages} pages`);
  return favorites;
}

// Fallback: sequential single-letter queries
async function letterScan() {
  const queries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                    'n', 'o', 'p', 'r', 's', 't', 'u', 'v', 'w', 'y', 'z'];
  const seen = new Set();
  const favorites = [];

  for (const q of queries) {
    try {
      const search = await searchQuery(q, 50);
      collectFavorites(search.hits, seen, favorites);
    } catch { /* skip */ }
    await new Promise((r) => setTimeout(r, LETTER_DELAY_MS));
  }

  log(`Letter scan: ${favorites.length} favorites from ${queries.length} queries`);
  return favorites;
}

async function fetchHitlist() {
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  // Try paginated scan first; fall back to letter scan on failure
  let favorites;
  try {
    favorites = await paginatedScan();
  } catch (e) {
    log(`Paginated scan failed (${e.message}), falling back to letter scan`);
    favorites = [];
  }

  if (favorites.length === 0) {
    try {
      favorites = await letterScan();
    } catch (e) {
      log(`Letter scan also failed: ${e.message}`);
      favorites = [];
    }
  }

  // Only cache if we actually found favorites
  if (favorites.length > 0) {
    cache = { data: favorites, timestamp: Date.now() };
  } else {
    log('No favorites found from API — using hardcoded fallback');
    favorites = FALLBACK_FAVORITES;
  }
  return favorites;
}

// Enrich fallback venues with images by searching Resy (runs in background)
async function enrichFallbackImages() {
  if (enrichmentRunning) return;
  const needsImage = FALLBACK_FAVORITES.filter((f) => !imageCache.has(f.id));
  if (needsImage.length === 0) return;

  enrichmentRunning = true;
  log(`Enriching images for ${needsImage.length} fallback venues...`);

  for (const venue of needsImage) {
    try {
      const search = await searchQuery(venue.name, 5);
      const hit = (search.hits || []).find((h) => (h.id?.resy || h.id) === venue.id);
      if (hit && hit.images?.length > 0) {
        imageCache.set(venue.id, hit.images[0]);
      }
    } catch { /* rate limited, skip rest */ break; }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const found = needsImage.filter((f) => imageCache.has(f.id)).length;
  log(`Image enrichment done: ${found}/${needsImage.length} images found`);
  enrichmentRunning = false;
}

function applyImageCache(favorites) {
  return favorites.map((f) => {
    if (f.image) return f;
    const cached = imageCache.get(f.id);
    return cached ? { ...f, image: cached } : f;
  });
}

router.get('/', async (req, res) => {
  try {
    // Race the full scan against a 5s timeout — return fallback if it hangs
    const timeout = new Promise((resolve) => {
      setTimeout(() => {
        log('Hitlist fetch timed out — returning fallback');
        resolve(FALLBACK_FAVORITES);
      }, API_TIMEOUT_MS);
    });
    const results = await Promise.race([fetchHitlist(), timeout]);
    const enriched = applyImageCache(results);
    res.json(enriched);
    // Kick off background image enrichment if any are missing
    if (enriched.some((f) => !f.image)) enrichFallbackImages().catch(() => {});
  } catch (err) {
    console.error('Hitlist error:', err.response?.status, err.response?.data || err.message);
    res.json(applyImageCache(FALLBACK_FAVORITES));
    enrichFallbackImages().catch(() => {});
  }
});

module.exports = router;
