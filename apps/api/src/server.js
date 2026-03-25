import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { studioRouter } from './routes/studio.js';
import { marketIntelligenceRouter } from './routes/market-intelligence.js';
import { automaticAnalysisRouter } from './routes/automatic-analysis.js';
import { setupRouter } from './routes/setup.js';
import { storageRouter } from './routes/storage.js';
import { connectorsRouter } from './routes/connectors.js';
import { projectsRouter } from './routes/projects.js';
import { settingsRouter } from './routes/settings.js';
import { billingRouter } from './routes/billing.js';
import { adminRouter } from './routes/admin.js';
import { exportsRouter } from './routes/exports.js';
import { authRouter } from './routes/auth.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'Printra API', version: '0.2.0', status: 'ok', environment: env.NODE_ENV });
  });

  app.use('/health', healthRouter);
  app.use('/setup', setupRouter);
  app.use('/storage', storageRouter);
  app.use('/connectors', connectorsRouter);
  app.use('/studio', studioRouter);
  app.use('/automatic-analysis', automaticAnalysisRouter);
  app.use('/projects', projectsRouter);
  app.use('/settings', settingsRouter);
  app.use('/billing', billingRouter);
  app.use('/admin', adminRouter);
  app.use('/auth', authRouter);
  app.use('/exports', exportsRouter);
  app.use('/market-intelligence', marketIntelligenceRouter);

  app.use((error, _req, res, _next) => {
    console.error('[printra-api-error]', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown server error' });
  });

  return app;
}
