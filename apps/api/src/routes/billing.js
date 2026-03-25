import { Router } from 'express';
import { readBilling, resetBilling, summarizeBilling, updateBilling } from '../lib/billing-store.js';

export const billingRouter = Router();

billingRouter.get('/', async (_req, res, next) => {
  try {
    const billing = await readBilling();
    res.json({ ok: true, billing, summary: summarizeBilling(billing) });
  } catch (error) {
    next(error);
  }
});

billingRouter.put('/', async (req, res, next) => {
  try {
    const billing = await updateBilling(req.body ?? {});
    res.json({ ok: true, billing, summary: summarizeBilling(billing) });
  } catch (error) {
    next(error);
  }
});

billingRouter.post('/reset', async (_req, res, next) => {
  try {
    const billing = await resetBilling();
    res.json({ ok: true, billing, summary: summarizeBilling(billing) });
  } catch (error) {
    next(error);
  }
});
