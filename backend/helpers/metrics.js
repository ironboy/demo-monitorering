import client from 'prom-client';

// --- Registry + default metrics ---
const register = new client.Registry();
register.setDefaultLabels({ app: 'demo-monitorering' });
client.collectDefaultMetrics({ register });

// --- HTTP metrics ---

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const activeRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of in-flight HTTP requests',
  registers: [register],
});

// --- Domain-specific metrics ---

const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

const loginAttempts = new client.Counter({
  name: 'login_attempts_total',
  help: 'Total number of login attempts',
  labelNames: ['success'],
  registers: [register],
});

const aclDenials = new client.Counter({
  name: 'acl_denials_total',
  help: 'Total number of ACL access denials',
  registers: [register],
});

export {
  register,
  httpRequestCounter,
  httpRequestDuration,
  activeRequests,
  dbQueryDuration,
  loginAttempts,
  aclDenials,
};
