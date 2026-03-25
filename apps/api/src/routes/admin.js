import { Router } from 'express';
import { readAdmin, resetAdmin, summarizeAdmin, updateAdmin } from '../lib/admin-store.js';

export const adminRouter = Router();

adminRouter.get('/', async (_req, res, next) => {
  try {
    const admin = await readAdmin();
    res.json({ ok: true, admin, summary: summarizeAdmin(admin) });
  } catch (error) {
    next(error);
  }
});

adminRouter.put('/', async (req, res, next) => {
  try {
    const admin = await updateAdmin(req.body ?? {});
    res.json({ ok: true, admin, summary: summarizeAdmin(admin) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/reset', async (_req, res, next) => {
  try {
    const admin = await resetAdmin();
    res.json({ ok: true, admin, summary: summarizeAdmin(admin) });
  } catch (error) {
    next(error);
  }
});
