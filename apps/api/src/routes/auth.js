import { Router } from 'express';
import {
  createAuthSessionToken,
  loginAuthUser,
  resolveAuthSession,
  signupAuthUser,
  toAuthErrorPayload
} from '../lib/auth-store.js';

export const authRouter = Router();

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  if (typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return '';
}

authRouter.post('/signup', async (req, res) => {
  try {
    const user = await signupAuthUser(req.body ?? {});
    const session = createAuthSessionToken(user);
    res.status(201).json({
      ok: true,
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
        user
      }
    });
  } catch (error) {
    const failure = toAuthErrorPayload(error, 'Signup could not be completed.');
    res.status(failure.status).json(failure.body);
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const user = await loginAuthUser(req.body ?? {});
    const session = createAuthSessionToken(user);
    res.json({
      ok: true,
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
        user
      }
    });
  } catch (error) {
    const failure = toAuthErrorPayload(error, 'Login request failed.');
    res.status(failure.status).json(failure.body);
  }
});

authRouter.get('/session', async (req, res) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ ok: false, code: 'token_missing', error: 'Session token is missing.' });
      return;
    }

    const session = await resolveAuthSession(token);
    if (!session) {
      res.status(401).json({ ok: false, code: 'session_invalid', error: 'Session is invalid or expired.' });
      return;
    }

    res.json({
      ok: true,
      session
    });
  } catch {
    res.status(500).json({ ok: false, code: 'session_check_failed', error: 'Session check failed.' });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
