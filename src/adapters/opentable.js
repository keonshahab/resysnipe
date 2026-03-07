const log = (msg) => console.log(`[${new Date().toISOString()}] [opentable] ${msg}`);

async function checkAvailability({ venueId, date, partySize, timeRange }) {
  log('OpenTable adapter not yet implemented — returning empty results');
  return [];
}

async function getVenueInfo(venueId) {
  log('OpenTable adapter not yet implemented');
  return null;
}

module.exports = {
  name: 'opentable',
  checkAvailability,
  getVenueInfo,
};
