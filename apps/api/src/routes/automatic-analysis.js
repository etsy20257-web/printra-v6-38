import { Router } from 'express';
import { z } from 'zod';
import { runAutomaticAnalysis } from '../lib/automatic-analysis/engine.js';
import { listAutomaticAnalysisSnapshots, saveAutomaticAnalysisSnapshot } from '../lib/automatic-analysis/persistence.js';
import { buildAutomaticAnalysisPayloadFromExtension } from '../lib/extension/etsy-extractors.js';
import { getExtensionStatus, updateExtensionStatus } from '../lib/extension/status-store.js';

export const automaticAnalysisRouter = Router();


const extensionStatusSchema = z.object({
  browser: z.string().optional().default('unknown'),
  pageType: z.enum(['listing', 'shop', 'etsy', 'unknown']).optional().default('unknown'),
  extensionVersion: z.string().optional().default('0.0.0'),
  installSource: z.string().optional().default('unknown'),
  installationId: z.string().optional().default(''),
  listingUrl: z.string().optional().default(''),
  shopUrl: z.string().optional().default('')
});

const extensionIngestSchema = z.object({
  browser: z.string().optional().default('unknown'),
  installSource: z.string().optional().default('unknown'),
  installationId: z.string().optional().default(''),
  extensionVersion: z.string().optional().default('0.0.0'),
  listing: z.record(z.any()).optional().default({}),
  shop: z.record(z.any()).optional().default({}),
  listingUrl: z.string().optional().default(''),
  storeUrl: z.string().optional().default(''),
  saveToAnalytics: z.boolean().optional().default(true)
});

const requestSchema = z.object({
  mode: z.enum(['url', 'paste', 'manual', 'csv']).default('paste'),
  listingUrl: z.string().optional().default(''),
  storeUrl: z.string().optional().default(''),
  listingText: z.string().optional().default(''),
  storeText: z.string().optional().default(''),
  manualTitle: z.string().optional().default(''),
  manualPrice: z.union([z.string(), z.number()]).optional().default(''),
  manualDescription: z.string().optional().default(''),
  manualKeywords: z.string().optional().default(''),
  manualRating: z.union([z.string(), z.number()]).optional().default(''),
  manualReviewCount: z.union([z.string(), z.number()]).optional().default(''),
  manualSalesCount: z.union([z.string(), z.number()]).optional().default(''),
  manualImageCount: z.union([z.string(), z.number()]).optional().default(''),
  manualVariationCount: z.union([z.string(), z.number()]).optional().default(''),
  manualProductCount: z.union([z.string(), z.number()]).optional().default(''),
  csvText: z.string().optional().default(''),
  saveToAnalytics: z.boolean().optional().default(false)
});

automaticAnalysisRouter.post('/analyze', async (req, res, next) => {
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = runAutomaticAnalysis(parsed.data);
    const response = { ...data };
    if (parsed.data.saveToAnalytics) {
      response.savedSnapshot = await saveAutomaticAnalysisSnapshot(data);
    }
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

automaticAnalysisRouter.post('/save', async (req, res, next) => {
  const parsed = requestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = runAutomaticAnalysis(parsed.data);
    const savedSnapshot = await saveAutomaticAnalysisSnapshot(data);
    return res.json({ ok: true, savedSnapshot });
  } catch (error) {
    return next(error);
  }
});

automaticAnalysisRouter.get('/history', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 12);
    const snapshots = await listAutomaticAnalysisSnapshots(limit);
    return res.json({ snapshots });
  } catch (error) {
    return next(error);
  }
});


automaticAnalysisRouter.get('/extension-status', (_req, res) => {
  return res.json(getExtensionStatus());
});

automaticAnalysisRouter.post('/extension-status', (req, res) => {
  const parsed = extensionStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const status = updateExtensionStatus(parsed.data);
  return res.json({ ok: true, status });
});

automaticAnalysisRouter.post('/extension-ingest', async (req, res, next) => {
  const parsed = extensionIngestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    updateExtensionStatus({
      browser: parsed.data.browser,
      pageType: parsed.data.shop?.url ? 'shop' : parsed.data.listing?.url ? 'listing' : 'etsy',
      extensionVersion: parsed.data.extensionVersion,
      installSource: parsed.data.installSource,
      installationId: parsed.data.installationId,
      listingUrl: parsed.data.listingUrl || parsed.data.listing?.url || '',
      shopUrl: parsed.data.storeUrl || parsed.data.shop?.url || ''
    });

    const automaticPayload = buildAutomaticAnalysisPayloadFromExtension({
      listing: parsed.data.listing,
      shop: parsed.data.shop,
      listingUrl: parsed.data.listingUrl,
      storeUrl: parsed.data.storeUrl
    });
    const data = runAutomaticAnalysis(automaticPayload);
    const response = { ...data, source: 'extension' };
    if (parsed.data.saveToAnalytics) {
      response.savedSnapshot = await saveAutomaticAnalysisSnapshot(data);
    }
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});
