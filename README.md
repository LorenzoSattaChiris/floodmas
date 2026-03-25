<div align="center">

# FloodMAS Server

**Express API gateway for the FloodMAS flood intelligence platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](../LICENSE)

Backend API server for [FloodMAS](https://floodmas.lsattachiris.com) — a real-time UK flood intelligence dashboard.  
Acts as a secure, caching proxy between the React frontend and 10 external data sources, plus 16 local dataset directories, AI agent orchestration, and ML-based risk forecasting.

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

2. **Serve local datasets** — Sixteen local dataset directories (flood risk areas, flood management statistics, postcode risk, property risk, flood risk zones, LLFA boundaries, IMD deprivation, WFD catchments, NFM hotspots, schools, hospitals, bathing waters, Ramsar wetlands, water company boundaries, EDM storm overflows, and WINEP overflows) are loaded into memory at startup and served via dedicated endpoints.

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
│   ├── index.ts                  # Express entry — middleware, 19 route mounts, SPA serving
│   ├── logger.ts                 # Pino structured logger
│   ├── agents/                   # AI agent system
│   │   ├── coordinator.ts        # ReAct supervisor loop — delegates to 4 specialists
│   │   ├── specialists.ts        # ReAct tool-calling loop for each of the 4 worker agents
│   │   ├── cards.ts              # A2A agent card definitions (5 cards)
│   │   ├── prompts.ts            # System prompt templates per agent role
│   │   ├── config.ts             # Model names, token limits, iteration caps, TTLs
│   │   ├── openai.ts             # OpenAI client wrapper
│   │   └── types.ts              # AgentEvent, AgentCard, ChatSession, FloodTool, LlmCallBudget types
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
│   │   ├── imd/                  # MHCLG IMD 2019 File 7 CSV — 32,844 LSOAs
│   │   └── LLFA/                 # LLFA boundaries GeoJSON + LFRMS audit XLSX
│   ├── ml/                       # Machine learning models (TensorFlow.js)
│   │   ├── forecasting/model.ts  # LSTM-PINN: 48-step water level forecast (auto-regressive, 24 h)
│   │   ├── forecasting/data-pipeline.ts  # EA + Open-Meteo training data pipeline; online fine-tuning
│   │   └── risk/model.ts         # GBT-ensemble (Dense network): 5-output risk classification
│   ├── routes/                   # 19 Express router modules
│   │   ├── health.ts             # System health check
│   │   ├── floods.ts             # EA flood warnings
│   │   ├── stations.ts           # EA monitoring stations + readings
│   │   ├── flood-areas.ts        # EA flood warning/alert area polygons
│   │   ├── social.ts             # Unified EA + Bluesky feed
│   │   ├── weather.ts            # Open-Meteo precipitation, discharge, soil, extended
│   │   ├── features.ts           # ArcGIS spatial features (defences, historic, rivers, risk polygons)
│   │   ├── nrfa.ts               # National River Flow Archive stations
│   │   ├── metoffice.ts          # Met Office Weather DataHub forecast
│   │   ├── cds.ts                # Copernicus ERA5-Land reanalysis
│   │   ├── os.ts                 # Ordnance Survey Names API (place search)
│   │   ├── datasets.ts           # Local dataset statistics (9 endpoints)
│   │   ├── llfa.ts               # LLFA boundaries + LFRMS strategy info
│   │   ├── imd.ts                # IMD 2019 deprivation data — bbox query, LSOA lookup, summary
│   │   ├── tiles.ts              # Tile proxies: OS Maps + EA ArcGIS MapServer (transparent fallback)
│   │   ├── chat.ts               # AI agent chat (SSE streaming)
│   │   ├── agents.ts             # A2A agent card metadata
│   │   ├── proactive.ts          # Proactive flood monitoring scan
│   │   └── report.ts             # Professional report generation
│   ├── services/                 # Data source clients
│   │   ├── ea-api.ts             # Environment Agency Flood Monitoring API
│   │   ├── open-meteo.ts         # Open-Meteo forecast + flood + soil APIs
│   │   ├── arcgis.ts             # Defra + EA ArcGIS FeatureServer (defences, floods, rivers, risk polygons)
│   │   ├── bluesky.ts            # Bluesky AT Protocol social search
│   │   ├── feed.ts               # Unified EA + Bluesky feed merge
│   │   ├── datasets.ts           # Local CSV/GeoJSON loader (5 dataset dirs)
│   │   ├── imd.ts                # MHCLG IMD 2019 loader (32,844 LSOAs) + ONS geometry join
│   │   ├── llfa.ts               # LLFA GeoJSON + XLSX merger
│   │   ├── nrfa.ts               # UKCEH NRFA stations wrapper
│   │   ├── os.ts                 # OS Names API wrapper with BNG↔WGS84 (proj4)
│   │   ├── cache.ts              # NodeCache wrapper with typed TTL constants
│   │   ├── metoffice.ts          # Met Office DataHub client
│   │   └── cds.ts                # Copernicus CDS ERA5-Land client
│   ├── tools/                    # Agent tool implementations (28 registered tools)
│   │   ├── registry.ts           # Central ReadonlyMap of all 28 tools; getToolDefinitions() / executeTool()
│   │   ├── layers.ts             # 14 map-data tools (warnings, stations, risk zones, IMD, atmospheric models)
│   │   ├── riskData.ts           # 4 risk-analysis tools (zone info, infrastructure, population, ML prediction)
│   │   ├── emergency.ts          # 4 emergency-response tools (alert, evacuation, resources, escalation)
│   │   ├── sensors.ts            # Sensor network + anomaly detection tools
│   │   └── weather.ts            # Weather forecast + river discharge + soil moisture tools
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

### Spatial Features (ArcGIS FeatureServer)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/features/defences` | Flood defence infrastructure (walls, embankments, barriers) | 24 hours |
| `GET` | `/api/features/historic-floods` | Recorded historic flood outlines | 24 hours |
| `GET` | `/api/features/main-rivers` | Statutory main rivers (polylines) | 24 hours |
| `GET` | `/api/features/risk/:layer` | GeoJSON polygons for one of 6 risk layers (`risk-rivers-sea`, `risk-surface-water`, `flood-zone-2`, `flood-zone-3`, `reservoir-dry`, `reservoir-wet`) | 5 min |

**Query param:** `bbox` (xmin,ymin,xmax,ymax in WGS84, required for `risk/:layer`).

---

### National River Flow Archive (UKCEH)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/nrfa/stations` | All NRFA gauging stations (~1,500+) | 24 hours |

---

### IMD Deprivation (MHCLG 2019)

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/api/imd` | LSOA polygons with IMD 2019 scores for a map bbox (joined from ONS FeatureServer) | 5 min |
| `GET` | `/api/imd/summary` | Aggregate IMD stats (count, mean score/decile distribution) | 1 hour |
| `GET` | `/api/imd/lsoa/:code` | Single LSOA lookup by code (e.g. `E01000001`) | 1 hour |

**Query params:** `bbox` (xmin,ymin,xmax,ymax in WGS84, required for bbox query); clamped to UK extent.  
**Fields returned per LSOA:** overall IMD score/rank/decile + 7 domain scores (income, employment, education, health, crime, barriers, living environment) + total population.

---

### Tile Proxies

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tiles/os/:style/:z/:x/:y.png` | OS Maps raster tile proxy (styles: `Light_3857`, `Road_3857`, `Outdoor_3857`) |
| `GET` | `/api/tiles/ea/:service/:z/:x/:y` | EA ArcGIS MapServer tile proxy (transparent 1×1 PNG fallback on upstream failure) |

**Requires:** `OS_API_KEY` for OS tiles.

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
| `GET` | `/api/datasets/waterbody-catchments` | WFD River Water Body Catchments Cycle 2 GeoJSON (BNG→WGS84, 6,503 polygons) | `floodwaterbody/` |
| `GET` | `/api/datasets/nfm-hotspots` | Natural Flood Management opportunity hotspot polygons (857 features) | `floodheatmap/` |
| `GET` | `/api/datasets/schools` | State-funded schools (24,402 geocoded points) | `schools/` |
| `GET` | `/api/datasets/hospitals` | CQC-registered health & care providers (1,259 geocoded points) | `hospitals/` |
| `GET` | `/api/datasets/bathing-waters` | EA designated bathing waters with rBWD classification (460 points) | `bathing/` |
| `GET` | `/api/datasets/ramsar` | Ramsar Convention wetland sites — England (1,291 polygon features) | `ramsar/` |
| `GET` | `/api/datasets/water-company-boundaries` | Ofwat water company service area boundaries (432 polygons, 27 companies) | `waterboundaries/` |
| `GET` | `/api/datasets/edm-overflows` | EDM Storm Overflows 2024 discharge points (16,625 points, 11 companies) | `stormoverflow/` |
| `GET` | `/api/datasets/winep-overflows` | WINEP Storm Overflows Under Investigation (4,320 points, 10 companies) | `currentstormoverflow/` |

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
| 4 | **Defra / EA ArcGIS Online** | `services.arcgis.com`, `services-eu1.arcgis.com`, `services1.arcgis.com`, `services7.arcgis.com` | None | Flood defences, historic outlines, main rivers; + 6 risk polygon layers (rivers/sea, surface water, flood zones 2/3, reservoir dry/wet) via FeatureServer |
| 5 | **EA ArcGIS MapServer (tile proxy)** | `environment.data.gov.uk/arcgis/rest/services` | None | Raster tile proxy at `/api/tiles/ea/` — transparent fallback on upstream failure |
| 6 | **Bluesky AppView** | `api.bsky.app` | None | Public social flood posts via AT Protocol |
| 7 | **NRFA** | `nrfaapps.ceh.ac.uk` | None | National River Flow Archive gauging stations |
| 8 | **Met Office DataHub** | `data.hub.api.metoffice.gov.uk` | API key | Official hourly site-specific forecasts |
| 9 | **Copernicus CDS** | `cds.climate.copernicus.eu` | API key | ERA5-Land reanalysis (temp, precip, soil moisture, snow) |
| 10 | **Ordnance Survey** | `api.os.uk` | API key | Place name search + ZXY tile layers (Light/Road/Outdoor) |

Sources 1–7 are free public APIs requiring no keys. Sources 8–10 require optional API keys for full functionality.

---

## Local Datasets

Sixteen directories in `server/src/dataset/`, loaded into memory at startup:

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

### 7. `imd/` — MHCLG Indices of Multiple Deprivation 2019
- **File:** `imd2019.csv` (MHCLG File 7, 32,844 LSOAs)
- **Processing:** Loaded into a `Map<LSOA11CD, IMDRecord>` at startup for O(1) lookup. Geometry fetched on-demand from ONS Open Geography FeatureServer and merged.
- **Content:** Per-LSOA: overall IMD score/rank/decile + 7 domain scores/deciles (income, employment, education, health, crime, barriers, living environment) + total population.
- **Why:** Powers the IMD Deprivation map layer and `query_imd_deprivation` agent tool to identify compound flood+deprivation vulnerability.

### 8. `floodwaterbody/` — WFD River Water Body Catchments
- **File:** `WFD_River_Water_Body_Catchments_Cycle_2.geojson` (242 MB, EPSG:27700)
- **Processing:** Coordinates converted from BNG to WGS84 via proj4; loaded into memory at startup
- **Content:** 6,503 Cycle 2 river water body catchment polygons
- **Why:** Shows WFD management unit boundaries for water quality and flood risk context

### 9. `floodheatmap/` — NFM Hotspots
- **File:** `NFM_Hotspots.geojson` (WGS84)
- **Content:** 857 natural flood management opportunity hotspot polygons
- **Why:** Highlights areas with high potential for NFM interventions (leaky dams, woodland planting, etc.)

### 10. `schools/` — State-Funded Schools (DfE Edubase)
- **File:** `edubaseallstatefunded20260325.csv` + `postcode-coords.json` (geocoded)
- **Processing:** CSV parsed, postcodes geocoded to lat/lon via external lookup
- **Content:** 24,402 state-funded schools with name, type, phase, local authority, and coordinates
- **Why:** Vulnerability mapping — identifies schools in flood-risk areas

### 11. `hospitals/` — Health & Care Providers (CQC)
- **File:** `18_March_2026_CQC_directory.csv` + `postcode-coords.json` (geocoded)
- **Processing:** CSV parsed (skipping CQC preamble rows), postcodes geocoded
- **Content:** 1,259 hospitals and care providers with name, type, rating, local authority, and coordinates
- **Why:** Vulnerability mapping — identifies healthcare facilities in flood-risk areas

### 12. `bathing/` — EA Bathing Water Quality
- **Files:** `site.csv`, `classifications.csv`, `samples.csv`, `prf.csv`, `as.csv`
- **Processing:** Multiple CSVs joined by bathing water ID; latest rBWD classification extracted
- **Content:** 460 designated bathing waters with coordinates and quality classification (Excellent/Good/Sufficient/Poor)
- **Why:** Environmental quality layer — shows EA-designated bathing water monitoring points

### 13. `ramsar/` — Ramsar Wetlands (England)
- **File:** `Ramsar_England_7440752995595243115.geojson` (60 MB, WGS84)
- **Content:** 1,291 polygon features across 73 Ramsar Convention wetland sites
- **Why:** Conservation overlay — internationally important wetlands sensitive to flooding and water management

### 14. `waterboundaries/` — Ofwat Water Company Boundaries
- **File:** `UC2_263904301232770618.geojson` (WGS84)
- **Content:** 432 water company service area boundary polygons covering 27 companies
- **Why:** Shows regulatory water company jurisdictions for sewerage and water supply context

### 15. `stormoverflow/` — EDM Storm Overflows 2024
- **File:** `Storm_Overflow_EDM_Annual_Returns_2024_-*.geojson` (27 MB, WGS84)
- **Source:** EA / Rivers Trust / CaBA Data Hub
- **Content:** 16,625 monitored storm overflow discharge points from 11 water companies — spill counts, duration, treatment type
- **Why:** Environmental pollution layer — shows how often and how long each CSO discharged in 2024

### 16. `currentstormoverflow/` — WINEP Storm Overflows Under Investigation
- **File:** `Water_Company_Sewer_Storm_Overflow_Under_Investigation.geojson` (10 MB, WGS84)
- **Source:** EA / Rivers Trust / CaBA Data Hub (WINEP v3)
- **Content:** 4,320 intermittent discharge sites under investigation from 10 water companies — action type (Investigation/Monitoring/Implementation/No Deterioration), water body, certainty
- **Why:** Shows planned sewer overflow remediation sites from the Water Industry National Environment Programme

---

## AI Agent System

The server implements a **ReAct supervisor–specialist** multi-agent architecture powered by OpenAI, operating over Server-Sent Events (SSE).

### Agents

| Agent | Model | Max iterations | Tools |
|-------|-------|----------------|-------|
| **Coordinator** (supervisor) | `gpt-5.4` | 10 | 4 department dispatch tools |
| **Forecasting** (worker) | `gpt-5.4-mini` | 5 | 7 (weather, discharge, soil, precipitation, LSTM forecast, atmospheric) |
| **Monitoring** (worker) | `gpt-5.4-mini` | 5 | 5 (sensor network, anomaly detection, live warnings, EA stations, NRFA) |
| **Risk Analysis** (worker) | `gpt-5.4-mini` | 5 | 17 (flood zone, infrastructure, population, ML risk, warning areas, risk areas, LLFA, IMD, WFD catchments, NFM hotspots, storm overflows, schools, hospitals, bathing waters, Ramsar, water company boundaries, EDM overflows, WINEP overflows) |
| **Emergency Response** (worker) | `gpt-5.4-mini` | 5 | 7 (alert generation, evacuation, resources, escalation, defences, historic floods, main rivers) |

### ReAct Loop

1. **Coordinator** receives the user query, decides which specialists to invoke (via OpenAI function calling: `forecasting_department`, `monitoring_department`, `risk_analysis_department`, `emergency_response_department`).
2. Each **specialist** runs its own tool-calling loop (think → act → observe), calling live data tools and returning structured results.
3. Specialist results are returned to the coordinator as `role: 'tool'` messages.
4. Coordinator synthesises all findings into a final natural-language response.
5. A shared **`LlmCallBudget`** (default: 5 LLM calls total, env `MAX_LLM_CALLS`) prevents runaway costs. If exhausted, the coordinator is prompted to synthesise immediately.

All agent events are streamed via SSE using 12 typed `AgentEventType` values (`stream_start`, `query_start`, `agent_start`, `tool_call`, `tool_result`, `llm_call`, `agent_response`, `final_response`, `stream_end`, `error`, etc.).

### A2A Agent Cards

`GET /api/agents` returns 5 A2A-protocol-compliant agent cards (coordinator + 4 workers), each describing model, capabilities, streaming support, and available skills.

**Requires:** `OPENAI_API_KEY` env var.

## ML Models (TensorFlow.js)

Both models are loaded non-blocking at startup via `Promise.allSettled`; server starts and agents degrade to heuristics if loading fails.

### LSTM-PINN — Flood Level Forecasting (`ml/forecasting/model.ts`)
- **Architecture:** LSTM(64, returnSeqs) → Dropout(0.2) → LSTM(32) → Dense(16, relu) → Dense(1)
- **Input:** `[48, 5]` tensor — 48 time steps × 5 features (water level, rainfall, discharge, hour sin/cos)
- **Output:** Next water level (de-normalised); auto-regressive multi-step to 96 steps (24 h, 15-min intervals)
- **Physics-Informed Loss:** MSE + λ×physicsLoss (λ=0.1); physics term penalises predictions violating mass-conservation continuity
- **Confidence:** Degrades linearly from 0.95 (step 1) to 0.30 (step 96); `physicsCheck()` validates Manning’s equation consistency
- **Training:** `data-pipeline.ts` fetches EA readings + Open-Meteo for 10 UK cities; falls back to 64 synthetic flood patterns if < 48 real samples

### GBT-Ensemble — Risk Classification (`ml/risk/model.ts`)
- **Architecture:** Dense(128, relu, L2) → Dropout(0.3) → Dense(64) → Dropout(0.2) → Dense(32) → Dense(5, sigmoid)
- **Input:** 15 features (water level %, trend, rainfall 1h/3h/6h, discharge, soil moisture, flood zone, defence condition/age, flood frequency, pop density, drainage capacity, season, discharge delta)
- **Output:** 5 risk scores in [0,1]: overall, property, infrastructure, life, economic
- **Thresholds:** overall ≥ 0.75 → CRITICAL, ≥ 0.50 → HIGH, ≥ 0.25 → MODERATE, < 0.25 → LOW
- **Warmup:** 200 synthetic risk scenarios, 20 epochs; feature importance via gradient-free perturbation

---

## Configuration

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `3000` | No | HTTP listening port |
| `NODE_ENV` | `development` | No | `production` enables SPA static serving |
| `OPENAI_API_KEY` | — | For agents | GPT models for AI agent system |
| `SUPERVISOR_MODEL` | `gpt-5.4` | No | Override coordinator model |
| `AGENT_MODEL` | `gpt-5.4-mini` | No | Override specialist model |
| `MAX_LLM_CALLS` | `5` | No | Shared LLM call budget per agent session |
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
