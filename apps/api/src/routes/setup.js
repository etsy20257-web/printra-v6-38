import { Router } from 'express';
import { getReadinessSnapshot } from '../config/env.js';
import { isDatabaseConfigured, query } from '../lib/database.js';
import { applyBootstrapSchema } from '../lib/schema-bootstrap.js';

export const setupRouter = Router();

setupRouter.get('/status', async (_req, res) => {
  res.json({
    databaseConfigured: isDatabaseConfigured(),
    readiness: getReadinessSnapshot(),
    deliveryMode: 'customer-owned-infrastructure'
  });
});

setupRouter.post('/bootstrap-database', async (_req, res, next) => {
  try {
    if (!isDatabaseConfigured()) {
      res.status(503).json({ error: 'DATABASE_URL is not configured' });
      return;
    }
    const result = await applyBootstrapSchema();
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

setupRouter.post('/bootstrap-organization', async (req, res, next) => {
  try {
    if (!isDatabaseConfigured()) {
      res.status(503).json({ error: 'DATABASE_URL is not configured' });
      return;
    }
    const { name, slug, plan = 'starter' } = req.body ?? {};
    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug are required' });
      return;
    }
    const result = await query(
      'insert into organizations (name, slug, plan) values ($1, $2, $3) returning *',
      [name, slug, plan]
    );
    res.status(201).json({ organization: result.rows[0] });
  } catch (error) {
    next(error);
  }
});
