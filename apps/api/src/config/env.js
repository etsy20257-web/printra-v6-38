import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_REGION: z.string().min(1).default('auto'),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  SIGNED_URL_EXPIRES_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
  ONEDRIVE_CLIENT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[printra-api] invalid environment configuration');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

function sanitizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isPlaceholderValue(value) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('your-') ||
    normalized.startsWith('buraya') ||
    normalized.includes('example.com') ||
    normalized.includes('placeholder')
  );
}

function sanitizeOptionalUrl(value) {
  const sanitized = sanitizeOptionalString(value);
  if (!sanitized || isPlaceholderValue(sanitized)) {
    return undefined;
  }
  try {
    return new URL(sanitized).toString().replace(/\/$/, '');
  } catch {
    console.warn('[printra-api] ignoring invalid R2_PUBLIC_BASE_URL value');
    return undefined;
  }
}

const rawEnv = parsed.data;

export const env = {
  ...rawEnv,
  DATABASE_URL: sanitizeOptionalString(rawEnv.DATABASE_URL),
  R2_ACCOUNT_ID: sanitizeOptionalString(rawEnv.R2_ACCOUNT_ID),
  R2_BUCKET: sanitizeOptionalString(rawEnv.R2_BUCKET),
  R2_ACCESS_KEY_ID: sanitizeOptionalString(rawEnv.R2_ACCESS_KEY_ID),
  R2_SECRET_ACCESS_KEY: sanitizeOptionalString(rawEnv.R2_SECRET_ACCESS_KEY),
  R2_PUBLIC_BASE_URL: sanitizeOptionalUrl(rawEnv.R2_PUBLIC_BASE_URL),
  GOOGLE_DRIVE_CLIENT_ID: sanitizeOptionalString(rawEnv.GOOGLE_DRIVE_CLIENT_ID),
  GOOGLE_DRIVE_CLIENT_SECRET: sanitizeOptionalString(rawEnv.GOOGLE_DRIVE_CLIENT_SECRET),
  ONEDRIVE_CLIENT_ID: sanitizeOptionalString(rawEnv.ONEDRIVE_CLIENT_ID),
  ONEDRIVE_CLIENT_SECRET: sanitizeOptionalString(rawEnv.ONEDRIVE_CLIENT_SECRET)
};

export function getReadinessSnapshot() {
  const storage = Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      !isPlaceholderValue(env.R2_ACCOUNT_ID) &&
      !isPlaceholderValue(env.R2_ACCESS_KEY_ID) &&
      !isPlaceholderValue(env.R2_SECRET_ACCESS_KEY)
  );

  return {
    database: Boolean(env.DATABASE_URL),
    storage,
    googleDriveConnector: Boolean(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET),
    oneDriveConnector: Boolean(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET)
  };
}

export function getIntegrationNotes() {
  return {
    storageUsesCustomerOwnedInfra: true,
    liveStorageRequiresCustomerCredentials: !getReadinessSnapshot().storage,
    placeholdersAcceptedInDevelopment: true
  };
}
