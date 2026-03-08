const express = require('express');
const router = express.Router();

// Connected SSE clients
const clients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

router.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  clients.add(res);

  // Keep-alive every 15s
  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 15000);

  req.on('close', () => {
    clients.delete(res);
    clearInterval(keepAlive);
  });
});

module.exports = { router, broadcast };
