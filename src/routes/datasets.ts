import { Router, Request, Response } from 'express';
import {
  getDefences,
  getSpend,
  getHomesBetterProtected,
  getPropertiesAtRisk,
  getFloodRiskAreas,
  getDatasetSummary,
  getPostcodeRisk,
  searchPostcodes,
  getPropertyRiskSummary,
  getWFDCatchments,
  getNFMHotspots,
  getSchools,
  getHospitals,
  getBathingWaters,
  getRamsar,
  getWaterCompanyBoundaries,
  getEDMOverflows,
  getWINEPOverflows,
} from '../services/datasets.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/datasets/summary — aggregate summary of all loaded datasets */
router.get('/summary', (_req: Request, res: Response) => {
  try {
    res.json(getDatasetSummary());
  } catch (err) {
    logger.error({ err }, 'Failed to get dataset summary');
    res.status(500).json({ error: 'Failed to get dataset summary' });
  }
});

/** GET /api/datasets/flood-risk-areas — Defra Flood Risk Areas GeoJSON (WGS84) */
router.get('/flood-risk-areas', async (_req: Request, res: Response) => {
  try {
    res.json(await getFloodRiskAreas());
  } catch (err) {
    logger.error({ err }, 'Failed to get flood risk areas');
    res.status(500).json({ error: 'Failed to get flood risk areas' });
  }
});

/** GET /api/datasets/defences?level=region|utla — flood defence statistics */
router.get('/defences', (req: Request, res: Response) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    res.json(getDefences(level));
  } catch (err) {
    logger.error({ err }, 'Failed to get defence statistics');
    res.status(500).json({ error: 'Failed to get defence statistics' });
  }
});

/** GET /api/datasets/spend?level=region|utla — flood spend statistics */
router.get('/spend', (req: Request, res: Response) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    res.json(getSpend(level));
  } catch (err) {
    logger.error({ err }, 'Failed to get spend statistics');
    res.status(500).json({ error: 'Failed to get spend statistics' });
  }
});

/** GET /api/datasets/homes-protected?level=region|utla — homes better protected */
router.get('/homes-protected', (req: Request, res: Response) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    res.json(getHomesBetterProtected(level));
  } catch (err) {
    logger.error({ err }, 'Failed to get homes protected data');
    res.status(500).json({ error: 'Failed to get homes protected data' });
  }
});

/** GET /api/datasets/properties-at-risk?level=constituency|ltla|utla — properties at flood risk */
router.get('/properties-at-risk', (req: Request, res: Response) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    res.json(getPropertiesAtRisk(level));
  } catch (err) {
    logger.error({ err }, 'Failed to get properties at risk data');
    res.status(500).json({ error: 'Failed to get properties at risk data' });
  }
});

/** GET /api/datasets/postcode-risk?pc=SW1A+1AA — lookup flood risk for a single postcode */
router.get('/postcode-risk', (req: Request, res: Response) => {
  try {
    const pc = typeof req.query.pc === 'string' ? req.query.pc : '';
    if (!pc.trim()) {
      res.status(400).json({ error: 'Missing required query parameter: pc' });
      return;
    }
    const result = getPostcodeRisk(pc);
    if (!result) {
      res.status(404).json({ error: 'Postcode not found in flood risk dataset' });
      return;
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get postcode risk');
    res.status(500).json({ error: 'Failed to get postcode risk' });
  }
});

/** GET /api/datasets/postcode-risk/search?q=SW1A&limit=20 — search postcodes by prefix */
router.get('/postcode-risk/search', (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q.trim()) {
      res.status(400).json({ error: 'Missing required query parameter: q' });
      return;
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    res.json(searchPostcodes(q, limit));
  } catch (err) {
    logger.error({ err }, 'Failed to search postcodes');
    res.status(500).json({ error: 'Failed to search postcodes' });
  }
});

/** GET /api/datasets/properties-risk-summary — aggregate summary of 2.4M individual properties */
router.get('/properties-risk-summary', (_req: Request, res: Response) => {
  try {
    res.json(getPropertyRiskSummary());
  } catch (err) {
    logger.error({ err }, 'Failed to get properties risk summary');
    res.status(500).json({ error: 'Failed to get properties risk summary' });
  }
});

/** GET /api/datasets/waterbody-catchments — WFD River Waterbody Catchments Cycle 2 GeoJSON (WGS84) */
router.get('/waterbody-catchments', async (_req: Request, res: Response) => {
  try {
    res.json(await getWFDCatchments());
  } catch (err) {
    logger.error({ err }, 'Failed to get WFD catchments');
    res.status(500).json({ error: 'Failed to get WFD catchments' });
  }
});

/** GET /api/datasets/nfm-hotspots — NFM Heat Maps / Hotspots GeoJSON (WGS84) */
router.get('/nfm-hotspots', async (_req: Request, res: Response) => {
  try {
    res.json(await getNFMHotspots());
  } catch (err) {
    logger.error({ err }, 'Failed to get NFM hotspots');
    res.status(500).json({ error: 'Failed to get NFM hotspots' });
  }
});

/** GET /api/datasets/schools — State-funded schools GeoJSON (WGS84 points) */
router.get('/schools', async (_req: Request, res: Response) => {
  try {
    res.json(await getSchools());
  } catch (err) {
    logger.error({ err }, 'Failed to get schools data');
    res.status(500).json({ error: 'Failed to get schools data' });
  }
});

/** GET /api/datasets/hospitals — CQC health/care locations GeoJSON (WGS84 points) */
router.get('/hospitals', async (_req: Request, res: Response) => {
  try {
    res.json(await getHospitals());
  } catch (err) {
    logger.error({ err }, 'Failed to get hospitals data');
    res.status(500).json({ error: 'Failed to get hospitals data' });
  }
});

/** GET /api/datasets/bathing-waters — EA Bathing Water Quality GeoJSON (WGS84 points) */
router.get('/bathing-waters', async (_req: Request, res: Response) => {
  try {
    res.json(await getBathingWaters());
  } catch (err) {
    logger.error({ err }, 'Failed to get bathing waters data');
    res.status(500).json({ error: 'Failed to get bathing waters data' });
  }
});

/** GET /api/datasets/ramsar — Ramsar Wetlands (England) GeoJSON polygons (WGS84) */
router.get('/ramsar', async (_req: Request, res: Response) => {
  try {
    res.json(await getRamsar());
  } catch (err) {
    logger.error({ err }, 'Failed to get Ramsar wetlands data');
    res.status(500).json({ error: 'Failed to get Ramsar wetlands data' });
  }
});

/** GET /api/datasets/water-company-boundaries — Ofwat Water Company Boundaries GeoJSON (WGS84) */
router.get('/water-company-boundaries', async (_req: Request, res: Response) => {
  try {
    res.json(await getWaterCompanyBoundaries());
  } catch (err) {
    logger.error({ err }, 'Failed to get water company boundaries data');
    res.status(500).json({ error: 'Failed to get water company boundaries data' });
  }
});

/** GET /api/datasets/edm-overflows — EDM Storm Overflows 2024 GeoJSON points (WGS84) */
router.get('/edm-overflows', async (_req: Request, res: Response) => {
  try {
    res.json(await getEDMOverflows());
  } catch (err) {
    logger.error({ err }, 'Failed to get EDM overflows data');
    res.status(500).json({ error: 'Failed to get EDM overflows data' });
  }
});

/** GET /api/datasets/winep-overflows — WINEP Storm Overflows Under Investigation GeoJSON points (WGS84) */
router.get('/winep-overflows', async (_req: Request, res: Response) => {
  try {
    res.json(await getWINEPOverflows());
  } catch (err) {
    logger.error({ err }, 'Failed to get WINEP overflows data');
    res.status(500).json({ error: 'Failed to get WINEP overflows data' });
  }
});

export default router;
