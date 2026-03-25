import { Router } from 'express';
import { getReadinessSnapshot } from '../config/env.js';

export const connectorsRouter = Router();

connectorsRouter.get('/foundation', (_req, res) => {
  const readiness = getReadinessSnapshot();
  res.json({
    googleDrive: {
      mode: 'planned-import-connector',
      readyForOAuthConfig: readiness.googleDriveConnector
    },
    oneDrive: {
      mode: 'planned-import-connector',
      readyForOAuthConfig: readiness.oneDriveConnector
    }
  });
});
