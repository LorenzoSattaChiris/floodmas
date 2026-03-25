import { Router, Request, Response } from 'express';
import {
  getMetOfficeForecastGrid,
  checkMetOfficeHealth,
  getAtmosphericOrders,
  getAtmosphericOrderFiles,
  getAtmosphericRuns,
} from '../services/metoffice.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/metoffice/forecast — Met Office Site-Specific hourly forecast grid */
router.get('/forecast', async (_req: Request, res: Response) => {
  try {
    const data = await getMetOfficeForecastGrid();
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Met Office forecast');
    res.status(502).json({ error: 'Failed to fetch Met Office forecast data' });
  }
});

/** GET /api/metoffice/health — check API key availability */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const status = await checkMetOfficeHealth();
    res.json(status);
  } catch (err) {
    logger.error({ err }, 'Met Office health check failed');
    res.status(500).json({ error: 'Health check failed' });
  }
});

// ─── Atmospheric Models (NWP) ────────────────────────────────────────

/** GET /api/metoffice/atmospheric/orders — list configured atmospheric data orders */
router.get('/atmospheric/orders', async (_req: Request, res: Response) => {
  try {
    const data = await getAtmosphericOrders();
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch atmospheric orders');
    res.status(502).json({ error: 'Failed to fetch atmospheric model orders' });
  }
});

/** GET /api/metoffice/atmospheric/orders/:orderId/files — list files for an order */
router.get('/atmospheric/orders/:orderId/files', async (req: Request, res: Response) => {
  try {
    const data = await getAtmosphericOrderFiles(req.params.orderId as string);
    res.json(data);
  } catch (err) {
    logger.error({ err, orderId: req.params.orderId }, 'Failed to fetch order files');
    res.status(502).json({ error: 'Failed to fetch atmospheric order files' });
  }
});

/** GET /api/metoffice/atmospheric/runs — list available NWP model runs */
router.get('/atmospheric/runs', async (_req: Request, res: Response) => {
  try {
    const data = await getAtmosphericRuns();
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch atmospheric runs');
    res.status(502).json({ error: 'Failed to fetch atmospheric model runs' });
  }
});

/** GET /api/metoffice/atmospheric/runs/:modelId — runs for a specific model */
router.get('/atmospheric/runs/:modelId', async (req: Request, res: Response) => {
  try {
    const data = await getAtmosphericRuns(req.params.modelId as string);
    res.json(data);
  } catch (err) {
    logger.error({ err, modelId: req.params.modelId }, 'Failed to fetch model runs');
    res.status(502).json({ error: 'Failed to fetch model runs' });
  }
});

export default router;
