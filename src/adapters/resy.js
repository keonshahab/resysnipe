const axios = require('axios');
const config = require('../config');

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

async function fetchAllVenues({ date, partySize, locationId = 'ny' }) {
  const response = await axios.get(`${BASE_URL}/3/collection/venues`, {
    headers: getHeaders(),
    params: {
      location_id: locationId,
      collection_id: 14,
      day: date,
      party_size: partySize,
      limit: 100,
      offset: 1,
      finder: 4,
      isAuth: true,
    },
  });

  return response.data?.results?.venues || [];
}

async function checkAvailability({ venueId, date, partySize, timeRange, locationId }) {
  const venues = await fetchAllVenues({ date, partySize, locationId });

  // Filter to the specific venue by ID
  const matched = venues.filter((v) => v.venue?.id?.resy === venueId);

  let slots = [];

  for (const venue of matched) {
    if (!venue.slots) continue;
    for (const slot of venue.slots) {
      slots.push({
        ...slot,
        venueName: venue.venue?.name,
        urlSlug: venue.venue?.url_slug,
      });
    }
  }

  // Filter by time range if provided
  if (timeRange) {
    slots = slots.filter((slot) => {
      const time = slot.date?.start?.split(' ')[1];
      if (!time) return true;
      const hhmm = time.substring(0, 5);
      return hhmm >= timeRange.earliest && hhmm <= timeRange.latest;
    });
  }

  return slots;
}

async function getVenueInfo(venueId) {
  const venues = await fetchAllVenues({
    date: new Date().toISOString().split('T')[0],
    partySize: 2,
  });

  const match = venues.find((v) => v.venue?.id?.resy === venueId);
  return match?.venue || null;
}

async function getBookToken(slot, partySize) {
  const response = await axios.post(
    `${BASE_URL}/3/details`,
    {
      commit: 0,
      config_id: slot.config.token,
      day: slot.date.start.split(' ')[0],
      party_size: partySize,
    },
    { headers: { ...getHeaders(), 'content-type': 'application/json' } }
  );

  return response.data.book_token;
}

async function book(bookToken) {
  const response = await axios.post(
    `${BASE_URL}/3/book`,
    {
      book_token: bookToken,
      struct_payment_method: { id: config.resy.paymentMethodId },
      source_id: 'resy.com-venue-card',
      venue_marketing_opt_in: 0,
    },
    { headers: { ...getHeaders(), 'content-type': 'application/json' } }
  );

  return response;
}

async function autoBook(slot, partySize) {
  const bookToken = await getBookToken(slot, partySize);
  const result = await book(bookToken);
  return result;
}

module.exports = {
  name: 'resy',
  checkAvailability,
  getVenueInfo,
  autoBook,
};
