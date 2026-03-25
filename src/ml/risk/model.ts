// ─── FloodMAS — Gradient-Boosted Ensemble Risk Model ─────────────────
// TensorFlow.js dense network approximating XGBoost-style ensemble
// for multi-dimensional flood risk scoring.
// 5 outputs: overall, property, infrastructure, life, economic risk (0–1).

import * as tf from '@tensorflow/tfjs';
import { logger } from '../../logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Architecture ─────────────────────────────────────────────────────

export const NUM_RISK_FEATURES = 15;
const RISK_OUTPUTS = 5;    // overall, property, infrastructure, life, economic
const LEARNING_RATE = 0.001;

const OUTPUT_LABELS = ['overall', 'property', 'infrastructure', 'life', 'economic'] as const;

export type RiskScores = Record<typeof OUTPUT_LABELS[number], number>;
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

// ── Normalisation defaults ───────────────────────────────────────────

export interface RiskNormParams {
  min: number[];
  max: number[];
}

const DEFAULT_NORM: RiskNormParams = {
  min: [0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -50],
  max: [150, 1, 50, 100, 200, 500, 100, 3, 1, 100, 30, 10_000_000, 1, 1, 200],
};

let normParams: RiskNormParams = { ...DEFAULT_NORM };

// ── Model singleton ──────────────────────────────────────────────────

let model: tf.Sequential | null = null;
let modelReady = false;

function weightsDir() {
  return join(__dirname, 'weights');
}

function buildModel(): tf.Sequential {
  const m = tf.sequential();

  m.add(tf.layers.dense({
    units: 128,
    activation: 'relu',
    inputShape: [NUM_RISK_FEATURES],
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  m.add(tf.layers.dropout({ rate: 0.3 }));

  m.add(tf.layers.dense({
    units: 64,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
  }));
  m.add(tf.layers.dropout({ rate: 0.2 }));

  m.add(tf.layers.dense({
    units: 32,
    activation: 'relu',
  }));

  m.add(tf.layers.dense({
    units: RISK_OUTPUTS,
    activation: 'sigmoid',  // all outputs in [0, 1]
  }));

  m.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'meanSquaredError',
    metrics: ['mse'],
  });

  return m;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Load/initialise the risk scoring model.
 */
export async function loadRiskModel(): Promise<boolean> {
  model = buildModel();

  const wDir = weightsDir();
  const modelPath = join(wDir, 'model.json');

  if (existsSync(modelPath)) {
    try {
      const loaded = await tf.loadLayersModel(`file://${modelPath}`);
      model.setWeights(loaded.getWeights());
      loaded.dispose();
      modelReady = true;
      logger.info('🧠 Risk GBT-Ensemble model loaded from saved weights');
      return true;
    } catch (err) {
      logger.warn({ err }, 'Failed to load risk model weights — using fresh model');
    }
  }

  await warmup();
  modelReady = true;
  logger.info('🧠 Risk GBT-Ensemble model initialised with synthetic baseline');
  return false;
}

/** Warm up with synthetic risk scenarios */
async function warmup() {
  if (!model) return;
  const samples = 200;
  const xs: number[][] = [];
  const ys: number[][] = [];

  for (let s = 0; s < samples; s++) {
    // Generate a random risk scenario
    const waterPct = Math.random() * 150;            // 0-150% of flood threshold
    const trend = (Math.random() - 0.5) * 2;         // -1 to 1
    const rainCurrent = Math.random() * 30;
    const rain3h = rainCurrent + Math.random() * 40;
    const rain6h = rain3h + Math.random() * 60;
    const discharge = Math.random() * 400;
    const soilMoisture = 20 + Math.random() * 60;
    const floodZone = Math.random() * 3;              // 0=zone1, 1=zone2, 2=zone3a, 3=zone3b
    const defenceCondition = Math.random();
    const defenceAge = Math.random() * 80;
    const floodFreq = Math.random() * 20;
    const popDensity = Math.random() * 10_000_000;
    const drainageCap = Math.random();
    const season = (Math.random() - 0.5) * 2;
    const dischargeDelta = (Math.random() - 0.5) * 200;

    const features = [
      waterPct, trend, rainCurrent, rain3h, rain6h, discharge,
      soilMoisture, floodZone, defenceCondition, defenceAge,
      floodFreq, popDensity, drainageCap, season, dischargeDelta,
    ].map((v, i) => normalise(v, i));

    xs.push(features);

    // Generate target risk scores based on logical rules (XGBoost-like)
    const baseRisk = waterPct / 150;
    const rainFactor = Math.min(1, (rainCurrent + rain3h) / 100);
    const defenceFactor = 1 - defenceCondition * 0.5;
    const zoneFactor = floodZone / 3;
    const overall = Math.min(1, (baseRisk * 0.35 + rainFactor * 0.25 + zoneFactor * 0.2 + defenceFactor * 0.2) * (1 + trend * 0.15));
    const property = Math.min(1, overall * (0.8 + zoneFactor * 0.3));
    const infrastructure = Math.min(1, overall * defenceFactor * 1.1);
    const life = Math.min(1, overall * (waterPct > 100 ? 0.8 : 0.3) * (1 + dischargeDelta / 400));
    const economic = Math.min(1, overall * (popDensity / 10_000_000) * 1.5);

    ys.push([
      clamp(overall + (Math.random() - 0.5) * 0.1),
      clamp(property + (Math.random() - 0.5) * 0.08),
      clamp(infrastructure + (Math.random() - 0.5) * 0.08),
      clamp(life + (Math.random() - 0.5) * 0.06),
      clamp(economic + (Math.random() - 0.5) * 0.08),
    ]);
  }

  const xTensor = tf.tensor2d(xs);
  const yTensor = tf.tensor2d(ys);

  await model.fit(xTensor, yTensor, {
    epochs: 20,
    batchSize: 32,
    shuffle: true,
    verbose: 0,
  });

  xTensor.dispose();
  yTensor.dispose();
}

/**
 * Predict flood risk scores from a 15-feature input vector.
 */
export function predictRisk(
  features: number[],
): { scores: RiskScores; riskLevel: RiskLevel; confidence: number; featureImportance: { feature: string; weight: number }[] } {
  if (!model || !modelReady) throw new Error('Risk model not loaded');

  if (features.length !== NUM_RISK_FEATURES) {
    throw new Error(`Expected ${NUM_RISK_FEATURES} features, got ${features.length}`);
  }

  const normFeatures = features.map((v, i) => normalise(v, i));
  const inputTensor = tf.tensor2d([normFeatures]);
  const predTensor = model.predict(inputTensor) as tf.Tensor;
  const values = predTensor.dataSync();
  inputTensor.dispose();
  predTensor.dispose();

  const scores: RiskScores = {
    overall: +values[0].toFixed(3),
    property: +values[1].toFixed(3),
    infrastructure: +values[2].toFixed(3),
    life: +values[3].toFixed(3),
    economic: +values[4].toFixed(3),
  };

  const riskLevel: RiskLevel =
    scores.overall >= 0.75 ? 'CRITICAL' :
    scores.overall >= 0.50 ? 'HIGH' :
    scores.overall >= 0.25 ? 'MODERATE' : 'LOW';

  // Approximate feature importance via gradient-free perturbation
  const featureImportance = computeFeatureImportance(normFeatures);

  // Confidence based on how decisive the model is (distance from decision boundary)
  const distances = [0.25, 0.50, 0.75].map(t => Math.abs(scores.overall - t));
  const confidence = +(0.7 + Math.min(...distances) * 0.6).toFixed(3);

  return { scores, riskLevel, confidence: Math.min(confidence, 0.97), featureImportance };
}

/** Fine-tune on real data */
export async function trainRiskModel(
  features: number[][],
  labels: number[][],
  epochs = 5,
): Promise<{ loss: number }> {
  if (!model) throw new Error('Risk model not initialised');

  const normFeatures = features.map(row => row.map((v, i) => normalise(v, i)));
  const xTensor = tf.tensor2d(normFeatures);
  const yTensor = tf.tensor2d(labels);

  const history = await model.fit(xTensor, yTensor, {
    epochs,
    batchSize: Math.min(32, features.length),
    shuffle: true,
    verbose: 0,
  });

  xTensor.dispose();
  yTensor.dispose();

  const loss = (history.history.loss as number[]).at(-1) ?? 0;
  await saveWeights();
  logger.info({ loss, epochs, samples: features.length }, '🧠 Risk model fine-tuned');
  return { loss };
}

// ── Feature importance approximation ─────────────────────────────────

const FEATURE_NAMES = [
  'water_level_pct', 'water_level_trend', 'rainfall_current', 'rainfall_3h',
  'rainfall_6h', 'river_discharge', 'soil_moisture', 'flood_zone',
  'defence_condition', 'defence_age', 'flood_frequency', 'population',
  'drainage_capacity', 'season', 'discharge_delta',
];

function computeFeatureImportance(
  normFeatures: number[],
): { feature: string; weight: number }[] {
  if (!model) return [];

  const baseline = model.predict(tf.tensor2d([normFeatures])) as tf.Tensor;
  const baseVal = baseline.dataSync()[0];
  baseline.dispose();

  const importance: { feature: string; weight: number }[] = [];

  for (let i = 0; i < normFeatures.length; i++) {
    const perturbed = [...normFeatures];
    perturbed[i] = 0; // zero-out this feature
    const predTensor = model.predict(tf.tensor2d([perturbed])) as tf.Tensor;
    const pertVal = predTensor.dataSync()[0];
    predTensor.dispose();
    importance.push({
      feature: FEATURE_NAMES[i] ?? `feature_${i}`,
      weight: +Math.abs(baseVal - pertVal).toFixed(4),
    });
  }

  return importance.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

// ── Internal helpers ─────────────────────────────────────────────────

function normalise(value: number, idx: number): number {
  const min = normParams.min[idx] ?? 0;
  const max = normParams.max[idx] ?? 1;
  const range = max - min || 1;
  return (value - min) / range;
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

async function saveWeights(): Promise<void> {
  if (!model) return;
  const wDir = weightsDir();
  if (!existsSync(wDir)) mkdirSync(wDir, { recursive: true });
  await model.save(`file://${wDir}`);
  writeFileSync(join(wDir, 'norm.json'), JSON.stringify(normParams));
}

export function isModelReady(): boolean {
  return modelReady;
}
