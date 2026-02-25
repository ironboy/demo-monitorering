import express from 'express';
import PathFinder from '../helpers/PathFinder.js';
import {
  register,
  httpRequestCounter,
  httpRequestDuration,
  activeRequests,
} from '../helpers/metrics.js';
const settings = PathFinder.requireJson('../settings.json');

// check dbType from settings
globalThis.isSQLite = settings.dbType === 'SQLite';
globalThis.isMySQL = settings.dbType === 'MySQL';
globalThis.isSQL = isSQLite || isMySQL;
globalThis.isMongoDB = settings.dbType === 'MongoDB';
if (!isSQLite && !isMySQL && !isMongoDB) {
  throw new Error('Valid dbType not specified');
}

// import the correct version of the rest API
const RestApi =
  (await import(isSQL ? './RestAPiSQL.js' : './RestApiMongoDB.js')).default;

export default class Server {

  settings = settings;

  constructor(app) {
    this.startServer(app);
  }

  startServer(app) {
    // Start an Express server/app
    const { port } = this.settings;
    this.app = app || express();
    !app && this.app.listen(port, () => console.log(
      'Server listening on http://localhost:' + port
    ));
    // Prometheus metrics endpoint
    this.app.get('/metrics', async (_req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });
    // Metrics middleware — track request count, duration and active requests
    this.app.use((req, res, next) => {
      if (req.path === '/metrics') return next();
      activeRequests.inc();
      const end = httpRequestDuration.startTimer();
      res.on('finish', () => {
        activeRequests.dec();
        const route = req.route?.path
          || this.normalizeRoute(req.path);
        const labels = {
          method: req.method,
          route,
          status_code: res.statusCode,
        };
        httpRequestCounter.inc(labels);
        end(labels);
      });
      next();
    });
    // Add language depedent REST-handling
    this.app.use((req, _res, next) => {
      const match = req.url.match(/^\/api\/([a-z]{2})(\/.*)/);
      match && (req.lang = match[1]) && (req.url = '/api' + match[2]);
      req.lang = req.lang || 'en';
      next();
    });
    // Add rest routes
    new RestApi(this.app, this.settings);
    // Add static folder to serve
    !app && this.addStaticFolder();
  }

  // Group static file paths to avoid high-cardinality metric labels
  normalizeRoute(path) {
    if (path.match(/\.(js|css|map)$/)) return '/static/scripts';
    if (path.match(/\.(png|jpg|gif|svg|ico)$/)) return '/static/images';
    if (path.match(/\.(woff2?|ttf|eot)$/)) return '/static/fonts';
    if (path.match(/\.html?$/)) return '/static/html';
    if (path.startsWith('/assets/')) return '/static/assets';
    return path;
  }

  // serve html, js, css, images etc from a static folder
  addStaticFolder() {
    const folder = PathFinder.relToAbs(this.settings.staticFolder);
    this.app.use(express.static(folder));
    // SPA fallback: serve index.html on 404 for client-side routing
    this.app.use((_req, res) => {
      res.sendFile(folder + '/index.html');
    });
  }

}