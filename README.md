<div align="center">

# FloodMAS Server

**Express API gateway for the FloodMAS flood intelligence platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](../LICENSE)

This is the backend API server for [FloodMAS](https://github.com/your-org/floodmas) — a real-time UK flood intelligence dashboard. It acts as a secure, caching proxy between the React frontend and multiple external data sources: the Environment Agency Flood Monitoring API, Open-Meteo weather services, Defra ArcGIS spatial data, and Bluesky social posts.

</div>

---

## Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Data Sources](#data-sources)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Security](#security)
- [Part of FloodMAS Monorepo](#part-of-floodmas-monorepo)

---

## Overview

The server has three responsibilities:

1. **Proxy & cache external APIs** — All calls to EA, Open-Meteo, ArcGIS, and Bluesky go through this server. Responses are cached in-memory with per-resource TTLs to minimise upstream load and latency.

2. **Unify data feeds** — The `/api/social/feed` endpoint merges structured EA flood warnings with unstructured Bluesky social posts into a single sorted feed, with graceful fallback if Bluesky is unavailable.

3. **Serve the SPA** — In production, the server serves the compiled React client from `../client/dist` with a `/*` SPA catch-all, so a single Node.js process runs everything.

No external API keys are required. All upstream data sources are free public APIs.

---

## Requirements

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Development (hot-reload)

```bash
npm run dev
```

Uses `tsx watch` for TypeScript hot-reload. The server listens on port **3000**.

### Production build

```bash
npm run build   # Compiles TypeScript → dist/
npm start       # Runs compiled dist/index.js
```

### Environment variables

Copy the example and adjust if needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listening port |
| `NODE_ENV` | `development` | Set to `production` to enable SPA static file serving |

---

## Project Structure

```
server/
├── src/
│   ├── index.ts              # Express entry point — middleware, routes, static serving
│   ├── config/
│   │   └── keywords.ts       # Flood search terms and UK location list for Bluesky queries
│   ├── routes/
│   │   ├── health.ts         # GET /api/health
│   │   ├── floods.ts         # GET /api/floods[/severe]
│   │   ├── stations.ts       # GET /api/stations, /api/stations/:id/readings, /api/readings/latest
│   │   ├── flood-areas.ts    # GET /api/flood-areas[/:id]
│   │   ├── social.ts         # GET /api/social/feed
│   │   ├── weather.ts        # GET /api/weather/precipitation, /api/weather/river-discharge
│   │   └── features.ts       # GET /api/features/defences, /api/features/historic-floods
│   └── services/
│       ├── ea-api.ts         # Environment Agency Flood Monitoring API client
│       ├── bluesky.ts        # Bluesky AT Protocol AppView client (@atproto/api)
│       ├── feed.ts           # Unified EA + Bluesky feed merge
│       ├── open-meteo.ts     # Open-Meteo precipitation + river discharge client
│       ├── arcgis.ts         # Defra ArcGIS FeatureServer client
│       └── cache.ts          # NodeCache wrapper with typed TTL constants
├── dist/                     # Compiled output (git-ignored)
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## API Reference

Base URL (development): `http://localhost:3000`

Rate limit: **200 requests per minute per IP**.

---

### `GET /api/health`

System health check. Returns server uptime, per-service connectivity probe results, and cache statistics.

```bash
curl http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "uptime": 3724,
  "timestamp": "2024-11-14T10:30:00.000Z",
  "services": {
    "ea": "ok",
    "bluesky": "ok",
    "openmeteo": "ok"
  },
  "cache": {
    "keys": 14,
    "hits": 381,
    "misses": 19
  }
}
```

---

### `GET /api/floods`

All active EA flood warnings and alerts across England.

**Cache TTL:** 5 minutes

```bash
curl http://localhost:3000/api/floods
```

```json
{
  "count": 42,
  "items": [
    {
      "id": "http://environment.data.gov.uk/flood-monitoring/id/floods/122501",
      "description": "River Wye at Builth Wells",
      "message": "Flooding is expected...",
      "severity": 2,
      "severityLevel": "Flood Warning",
      "eaAreaName": "Midlands",
      "county": "Herefordshire",
      "issuedAt": "2024-11-14T08:15:00Z",
      "floodArea": { "riverOrSea": "River Wye" }
    }
  ]
}
```

**Severity levels:**

| `severity` | Label | Meaning |
|---|---|---|
| 1 | Severe Flood Warning | Danger to life |
| 2 | Flood Warning | Flooding expected, immediate action required |
| 3 | Flood Alert | Flooding is possible, be prepared |
| 4 | No longer in force | Removed |

---

### `GET /api/floods/severe`

Severity 1 and 2 only (Severe Warning + Warning). Same response schema as `/api/floods`.

**Cache TTL:** 5 minutes

---

### `GET /api/stations`

Active EA water level and rainfall monitoring stations.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `parameter` | string | Filter by measurement type: `level`, `flow`, `rainfall`, `wind` |
| `type` | string | Filter by station type: `SingleLevel`, `MultiTraceLevel`, `Coastal` |
| `_limit` | number | Max stations to return (default: 500) |

**Cache TTL:** 1 hour

---

### `GET /api/stations/:id/readings`

Time-series readings for a single monitoring station.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `_limit` | number | Number of readings to return (default: 96) |
| `since` | ISO 8601 | Return only readings after this datetime |

**Cache TTL:** 5 minutes

---

### `GET /api/stations/readings/latest`

Most recent single reading from every active monitoring station.

**Cache TTL:** 5 minutes

---

### `GET /api/flood-areas`

Flood warning area polygons.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `type` | string | `FloodAlertArea` or `FloodWarningArea` |

**Cache TTL:** 24 hours

Returns a GeoJSON `FeatureCollection`.

---

### `GET /api/flood-areas/:id`

Detail and geometry for a single flood area.

**Cache TTL:** 24 hours

---

### `GET /api/social/feed`

Unified feed merging EA flood warnings with Bluesky public posts. Sorted newest-first. EA warnings are always included; Bluesky results fall back gracefully to EA-only on failure.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | 20 | Max items to return (cap: 100) |
| `mode` | string | `focused` | `focused` = high-precision queries; `broad` = higher recall |

**Cache TTL:** 60 seconds

```json
{
  "items": [...],
  "sources": { "ea": true, "bluesky": true },
  "generatedAt": "2024-11-14T10:30:00.000Z"
}
```

Each item has a `source` field: `"ea"` (structured warning) or `"bluesky"` (social post).

---

### `GET /api/weather/precipitation`

Current hourly precipitation for 26 grid points across England and Wales, from Open-Meteo.

**Cache TTL:** 30 minutes

Returns a GeoJSON `FeatureCollection` of point features with `precipitation` (mm/h) properties.

---

### `GET /api/weather/river-discharge`

72-hour river discharge forecast for arbitrary coordinate pairs, from the Open-Meteo Flood API.

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lats` | string | Yes | Comma-separated latitudes (max 50) |
| `lons` | string | Yes | Comma-separated longitudes matching `lats` |

**Cache TTL:** 30 minutes

Returns a GeoJSON `FeatureCollection` of point features with discharge (m³/s) and forecast array.

---

### `GET /api/features/defences`

Flood defence infrastructure (embankments, walls, sluices, barriers) from Defra ArcGIS.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `bbox` | string | `xmin,ymin,xmax,ymax` in WGS84 (optional) |

**Cache TTL:** 24 hours

Returns a GeoJSON `FeatureCollection` of line features.

---

### `GET /api/features/historic-floods`

Recorded historic flood extents as polygon features from Defra ArcGIS.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `bbox` | string | `xmin,ymin,xmax,ymax` in WGS84 (optional) |

**Cache TTL:** 24 hours

Returns a GeoJSON `FeatureCollection` of polygon features.

---

## Data Sources

| Service | Endpoint | Auth | Notes |
|---|---|---|---|
| **EA Flood Monitoring API** | `environment.data.gov.uk/flood-monitoring` | None | Official UK government open data |
| **Open-Meteo Forecast** | `api.open-meteo.com` | None | Precipitation and weather grids |
| **Open-Meteo Flood** | `flood-api.open-meteo.com` | None | River discharge forecasts |
| **Defra ArcGIS Online** | `services.arcgis.com` | None | Flood defences + historic extents |
| **Bluesky AppView** | `api.bsky.app` | None | Public post search via `@atproto/api` |

All data sources are free public APIs. No API keys or accounts required.

---

## Configuration

### Caching

Cache TTLs are defined in `src/services/cache.ts`. Adjust them there if you need different refresh rates.

| Resource | TTL |
|---|---|
| Flood warnings | 5 min |
| Monitoring stations | 1 hour |
| Readings | 5 min |
| Flood areas | 24 hours |
| Social feed | 60 sec |
| Weather / discharge | 30 min |

### CORS

Allowed origins are defined in `src/index.ts`. The defaults are:

```
http://localhost:5173
http://localhost:5174
http://localhost:5175
http://localhost:3000
https://*.floodmas.lsattachiris.com
```

Add your production domain to this list before deploying.

### Rate Limiting

Default: **200 requests per minute per IP** (express-rate-limit). Adjust the `max` and `windowMs` values in `src/index.ts` to suit your deployment.

---

## Architecture

```
Incoming request
  │
  ├── helmet()          Security headers (HSTS, X-Frame-Options, etc.)
  ├── compression()     Gzip
  ├── cors()            Origin allowlist
  └── rateLimit()       200 req/min per IP
        │
        ├─ /api/health      → Parallel health probes to EA, Bluesky, Open-Meteo
        ├─ /api/floods      → ea-api.ts → NodeCache (5 min)
        ├─ /api/stations    → ea-api.ts → NodeCache (1 hour / 5 min readings)
        ├─ /api/flood-areas → ea-api.ts → NodeCache (24 hours)
        ├─ /api/social      → feed.ts → [ea-api.ts + bluesky.ts] → NodeCache (60 s)
        ├─ /api/weather     → open-meteo.ts → NodeCache (30 min)
        ├─ /api/features    → arcgis.ts → NodeCache (24 hours)
        └─ /*               → Serve client/dist (production SPA)
```

The cache layer (`cache.ts`) is a simple `node-cache` wrapper. Every service function checks the cache before making an upstream HTTP request, and writes the result back on a miss.

---

## Security

| Control | Detail |
|---|---|
| `helmet` | Standard security headers — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. CSP and COEP are disabled to allow MapTiler and ArcGIS tile requests from the client. |
| `cors` | Strict origin allowlist — no wildcard |
| `express-rate-limit` | 200 req/min per IP — prevents scraping and runaway clients |
| No secrets in source | No API keys anywhere in the codebase. Only `PORT` is read from environment. |
| Input handling | Route parameters use Express route patterns. Query parameters are forwarded to upstream APIs as structured typed values — no string interpolation into queries. |

---

## Part of FloodMAS Monorepo

This repository is the server component of the [FloodMAS monorepo](https://github.com/your-org/floodmas). When used as part of the full monorepo:

- **Root scripts** (`npm run dev`, `npm run build`) orchestrate both client and server via `concurrently`
- **Vite dev proxy** forwards `/api/*` from the client dev server (`:5173`) to this server (`:3000`) — no CORS issues in development
- **Production** — `npm run build` compiles the React client to `client/dist/`, then this server serves it as static files under `/*`

To run standalone (server only):

```bash
npm install
npm run dev
# Server available at http://localhost:3000
```
