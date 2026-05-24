/**
 * Tiny Express status API — exposes bridge state to the React dashboard.
 * Listens on BRIDGE_API_PORT (default 3001).
 * CORS is open so the local React app can reach it.
 */

const http = require('http');
const store = require('./store');
const logger = require('./logger');

const PORT = parseInt(process.env.BRIDGE_API_PORT || '3001', 10);

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, { error: 'Method not allowed' }, 405);
    return;
  }

  const url = req.url.split('?')[0];

  if (url === '/api/status') {
    const stats = store.getStats();
    json(res, {
      ok: true,
      lastChangeId: store.getLastChangeId(),
      uploaded: stats.uploaded,
      failed: stats.failed,
      recent: stats.recent,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (url === '/api/ping') {
    json(res, { ok: true, version: '1.0.0', timestamp: new Date().toISOString() });
    return;
  }

  json(res, { error: 'Not found' }, 404);
});

function startApi() {
  server.listen(PORT, '127.0.0.1', () => {
    logger.info(`[API] Status dashboard API running at http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    logger.warn(`[API] Could not start status API: ${err.message}`);
  });
}

module.exports = { startApi };
