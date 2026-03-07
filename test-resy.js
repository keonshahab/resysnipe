require('dotenv').config();
const axios = require('axios');
const config = require('./src/config');

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const DATE = tomorrow.toISOString().split('T')[0];
const PARTY_SIZE = 2;
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

async function main() {
  console.log(`[${new Date().toISOString()}] Testing Resy API connectivity...`);
  console.log(`Endpoint: /3/collection/venues`);
  console.log(`Date: ${DATE}`);
  console.log(`Party size: ${PARTY_SIZE}`);
  console.log('---');

  try {
    const response = await axios.get(`${BASE_URL}/3/collection/venues`, {
      headers: getHeaders(),
      params: {
        location_id: 'ny',
        collection_id: 14,
        day: DATE,
        party_size: PARTY_SIZE,
        limit: 100,
        offset: 1,
        finder: 4,
        isAuth: true,
      },
    });

    const venues = response.data?.results?.venues || [];
    console.log(`Found ${venues.length} venue(s):\n`);

    for (const v of venues) {
      const name = v.venue?.name || 'unknown';
      const id = v.venue?.id?.resy || '?';
      const slotCount = v.slots?.length || 0;
      console.log(`  [${id}] ${name} — ${slotCount} slot(s)`);

      if (v.slots) {
        for (const slot of v.slots.slice(0, 3)) {
          const time = slot.date?.start?.split(' ')[1]?.substring(0, 5) || '??:??';
          const seatType = slot.config?.type || 'unknown';
          const gda = slot.is_global_dining_access ? ' [GDA]' : '';
          console.log(`      ${time} — ${seatType}${gda}`);
        }
        if (v.slots.length > 3) console.log(`      ... and ${v.slots.length - 3} more`);
      }
    }

    console.log('\nResy API connection successful!');
  } catch (err) {
    console.error('Resy API test failed:', err.response?.status, err.response?.data || err.message);
  }
}

main();
