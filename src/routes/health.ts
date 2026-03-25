import { Router, Request, Response } from 'express';
import { checkHealth as checkEA } from '../services/ea-api.js';
import { checkHealth as checkBluesky } from '../services/bluesky.js';
import { checkOpenMeteoHealth } from '../services/open-meteo.js';
import { getCacheStats } from '../services/cache.js';
import { isDatasetsReady } from '../services/datasets.js';

const router = Router();

/** GET /api/health — system health with data source connectivity */
router.get('/', async (_req: Request, res: Response) => {
  const [eaOk, bskyOk, meteoOk] = await Promise.all([checkEA(), checkBluesky(), checkOpenMeteoHealth()]);

  const allOk = eaOk && bskyOk && meteoOk;
  const status = allOk ? 'healthy' : 'degraded';

  res.json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      environmentAgency: eaOk ? 'ok' : 'unreachable',
      bluesky: bskyOk ? 'ok' : 'unreachable',
      openMeteo: meteoOk ? 'ok' : 'unreachable',
    },
    datasetsReady: isDatasetsReady(),
    cache: getCacheStats(),
  });
});

export default router;
