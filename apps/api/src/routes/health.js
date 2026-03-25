import { Router } from 'express';
import { getIntegrationNotes, getReadinessSnapshot } from '../config/env.js';
import { checkDatabaseHealth } from '../lib/database.js';
import { checkStorageHealth } from '../lib/storage.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const [database, storage] = await Promise.all([checkDatabaseHealth(), checkStorageHealth()]);
  res.json({
    api: 'healthy',
    time: new Date().toISOString(),
    deliveryMode: 'customer-owned-infrastructure',
    readiness: getReadinessSnapshot(),
    integrationNotes: getIntegrationNotes(),
    services: {
      webShell: 'linked',
      worker: 'linked',
      database,
      storage
    }
  });
});
