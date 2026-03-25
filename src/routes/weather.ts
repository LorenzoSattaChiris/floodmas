import { Router, Request, Response } from 'express';
import { getPrecipitationGrid, getRiverDischarge, getSoilMoistureGrid, getExtendedWeatherGrid, UK_GRID_POINTS } from '../services/open-meteo.js';
import { logger } from '../logger.js';

const router = Router();

/** GET /api/weather/soil-moisture — current soil moisture grid */
router.get('/soil-moisture', async (_req: Request, res: Response) => {
  try {
    const data = await getSoilMoistureGrid();
    res.json(data);
  } catch (err) {
    console.error('Error fetching soil moisture:', err);
    logger.error({ err }, 'Failed to fetch soil moisture data');
    res.status(502).json({ error: 'Failed to fetch soil moisture data' });
  }
});

/** GET /api/weather/precipitation — current & forecast precipitation grid */
router.get('/precipitation', async (_req: Request, res: Response) => {
  try {
    const data = await getPrecipitationGrid();
    res.json(data);
  } catch (err) {
    console.error('Error fetching precipitation:', err);
    logger.error({ err }, 'Failed to fetch precipitation data');
    res.status(502).json({ error: 'Failed to fetch weather data' });
  }
});

/** GET /api/weather/river-discharge — river discharge forecasts */
router.get('/river-discharge', async (req: Request, res: Response) => {
  try {
    // Accept comma-separated coords: ?lats=51.5,52.0&lons=-0.1,-1.0
    const latsStr = typeof req.query.lats === 'string' ? req.query.lats : '';
    const lonsStr = typeof req.query.lons === 'string' ? req.query.lons : '';

    const lats = latsStr.split(',').map(Number).filter(n => !isNaN(n));
    const lons = lonsStr.split(',').map(Number).filter(n => !isNaN(n));

    const coords = lats.map((lat, i) => ({ lat, lon: lons[i] })).filter(c => c.lon !== undefined);

    // When no coords supplied, fall back to the UK precipitation grid points
    const resolvedCoords = coords.length > 0 ? coords : UK_GRID_POINTS;

    const data = await getRiverDischarge(resolvedCoords);
    res.json(data);
  } catch (err) {
    console.error('Error fetching river discharge:', err);
    logger.error({ err }, 'Failed to fetch river discharge data');
    res.status(502).json({ error: 'Failed to fetch river discharge data' });
  }
});

/** GET /api/weather/extended — snow depth, wind gusts, pressure, cloud cover */
router.get('/extended', async (_req: Request, res: Response) => {
  try {
    const data = await getExtendedWeatherGrid();
    res.json(data);
  } catch (err) {
    console.error('Error fetching extended weather:', err);
    logger.error({ err }, 'Failed to fetch extended weather data');
    res.status(502).json({ error: 'Failed to fetch extended weather data' });
  }
});

export default router;
