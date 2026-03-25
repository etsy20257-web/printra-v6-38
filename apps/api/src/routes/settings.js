import { Router } from 'express';
import { readSettings, resetSettings, summarizeSettings, updateSettings } from '../lib/settings-store.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res, next) => {
  try {
    const settings = await readSettings();
    res.json({ ok: true, settings, summary: summarizeSettings(settings) });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/', async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body ?? {});
    res.json({ ok: true, settings, summary: summarizeSettings(settings) });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post('/reset', async (_req, res, next) => {
  try {
    const settings = await resetSettings();
    res.json({ ok: true, settings, summary: summarizeSettings(settings) });
  } catch (error) {
    next(error);
  }
});
