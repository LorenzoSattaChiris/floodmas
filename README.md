<div align="center">

# FloodMAS Server

**Express API gateway for the FloodMAS flood intelligence platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](../LICENSE)

Backend API server for [FloodMAS](https://floodmas.lsattachiris.com) — a real-time UK flood intelligence dashboard.  
Acts as a secure, caching proxy between the React frontend and 8 external data sources, plus 6 local dataset directories, AI agent orchestration, and ML-based risk forecasting.

</div>

---

## Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [External Data Sources](#external-data-sources)
- [Local Datasets](#local-datasets)
- [AI Agent System](#ai-agent-system)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Security](#security)

---

## Overview

The server has five responsibilities:

1. **Proxy & cache external APIs** — All calls to the Environment Agency, Open-Meteo, Defra ArcGIS, Bluesky, Met Office, Copernicus CDS, NRFA, and Ordnance Survey are proxied and cached in-memory with per-resource TTLs.

2. **Serve local datasets** — Six local dataset directories (flood risk areas, flood management statistics, postcode risk, property risk, flood risk zones, and LLFA boundaries) are loaded into memory at startup and served via dedicated endpoints.

3. **AI agent orchestration** — A multi-agent system (supervisor + 4 specialist workers) powered by OpenAI handles natural-language flood queries, proactive monitoring scans, and professional report generation via SSE streaming.

4. **ML risk forecasting** — TensorFlow.js models for flood forecasting and risk classification run server-side.

5. **Serve the SPA** — In production, the compiled React client is served from `../client/dist` with a `/*` SPA catch-all.

---

## Requirements

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9

---

## Getting Started

```bash
npm install
cp .env.example .env    # Configure API keys (optional — core features work without keys)
npm run dev              # Hot-reload on port 3000
```

### Production

```bash
npm run build   # TypeScript → dist/
npm start       # Runs dist/index.js
```

---

## Project Structure

```
server/
├── src/
│   ├── index.ts                  # Express entry — middleware, 17 route mounts, SPA serving
│   ├── logger.ts                 # Pino structured logger
│   ├── agents/                   # AI agent system
│   │   ├── config.ts             # Agent definitions & tool bindings
│   │   ├── openai.ts             # OpenAI client wrapper
│   │   └── types.ts              # Agent message types
│   ├── config/
│   │   └── keywords.ts           # Bluesky flood search terms & UK location list
│   ├── data/                     # Static reference data
│   │   ├── infrastructure.ts     # UK flood infrastructure reference
│   │   ├── sensorReadings.ts     # Simulated sensor baselines
│   │   └── ukCities.ts           # 30-point UK city grid for weather queries
│   ├── dataset/                  # Local dataset files (CSV, GeoJSON, XLSX)
│   │   ├── floodriskareas/       # Defra Flood Risk Areas — GeoJSON (EPSG:27700)
│   │   ├── floodriskmanage/      # NAO Flood Management — 9 CSV files
│   │   ├── floodriskzone/        # GOV.UK Flood Risk Zone — 2 CSV files
│   │   ├── floodriskpostcodes/   # EA RoFRS Postcodes at Risk — 269K rows
│   │   ├── floodriskproperties/  # EA RoFRS Properties at Risk — 2.4M rows
│   │   └── LLFA/                 # LLFA boundaries GeoJSON + LFRMS audit XLSX
│   ├── ml/                       # Machine learning models
│   │   ├── forecasting/model.ts  # Flood level forecasting (TensorFlow.js)
│   │   └── risk/model.ts         # Risk classification model
│   ├── routes/                   # 17 Express router modules
│   │   ├── health.ts             # System health check
│   │   ├── floods.ts             # EA flood warnings
│   │   ├── stations.ts           # EA monitoring stations + readings
│   │   ├── flood-areas.ts        # EA flood warning/alert area polygons
│   │   ├── social.ts             # Unified EA + Bluesky feed
│   │   ├── weather.ts            # Open-Meteo precipitation, discharge, soil, extended
│   │   ├── features.ts           # ArcGIS spatial features (defences, historic, rivers)
│   │   ├── nrfa.ts               # National River Flow Archive stations
│   │   ├── metoffice.ts          # Met Office Weather DataHub forecast
│   │   ├── cds.ts                # Copernicus ERA5-Land reanalysis
│   │   ├── os.ts                 # Ordnance Survey Names API (place search)
│   │   ├── datasets.ts           # Local dataset statistics (9 endpoints)
│   │   ├── llfa.ts               # LLFA boundaries + LFRMS strategy info
│   │   ├── chat.ts               # AI agent chat (SSE streaming)
│   │   ├── agents.ts             # A2A agent card metadata
│   │   ├── proactive.ts          # Proactive flood monitoring scan
│   │   └── report.ts             # Professional report generation
│   ├── services/                 # Data source clients
│   │   ├── ea-api.ts             # Environment Agency Flood Monitoring API
│   │   ├── open-meteo.ts         # Open-Meteo forecast + flood + soil APIs
│   │   ├── arcgis.ts             # Defra ArcGIS FeatureServer (defences, floods, rivers)
│   │   ├── bluesky.ts            # Bluesky AT Protocol social search
│   │   ├── feed.ts               # Unified EA + Bluesky feed merge
│   │   ├── datasets.ts           # Local CSV/GeoJSON loader (5 dataset dirs)
│   │   ├── llfa.ts               # LLFA GeoJSON + XLSX merger
│   │   ├── cache.ts              # NodeCache wrapper with typed TTL constants
│   │   └── ...                   # Met Office, CDS, OS service modules
│   └── tools/                    # AI agent tool implementations
│       ├── sensors.ts            # Sensor data tools for agents
│       └── weather.ts            # Weather data tools for agents
├── dist/                         # Compiled output (git-ignored)
├── .env.example
├── package.json
└── tsconfig.json
```

---

## API Reference

Base URL: `http://localhost:3000`  
Rate limit: **200 requests/min/IP**  
All responses are JSON unless noted.

---

### Health

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/health` | Server uptime, per-service connectivity probes, cache stats | — |

---

### Flood Warnings (Environment Agency)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/floods` | All active EA flood warnings & alerts across England | 5 min |
| `GET` | `/api/floods/severe` | Severity 1–2 only (Severe Warning + Warning) | 5 min |

**Severity levels:** 1 = Severe (danger to life), 2 = Warning (flooding expected), 3 = Alert (flooding possible), 4 = No longer in force.

---

### Monitoring Stations (Environment Agency)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/stations` | Active EA monitoring stations | 1 hour |
| `GET` | `/api/stations/:id/readings` | Time-series readings for a single station | 5 min |
| `GET` | `/api/stations/readings/latest` | Most recent reading from every active station | 5 min |

**Query params for `/api/stations`:** `parameter` (level/rainfall/flow/wind), `type` (SingleLevel/MultiTraceLevel/Coastal/TideGauge), `_limit` (default 500).

---

### Flood Areas (Environment Agency)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/flood-areas` | Flood warning/alert area polygons | 24 hours |
| `GET` | `/api/flood-areas/:id` | Detail for a single flood area | 24 hours |

**Query param:** `type` (FloodAlertArea / FloodWarningArea).

---

### Social Feed (EA + Bluesky)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/social/feed` | Unified EA warnings + Bluesky posts, sorted newest-first | 60 sec |

**Query params:** `limit` (default 20, max 100), `mode` (focused / broad).

---

### Weather (Open-Meteo)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/weather/precipitation` | Current hourly precipitation for 30-point UK grid | 30 min |
| `GET` | `/api/weather/river-discharge` | 72h river discharge forecast (default UK grid or custom coords) | 30 min |
| `GET` | `/api/weather/soil-moisture` | Soil saturation (0–7 cm) across UK grid | 30 min |
| `GET` | `/api/weather/extended` | Snow depth, wind gusts, pressure, cloud cover | 30 min |

**Query params for `/api/weather/river-discharge`:** `lats`, `lons` (comma-separated, max 50 each).

---

### Spatial Features (Defra ArcGIS)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/features/defences` | Flood defence infrastructure (walls, embankments, barriers) | 24 hours |
| `GET` | `/api/features/historic-floods` | Recorded historic flood outlines | 24 hours |
| `GET` | `/api/features/main-rivers` | Statutory main rivers (polylines) | 24 hours |

**Query param:** `bbox` (xmin,ymin,xmax,ymax in WGS84, optional).

---

### National River Flow Archive (UKCEH)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/nrfa/stations` | All NRFA gauging stations (~1,500+) | 24 hours |

---

### Met Office Weather DataHub

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/metoffice/forecast` | Official Met Office hourly site-specific forecast grid | 30 min |
| `GET` | `/api/metoffice/health` | Check API key availability | — |

**Requires:** `METOFFICE_SPOT_KEY` env var.

---

### Copernicus CDS (ERA5-Land Reanalysis)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/cds/reanalysis` | ERA5-Land reanalysis — temperature, precipitation, soil moisture, snow cover | 12 hours |

**Requires:** `CDS_API_KEY` env var. Data has ~5-day latency.

---

### Ordnance Survey Names API

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/os/search` | Place name search across GB | 24 hours |
| `GET` | `/api/os/nearest` | Nearest named place to a coordinate | 24 hours |

**Query params:** `q` (search query), `limit` (default 10); or `lat`, `lon`, `radius` (metres).  
**Requires:** `OS_API_KEY` env var.

---

### Local Datasets (CSV / GeoJSON / XLSX)

All endpoints under `/api/datasets` serve data loaded from local files at startup.

| Method | Path | Description | Source |
|--------|------|-------------|--------|
| `GET` | `/api/datasets/summary` | Aggregate counts of all loaded datasets | All directories |
| `GET` | `/api/datasets/flood-risk-areas` | Defra Flood Risk Areas GeoJSON (189 polygons, converted BNG→WGS84) | `floodriskareas/` |
| `GET` | `/api/datasets/defences` | Flood defence condition statistics by region/UTLA | `floodriskmanage/` |
| `GET` | `/api/datasets/spend` | Government + local levy flood spend by region/UTLA | `floodriskmanage/` |
| `GET` | `/api/datasets/homes-protected` | Homes better protected counts by region/UTLA | `floodriskmanage/` |
| `GET` | `/api/datasets/properties-at-risk` | Properties at flood risk by constituency/LTLA/UTLA | `floodriskmanage/` |
| `GET` | `/api/datasets/postcode-risk` | Flood risk for a single postcode (269K in map) | `floodriskpostcodes/` |
| `GET` | `/api/datasets/postcode-risk/search` | Prefix search across 269K postcodes | `floodriskpostcodes/` |
| `GET` | `/api/datasets/properties-risk-summary` | Aggregated summary of 2.4M individual properties | `floodriskproperties/` |

**Query params:** `level` (region/utla/ltla/constituency), `pc` (postcode), `q` (prefix), `limit`.

---

### LLFA Boundaries (Lead Local Flood Authority)

| Method | Path | Description | Source |
|--------|------|-------------|--------|
| `GET` | `/api/llfa` | Full boundary GeoJSON (218 counties/unitary authorities) with LFRMS strategy info merged | `LLFA/` |
| `GET` | `/api/llfa/summary` | Count of LLFAs with/without strategy data | `LLFA/` |
| `GET` | `/api/llfa/:code` | Single LLFA info by ONS code (e.g. `E06000001`) | `LLFA/` |

LLFA boundaries are EPSG:4326 (WGS84). Strategy data from the Russell LFRMS audit 2022 XLSX is merged into GeoJSON feature properties via normalised name matching (152 of 218 LLFAs have audit data).

---

### AI Agent System (SSE Streaming)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | A2A-compliant agent card metadata for all registered agents |
| `POST` | `/api/chat` | Start a new agent query → returns `{ sessionId }` |
| `GET` | `/api/chat/:id` | SSE event stream for chat session |
| `POST` | `/api/proactive/scan` | Trigger a proactive flood assessment scan → returns `{ sessionId }` |
| `GET` | `/api/proactive/:id` | SSE event stream for proactive scan |
| `POST` | `/api/report` | Generate a professional flood report from conversation summary |
| `GET` | `/api/report/:id` | SSE event stream for report generation |

---

## External Data Sources

| # | Service | Base URL | Auth | Purpose |
|---|---------|----------|------|---------|
| 1 | **EA Flood Monitoring API** | `environment.data.gov.uk/flood-monitoring` | None | Flood warnings, monitoring stations, readings, flood areas |
| 2 | **Open-Meteo Forecast** | `api.open-meteo.com` | None | Precipitation, soil moisture, snow, wind, pressure |
| 3 | **Open-Meteo Flood** | `flood-api.open-meteo.com` | None | River discharge forecasts |
| 4 | **Defra ArcGIS Online** | `services.arcgis.com` | None | Flood defences, historic outlines, main rivers |
| 5 | **EA WMS Tile Services** | `environment.data.gov.uk/arcgis/rest/services` | None | Risk rasters (rivers/sea, surface water, zones 2/3, reservoirs) — consumed directly by client |
| 6 | **Bluesky AppView** | `api.bsky.app` | None | Public social flood posts via AT Protocol |
| 7 | **NRFA** | `nrfaapps.ceh.ac.uk` | None | National River Flow Archive gauging stations |
| 8 | **Met Office DataHub** | `data.hub.api.metoffice.gov.uk` | API key | Official hourly site-specific forecasts |
| 9 | **Copernicus CDS** | `cds.climate.copernicus.eu` | API key | ERA5-Land reanalysis (temp, precip, soil moisture, snow) |
| 10 | **Ordnance Survey** | `api.os.uk` | API key | Place name search + ZXY tile layers (Light/Road/Outdoor) |

Sources 1–7 are free public APIs requiring no keys. Sources 8–10 require optional API keys for full functionality.

---

## Local Datasets

Six directories in `server/src/dataset/`, loaded into memory at startup:

### 1. `floodriskareas/` — Defra Flood Risk Areas
- **File:** `Flood_Risk_Areas.geojson` (44 MB, EPSG:27700)
- **Processing:** Coordinates converted from British National Grid to WGS84 via `proj4`
- **Content:** 189 Flood Risk Area polygons (Areas of Potentially Significant Flood Risk — APSFR)
- **Why:** Spatial layer showing officially designated flood risk areas for planning

### 2. `floodriskmanage/` — NAO Flood Management Statistics
- **Files:** 9 CSV files (Latin-1 encoded, £ symbols, percentage fields)
- **Content:** Flood defence condition, government/local spend, homes better protected, properties at risk — by region, UTLA, LTLA, and constituency
- **Source:** National Audit Office "Managing Flood Risk" open data tool
- **Why:** Statistical context for policy analysis — defence quality, spend trends, risk exposure per area

### 3. `floodriskzone/` — GOV.UK Flood Risk Tool
- **Files:** 2 CSV files (defences by UTLA, properties at risk by constituency)
- **Why:** Supplementary GOV.UK data cross-referencing the NAO dataset

### 4. `floodriskpostcodes/` — EA RoFRS Postcodes at Risk
- **File:** `RoFRS_Postcodes_AtRisk.csv` (269,000 postcodes)
- **Processing:** Loaded into a `Map<string, PostcodeRisk>` for O(1) lookup + sorted array for binary-search prefix matching
- **Content:** Per-postcode risk breakdown: total properties, residential/non-residential/unclassified × very-low/low/medium/high risk bands
- **Why:** Enables postcode-level flood risk lookup in the PlaceSearch component

### 5. `floodriskproperties/` — EA RoFRS Properties at Risk
- **File:** `RoFRS_PropertiesAtRisk.csv` (2.4 million rows)
- **Processing:** Stream-aggregated at startup into a summary object (not stored individually — too large)
- **Content:** Cross-tabulation of property type (RES/NRP/unclassified) × risk band (very low/low/medium/high)
- **Why:** National-level property risk statistics

### 6. `LLFA/` — Lead Local Flood Authority Boundaries
- **Files:** GeoJSON boundary file (17.7 MB, EPSG:4326, 218 county/unitary authority polygons) + Russell LFRMS audit 2022 XLSX (152 LLFAs with 60+ audit fields)
- **Processing:** XLSX parsed with `xlsx` library; strategy data merged into GeoJSON feature properties via normalised authority name matching
- **Content:** Per-LLFA boundary polygon with embedded strategy quality info: year published, word count, living document status, external consultant usage, stakeholder mention counts (EA, DEFRA, water companies, RFCCs, public), strategy quality grades (A/B/C for clear objectives, SMART objectives, M&E, climate change, surface water, FCERM alignment), and 30+ specific term mention counts (SuDS, NFM, NBS, resilience, climate change, etc.)
- **Why:** Enables a map layer showing LLFA jurisdictions with comprehensive information cards on click

---

## AI Agent System

The server implements a multi-agent architecture powered by OpenAI:

| Agent | Role | Capabilities |
|-------|------|-------------|
| **Supervisor** | Orchestrator | Routes queries to specialist workers, aggregates responses |
| **Monitoring** | Real-time analysis | Current flood warnings, station readings, live conditions |
| **Forecasting** | Predictive | Weather forecast interpretation, river discharge trends |
| **Risk Analysis** | Risk assessment | Risk zone analysis, defence condition evaluation |
| **Emergency Response** | Situational awareness | Emergency planning, affected area identification |

Agents communicate via a LangGraph-style workflow and stream responses to the client via Server-Sent Events (SSE).

**Requires:** `OPENAI_API_KEY` env var.

---

## Configuration

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP listening port |
| `NODE_ENV` | `development` | No | `production` enables SPA static serving |
| `OPENAI_API_KEY` | — | For agents | GPT model for AI agent system |
| `METOFFICE_SPOT_KEY` | — | For Met Office | Met Office DataHub site-specific API |
| `CDS_API_KEY` | — | For CDS | Copernicus Climate Data Store API |
| `OS_API_KEY` | — | For OS | Ordnance Survey Data Hub API |

Core functionality (EA, Open-Meteo, ArcGIS, Bluesky, NRFA, local datasets) works without any API keys.

### Cache TTLs

Defined in `src/services/cache.ts`:

| Resource | TTL | Reason |
|----------|-----|--------|
| Flood warnings | 5 min | High-priority real-time data |
| Station readings | 5 min | Frequently updated measurements |
| Social feed | 60 sec | Near-real-time social signals |
| Monitoring stations | 1 hour | Station metadata changes rarely |
| Weather grids | 30 min | Forecast updates hourly |
| Met Office forecast | 30 min | Official hourly forecast cycle |
| Flood areas | 24 hours | Warning area boundaries are stable |
| Spatial features | 24 hours | Defence/historic data updates rarely |
| NRFA stations | 24 hours | Static gauging station metadata |
| OS place search | 24 hours | Place names are static |
| CDS reanalysis | 12 hours | ERA5-Land has ~5-day latency |

### Rate Limiting

**200 requests/min/IP** via `express-rate-limit`. Adjust `max` and `windowMs` in `src/index.ts`.

### CORS

Allowed origins in `src/index.ts`:
```
http://localhost:5173–5175, http://localhost:3000
https://*.floodmas.lsattachiris.com
```

---

## Architecture

```
Incoming request
  │
  ├── helmet()           Security headers (HSTS, X-Frame-Options, etc.)
  ├── compression()      Gzip
  ├── cors()             Origin allowlist
  └── rateLimit()        200 req/min per IP
        │
        ├─ /api/health         → Parallel health probes
        ├─ /api/floods         → ea-api.ts → NodeCache (5 min)
        ├─ /api/stations       → ea-api.ts → NodeCache (1 hour / 5 min)
        ├─ /api/flood-areas    → ea-api.ts → NodeCache (24 hours)
        ├─ /api/social         → feed.ts → [ea-api + bluesky] → NodeCache (60 s)
        ├─ /api/weather        → open-meteo.ts → NodeCache (30 min)
        ├─ /api/features       → arcgis.ts → NodeCache (24 hours)
        ├─ /api/nrfa           → nrfa.ts → NodeCache (24 hours)
        ├─ /api/metoffice      → metoffice.ts → NodeCache (30 min)
        ├─ /api/cds            → cds.ts → NodeCache (12 hours)
        ├─ /api/os             → os.ts → NodeCache (24 hours)
        ├─ /api/datasets       → datasets.ts → In-memory (loaded at startup)
        ├─ /api/llfa           → llfa.ts → In-memory (loaded at startup)
        ├─ /api/chat           → OpenAI agents → SSE stream
        ├─ /api/agents         → Static agent cards
        ├─ /api/proactive      → OpenAI agents → SSE stream
        ├─ /api/report         → OpenAI agents → SSE stream
        └─ /*                  → Serve client/dist (production SPA)
```

---

## Security

| Control | Detail |
|---------|--------|
| `helmet` | Standard security headers — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy. CSP and COEP disabled for MapTiler/ArcGIS tile loading. |
| `cors` | Strict origin allowlist — no wildcards |
| `express-rate-limit` | 200 req/min per IP |
| Input validation | Route params are typed. Query params forwarded as structured values — no string interpolation into queries. |
| No secrets in source | API keys loaded from environment only. `.env.example` documents required vars. |

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 4.x | Web framework |
| `@atproto/api` | 0.19.x | Bluesky AT Protocol SDK |
| `@tensorflow/tfjs-node` | 4.22.x | ML model runtime |
| `openai` | 6.x | GPT API client for AI agents |
| `proj4` | 2.20.x | Coordinate projection (BNG ↔ WGS84) |
| `xlsx` | 0.18.x | Excel XLSX parsing (LLFA audit) |
| `node-cache` | 5.x | In-memory caching with TTLs |
| `pino` / `pino-http` | 10.x | Structured JSON logging |
| `helmet` | 8.x | Security headers |
| `compression` | 1.7.x | Gzip response compression |

---

*Part of the [FloodMAS](https://floodmas.lsattachiris.com) monorepo — a multi-agent flood intelligence system for the UK.*
