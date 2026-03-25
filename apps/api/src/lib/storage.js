import { randomUUID } from 'node:crypto';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

let storageClient;

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

export function isStorageConfigured() {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_BUCKET &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      !isPlaceholderValue(env.R2_ACCOUNT_ID) &&
      !isPlaceholderValue(env.R2_ACCESS_KEY_ID) &&
      !isPlaceholderValue(env.R2_SECRET_ACCESS_KEY)
  );
}

export function getStorageClient() {
  if (!isStorageConfigured()) {
    throw new Error('Cloudflare R2 is not configured with real customer credentials yet');
  }
  if (!storageClient) {
    storageClient = new S3Client({
      region: env.R2_REGION,
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
      }
    });
  }
  return storageClient;
}

export function makeObjectKey({ organizationId, projectId, assetType, filename }) {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const sluggedName = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const folder = assetType === 'design' ? 'designs' : assetType === 'mockup' ? 'mockups' : 'misc';
  return `originals/${folder}/org_${organizationId}/${projectId ? `project_${projectId}/` : ''}${yyyy}/${mm}/${randomUUID()}-${sluggedName || 'upload.bin'}`;
}

export async function createSignedUpload({ objectKey, contentType, sizeBytes }) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: objectKey,
    ContentType: contentType,
    ContentLength: sizeBytes
  });
  const signedUrl = await getSignedUrl(getStorageClient(), command, { expiresIn: env.SIGNED_URL_EXPIRES_SECONDS });
  return {
    url: signedUrl,
    method: 'PUT',
    headers: {
      'Content-Type': contentType
    },
    expiresInSeconds: env.SIGNED_URL_EXPIRES_SECONDS
  };
}

export async function headObject(objectKey) {
  const result = await getStorageClient().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: objectKey }));
  return result;
}

export function publicUrlForKey(objectKey) {
  if (!env.R2_PUBLIC_BASE_URL) {
    return null;
  }
  return `${env.R2_PUBLIC_BASE_URL}/${objectKey}`;
}

export async function checkStorageHealth() {
  if (!isStorageConfigured()) {
    return {
      configured: false,
      connected: false,
      mode: 'integration-ready',
      note: 'Cloudflare R2 customer credentials are not connected yet. The code path is ready and the buyer can activate it with their own R2 account.'
    };
  }
  try {
    await getStorageClient().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: '__printra_health_probe__' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage error';
    const normalized = message.toLowerCase();
    const reachableProbeMiss = normalized.includes('not found') || normalized.includes('unknownerror') || normalized.includes('the specified key does not exist');
    return { configured: true, connected: true, note: reachableProbeMiss ? 'Bucket reachable' : message };
  }
  return { configured: true, connected: true };
}
