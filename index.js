const poller = require('./src/poller');

console.log(`[${new Date().toISOString()}] ResySnipe starting...`);
poller.start();
