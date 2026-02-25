// ============================================================
// Monitoring demo: Express + Prometheus (prom-client)
// ============================================================
// Run:   node server.mjs
// Test:  curl http://localhost:3000/
//        curl http://localhost:3000/slow
//        curl http://localhost:3000/error
//        curl http://localhost:3000/metrics
// ============================================================

import express from 'express';
import client from 'prom-client';

const app = express();
const PORT = 3000;

// --- 1. Prometheus registry + default metrics ---
const register = new client.Registry();
register.setDefaultLabels({ app: 'monitoring-demo' });
client.collectDefaultMetrics({ register });

// --- 2. Custom metrics ---

// Counter: total number of HTTP requests
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Histogram: response duration distribution
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Gauge: number of in-flight requests right now
const activeRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of in-flight HTTP requests',
  registers: [register],
});

// --- 3. Route normalization (avoid high cardinality) ---
//
// Without this you get one unique metric row per file path
// (/img/1.png, /img/2.png ...) which Prometheus dislikes.
// Set NORMALIZE_ROUTES = false to show the difference in a demo.

const NORMALIZE_ROUTES = true;

function normalizeRoute(req) {
  // Named Express routes give e.g. "/users/:id" automatically
  if (req.route?.path) return req.route.path;

  if (!NORMALIZE_ROUTES) return req.path;

  // Group static files by extension type
  const path = req.path;
  if (path.match(/\.(js|css|map)$/))         return '/static/scripts';
  if (path.match(/\.(png|jpg|gif|svg|ico)$/)) return '/static/images';
  if (path.match(/\.(woff2?|ttf|eot)$/))     return '/static/fonts';
  if (path.match(/\.(html?)$/))              return '/static/html';
  if (path.startsWith('/static/'))           return '/static/other';

  return path;
}

// --- 4. Metrics middleware ---

app.use((req, res, next) => {
  // Skip the metrics endpoint itself to avoid measuring scrapes
  if (req.path === '/metrics') return next();

  activeRequests.inc();
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    activeRequests.dec();
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status_code: res.statusCode,
    };
    httpRequestCounter.inc(labels);
    end(labels);
  });

  next();
});

// --- 5. Static files (to demonstrate grouping) ---
app.use(express.static('public'));

// --- 6. Application endpoints ---

app.get('/', (req, res) => {
  res.json({
    message: 'Monitoring demo is running.',
    endpoints: {
      '/':        'This info',
      '/slow':    'Simulates a slow request (0-2s)',
      '/error':   'Returns a server error (500)',
      '/metrics': 'Prometheus metrics',
    },
  });
});

app.get('/slow', async (req, res) => {
  const delay = Math.random() * 2000;
  await new Promise((resolve) => setTimeout(resolve, delay));
  res.json({ message: 'Slow request completed', delay_ms: Math.round(delay) });
});

app.get('/error', (req, res) => {
  res.status(500).json({ error: 'Something went wrong! (simulated)' });
});

// --- 7. Prometheus metrics endpoint ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// --- 8. Start ---
app.listen(PORT, () => {
  console.log(`Monitoring demo started on http://localhost:${PORT}`);
  console.log(`Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`Route normalization: ${NORMALIZE_ROUTES ? 'ON' : 'OFF'}`);
});