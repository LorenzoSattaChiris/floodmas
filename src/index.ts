import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import floodsRouter from './routes/floods.js';
import stationsRouter from './routes/stations.js';
import floodAreasRouter from './routes/flood-areas.js';
import socialRouter from './routes/social.js';
import healthRouter from './routes/health.js';
import weatherRouter from './routes/weather.js';
import featuresRouter from './routes/features.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
    /\.floodmas\.lsattachiris\.com$/,
  ],
}));
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// --- API routes ---
app.use('/api/health', healthRouter);
app.use('/api/floods', floodsRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/flood-areas', floodAreasRouter);
app.use('/api/social', socialRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/features', featuresRouter);

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
  console.log(`🌊 FloodMAS server running on http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Retrying in 1 s...`);
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
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
  // Force exit after 5 s if connections don't drain
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
