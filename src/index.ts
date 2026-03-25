import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pinoHttp from 'pino-http';

import floodsRouter from './routes/floods.js';
import stationsRouter from './routes/stations.js';
import floodAreasRouter from './routes/flood-areas.js';
import socialRouter from './routes/social.js';
import healthRouter from './routes/health.js';
import weatherRouter from './routes/weather.js';
import featuresRouter from './routes/features.js';
import nrfaRouter from './routes/nrfa.js';
import chatRouter from './routes/chat.js';
import agentsRouter from './routes/agents.js';
import proactiveRouter from './routes/proactive.js';
import reportRouter from './routes/report.js';
import metofficeRouter from './routes/metoffice.js';
import cdsRouter from './routes/cds.js';
import osRouter from './routes/os.js';
import datasetsRouter from './routes/datasets.js';
import llfaRouter from './routes/llfa.js';
import tilesRouter from './routes/tiles.js';
import imdRouter from './routes/imd.js';
import stormOverflowsRouter from './routes/storm-overflows.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Passenger sets PORT as a string (could be a socket path on some configs).
// Convert only if it looks numeric; otherwise pass through for socket binding.
const rawPort = process.env.PORT;
const PORT: string | number = rawPort && /^\d+$/.test(rawPort) ? Number(rawPort) : rawPort || 3000;

// --- Request logging ---
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/favicon.ico' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} ${res.statusCode} (${Math.round(responseTime)}ms)`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req: () => undefined,
    res: () => undefined,
  },
}));

// --- Security & middleware ---
app.use(helmet({
  contentSecurityPolicy: false, // Allow MapTiler tiles, ArcGIS WMS etc.
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
    'https://floodmas.lsattachiris.com',
    /\.floodmas\.lsattachiris\.com$/,
  ],
}));
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json());

// --- Serve server's own static assets (favicon etc.) ---
app.use(express.static(join(__dirname, '../public')));

// --- API routes ---
app.use('/api/health', healthRouter);
app.use('/api/floods', floodsRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/flood-areas', floodAreasRouter);
app.use('/api/social', socialRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/features', featuresRouter);
app.use('/api/nrfa', nrfaRouter);
app.use('/api/chat', chatRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/proactive', proactiveRouter);
app.use('/api/report', reportRouter);
app.use('/api/metoffice', metofficeRouter);
app.use('/api/cds', cdsRouter);
app.use('/api/os', osRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/llfa', llfaRouter);
app.use('/api/tiles', tilesRouter);
app.use('/api/imd', imdRouter);
app.use('/api/storm-overflows', stormOverflowsRouter);

// --- Serve static client build (only when client/dist exists, e.g. monorepo) ---
const clientDist = join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
} else {
  // Standalone API server — return info on root
  app.get('/', (_req, res) => {
    res.json({
      name: 'FloodMAS API',
      version: '1.0.0',
      status: 'running',
      docs: '/api/health',
    });
  });
}

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `🌊 FloodMAS server running on port/socket ${PORT}`);

  // Defer ALL heavy work (datasets, ML models) to give Passenger time to
  // complete its handshake. 2 s is enough for Passenger to verify the
  // process is alive; only then do we start loading heavy files.
  setTimeout(async () => {
    try {
      // Dynamic-import heavy services so proj4/xlsx load lazily
      const { initDatasets } = await import('./services/datasets.js');
      const { initLLFA } = await import('./services/llfa.js');
      const { initStormOverflows } = await import('./services/storm-overflows.js');

      await initDatasets();
      initLLFA();
      initStormOverflows();
    } catch (err) {
      logger.error({ err }, 'Dataset loading failed');
    }

    try {
      // Dynamic-import TensorFlow.js models (heaviest dependency)
      const { loadForecastingModel } = await import('./ml/forecasting/model.js');
      const { loadRiskModel } = await import('./ml/risk/model.js');

      const [forecastOk, riskOk] = await Promise.allSettled([
        loadForecastingModel(),
        loadRiskModel(),
      ]);
      logger.info({
        forecasting: forecastOk.status === 'fulfilled' && forecastOk.value ? 'loaded' : 'heuristic-fallback',
        risk: riskOk.status === 'fulfilled' && riskOk.value ? 'loaded' : 'heuristic-fallback',
      }, '🧠 ML models initialised');
    } catch (err) {
      logger.warn({ err }, 'ML model loading failed — tools will use heuristic fallbacks');
    }
  }, 2000);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error({ port: PORT }, `❌ Port ${PORT} is already in use. Retrying in 1 s...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 1000);
  } else {
    throw err;
  }
});

// --- Graceful shutdown ---
function shutdown(signal: string) {
  logger.info({ signal }, `🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('✅ Server closed.');
    process.exit(0);
  });
  // Force exit after 5 s if connections don't drain
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
