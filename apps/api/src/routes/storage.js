import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { isDatabaseConfigured, query, withTransaction } from '../lib/database.js';
import { checkStorageHealth, createSignedUpload, headObject, isStorageConfigured, makeObjectKey, publicUrlForKey } from '../lib/storage.js';
import { createLocalAsset, createLocalSection, deleteLocalAsset, deleteLocalSection, duplicateLocalAsset, getLocalLibrarySummary, listLocalAssets, listLocalSections, updateLocalSection } from '../lib/library/store.js';

export const storageRouter = Router();

function requireDatabase(res) {
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return false;
  }
  return true;
}

function isLocalLibraryMode() {
  return !isDatabaseConfigured();
}

function customerCredentialsError() {
  return {
    error: 'Cloudflare R2 is not configured with real customer credentials yet',
    deliveryMode: 'customer-owned-infrastructure',
    note:
      'The storage integration is ready. The buyer must add their own R2 Account ID, Access Key ID and Secret Access Key to activate live uploads.'
  };
}

storageRouter.get('/foundation', async (req, res, next) => {
  try {
    const storageHealth = await checkStorageHealth();
    const organizationId = typeof req.query.organizationId === 'string' && req.query.organizationId.trim() ? req.query.organizationId.trim() : null;
    const localSummary = organizationId && isLocalLibraryMode() ? await getLocalLibrarySummary(organizationId) : null;
    res.json({
      provider: isLocalLibraryMode() ? 'local-json-foundation' : 'cloudflare-r2',
      configured: isLocalLibraryMode() ? true : isStorageConfigured(),
      bucket: isLocalLibraryMode() ? 'local-library-store' : env.R2_BUCKET ?? null,
      signedUploads: true,
      localUploads: true,
      librarySections: true,
      assetActions: {
        list: true,
        duplicate: true,
        delete: true,
        upload: true
      },
      connectors: {
        googleDrive: 'planned-in-next-phase',
        oneDrive: 'planned-in-next-phase'
      },
      health: isLocalLibraryMode()
        ? { configured: true, connected: true, mode: 'local-json-foundation', note: 'Library runs in local persistence mode until customer database and storage credentials are attached.' }
        : storageHealth,
      summary: localSummary
    });
  } catch (error) {
    next(error);
  }
});

storageRouter.get('/sections', async (req, res, next) => {
  try {
    const { organizationId, kind } = req.query;
    if (!organizationId) {
      res.status(400).json({ error: 'organizationId is required' });
      return;
    }

    if (isLocalLibraryMode()) {
      const sections = await listLocalSections({ organizationId: String(organizationId), kind: kind ? String(kind) : undefined });
      res.json({ sections, mode: 'local-json-foundation' });
      return;
    }

    const params = [organizationId];
    let sql = `select * from library_sections where organization_id = $1`;
    if (kind) {
      params.push(kind);
      sql += ` and kind = $${params.length}`;
    }
    sql += ' order by created_at asc';
    const result = await query(sql, params);
    res.json({ sections: result.rows, mode: 'database' });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/sections', async (req, res, next) => {
  try {
    const { organizationId, kind, name } = req.body ?? {};
    if (!organizationId || !kind || !name) {
      res.status(400).json({ error: 'organizationId, kind and name are required' });
      return;
    }
    if (!['mockup', 'design', 'brand', 'other'].includes(kind)) {
      res.status(400).json({ error: 'kind must be mockup, design, brand or other' });
      return;
    }

    if (isLocalLibraryMode()) {
      const section = await createLocalSection({ organizationId: String(organizationId), kind: String(kind), name: String(name) });
      res.status(201).json({ section, mode: 'local-json-foundation' });
      return;
    }

    const result = await query(
      `insert into library_sections (organization_id, kind, name)
       values ($1,$2,$3)
       returning *`,
      [organizationId, kind, String(name).trim()]
    );
    res.status(201).json({ section: result.rows[0], mode: 'database' });
  } catch (error) {
    next(error);
  }
});

storageRouter.patch('/sections/:sectionId', async (req, res, next) => {
  try {
    const { sectionId } = req.params;
    const { name } = req.body ?? {};
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    if (isLocalLibraryMode()) {
      const section = await updateLocalSection(sectionId, { name: String(name) });
      if (!section) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      res.json({ section, mode: 'local-json-foundation' });
      return;
    }

    const result = await query(
      `update library_sections set name = $2, updated_at = now() where id = $1 returning *`,
      [sectionId, String(name).trim()]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Section not found' });
      return;
    }
    res.json({ section: result.rows[0], mode: 'database' });
  } catch (error) {
    next(error);
  }
});

storageRouter.delete('/sections/:sectionId', async (req, res, next) => {
  try {
    const { sectionId } = req.params;
    if (isLocalLibraryMode()) {
      const deleted = await deleteLocalSection(sectionId);
      if (!deleted) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      res.status(204).send();
      return;
    }

    await withTransaction(async (client) => {
      await client.query(`update assets set library_section_id = null, updated_at = now() where library_section_id = $1`, [sectionId]);
      await client.query(`delete from library_sections where id = $1`, [sectionId]);
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/assets/local-upload', async (req, res, next) => {
  try {
    const { organizationId, projectId = null, librarySectionId = null, assetType, filename, contentType, sizeBytes, previewDataUrl } = req.body ?? {};
    if (!organizationId || !assetType || !filename || !contentType) {
      res.status(400).json({ error: 'organizationId, assetType, filename and contentType are required' });
      return;
    }
    if (!['mockup', 'design', 'misc'].includes(assetType)) {
      res.status(400).json({ error: 'assetType must be mockup, design or misc' });
      return;
    }
    if (typeof previewDataUrl !== 'string' || !previewDataUrl.startsWith('data:')) {
      res.status(400).json({ error: 'previewDataUrl data URI is required for local uploads' });
      return;
    }

    if (isLocalLibraryMode()) {
      const checksum = createHash('sha1').update(`${organizationId}:${assetType}:${filename}:${sizeBytes ?? 0}`).digest('hex');
      const asset = await createLocalAsset({
        organizationId: String(organizationId),
        projectId,
        librarySectionId,
        assetType: String(assetType),
        filename: String(filename),
        title: String(filename),
        contentType: String(contentType),
        sizeBytes: Number(sizeBytes ?? 0),
        previewDataUrl,
        checksum
      });
      res.status(201).json({ asset, mode: 'local-json-foundation' });
      return;
    }

    res.status(409).json({ error: 'Local upload route is reserved for local library mode only' });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/uploads/prepare', async (req, res, next) => {
  try {
    if (!requireDatabase(res)) return;
    if (!isStorageConfigured()) {
      res.status(503).json(customerCredentialsError());
      return;
    }

    const { organizationId, projectId = null, librarySectionId = null, assetType, filename, contentType, sizeBytes } = req.body ?? {};
    if (!organizationId || !assetType || !filename || !contentType || !sizeBytes) {
      res.status(400).json({ error: 'organizationId, assetType, filename, contentType and sizeBytes are required' });
      return;
    }
    if (!['mockup', 'design', 'misc'].includes(assetType)) {
      res.status(400).json({ error: 'assetType must be mockup, design or misc' });
      return;
    }
    if (sizeBytes > env.MAX_UPLOAD_SIZE_BYTES) {
      res.status(413).json({ error: `sizeBytes exceeds MAX_UPLOAD_SIZE_BYTES (${env.MAX_UPLOAD_SIZE_BYTES})` });
      return;
    }

    const objectKey = makeObjectKey({ organizationId, projectId, assetType, filename });
    const assetId = randomUUID();
    const uploadId = randomUUID();
    const checksum = createHash('sha1').update(`${organizationId}:${assetType}:${filename}:${sizeBytes}`).digest('hex');

    await withTransaction(async (client) => {
      await client.query(
        `insert into assets (id, organization_id, project_id, library_section_id, type, title, status, mime_type, file_size, checksum)
         values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)`,
        [assetId, organizationId, projectId, librarySectionId, assetType, filename, contentType, sizeBytes, checksum]
      );
      await client.query(
        `insert into upload_sessions (id, organization_id, project_id, asset_id, object_key, filename, content_type, size_bytes, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'prepared')`,
        [uploadId, organizationId, projectId, assetId, objectKey, filename, contentType, sizeBytes]
      );
      await client.query(
        `insert into audit_logs (organization_id, actor_label, action, entity_type, entity_id, payload)
         values ($1,'system','upload.prepare','asset',$2,$3::jsonb)`,
        [organizationId, assetId, JSON.stringify({ filename, objectKey, assetType, sizeBytes, checksum })]
      );
    });

    const signedUpload = await createSignedUpload({ objectKey, contentType, sizeBytes });
    res.status(201).json({
      uploadId,
      assetId,
      objectKey,
      checksum,
      signedUpload
    });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/uploads/finalize', async (req, res, next) => {
  try {
    if (!requireDatabase(res)) return;
    if (!isStorageConfigured()) {
      res.status(503).json(customerCredentialsError());
      return;
    }

    const { uploadId } = req.body ?? {};
    if (!uploadId) {
      res.status(400).json({ error: 'uploadId is required' });
      return;
    }

    const uploadResult = await query('select * from upload_sessions where id = $1 limit 1', [uploadId]);
    const uploadSession = uploadResult.rows[0];
    if (!uploadSession) {
      res.status(404).json({ error: 'Upload session not found' });
      return;
    }

    const objectHead = await headObject(uploadSession.object_key);
    await withTransaction(async (client) => {
      await client.query(`update upload_sessions set status = 'uploaded', finalized_at = now() where id = $1`, [uploadId]);
      await client.query(
        `update assets
         set status = 'uploaded', mime_type = $2, file_size = $3, updated_at = now()
         where id = $1`,
        [uploadSession.asset_id, objectHead.ContentType ?? uploadSession.content_type, Number(objectHead.ContentLength ?? uploadSession.size_bytes)]
      );
      await client.query(
        `insert into asset_variants (asset_id, variant_type, storage_provider, bucket_name, object_key, content_type, bytes, public_url)
         values ($1,'original','r2',$2,$3,$4,$5,$6)
         on conflict (asset_id, variant_type)
         do update set object_key = excluded.object_key, content_type = excluded.content_type, bytes = excluded.bytes, public_url = excluded.public_url`,
        [
          uploadSession.asset_id,
          env.R2_BUCKET,
          uploadSession.object_key,
          objectHead.ContentType ?? uploadSession.content_type,
          Number(objectHead.ContentLength ?? uploadSession.size_bytes),
          publicUrlForKey(uploadSession.object_key)
        ]
      );
      await client.query(
        `insert into audit_logs (organization_id, actor_label, action, entity_type, entity_id, payload)
         values ($1,'system','upload.finalize','asset',$2,$3::jsonb)`,
        [uploadSession.organization_id, uploadSession.asset_id, JSON.stringify({ objectKey: uploadSession.object_key })]
      );
    });

    const assetResult = await query(
      `select a.*, av.object_key, av.public_url
       from assets a
       left join asset_variants av on av.asset_id = a.id and av.variant_type = 'original'
       where a.id = $1`,
      [uploadSession.asset_id]
    );

    res.json({ asset: assetResult.rows[0] });
  } catch (error) {
    next(error);
  }
});

storageRouter.get('/assets', async (req, res, next) => {
  try {
    const { organizationId, type, status, sectionId, q } = req.query;
    if (!organizationId) {
      res.status(400).json({ error: 'organizationId is required' });
      return;
    }

    if (isLocalLibraryMode()) {
      const assets = await listLocalAssets({ organizationId: String(organizationId), type: type ? String(type) : undefined, status: status ? String(status) : undefined, sectionId: sectionId ? String(sectionId) : undefined, q: q ? String(q) : undefined });
      res.json({ assets, mode: 'local-json-foundation' });
      return;
    }

    const params = [organizationId];
    let sql = `select a.*, av.object_key, av.public_url
      from assets a
      left join asset_variants av on av.asset_id = a.id and av.variant_type = 'original'
      where a.organization_id = $1`;
    if (type) {
      params.push(type);
      sql += ` and a.type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` and a.status = $${params.length}`;
    }
    if (sectionId) {
      params.push(sectionId);
      sql += ` and a.library_section_id = $${params.length}`;
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      sql += ` and a.title ilike $${params.length}`;
    }
    sql += ' order by a.created_at desc limit 200';
    const result = await query(sql, params);
    res.json({ assets: result.rows, mode: 'database' });
  } catch (error) {
    next(error);
  }
});

storageRouter.post('/assets/:assetId/duplicate', async (req, res, next) => {
  try {
    const { assetId } = req.params;
    if (isLocalLibraryMode()) {
      const asset = await duplicateLocalAsset(assetId);
      if (!asset) {
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      res.status(201).json({ asset, mode: 'local-json-foundation' });
      return;
    }
    const result = await query(
      `select a.*, av.object_key, av.public_url, av.bucket_name, av.content_type as variant_content_type, av.bytes as variant_bytes
       from assets a
       left join asset_variants av on av.asset_id = a.id and av.variant_type = 'original'
       where a.id = $1
       limit 1`,
      [assetId]
    );
    const asset = result.rows[0];
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const newAssetId = randomUUID();
    await withTransaction(async (client) => {
      await client.query(
        `insert into assets (id, organization_id, project_id, library_section_id, type, title, status, mime_type, file_size, checksum, width, height, source_type, source_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          newAssetId,
          asset.organization_id,
          asset.project_id,
          asset.library_section_id,
          asset.type,
          `${asset.title} Copy`,
          asset.status,
          asset.mime_type,
          asset.file_size,
          asset.checksum,
          asset.width,
          asset.height,
          asset.source_type,
          asset.source_ref
        ]
      );
      if (asset.object_key) {
        await client.query(
          `insert into asset_variants (asset_id, variant_type, storage_provider, bucket_name, object_key, content_type, bytes, public_url)
           values ($1,'original','r2',$2,$3,$4,$5,$6)`,
          [newAssetId, asset.bucket_name ?? env.R2_BUCKET ?? 'pending-customer-r2', asset.object_key, asset.variant_content_type ?? asset.mime_type, asset.variant_bytes ?? asset.file_size, asset.public_url]
        );
      }
      await client.query(
        `insert into audit_logs (organization_id, actor_label, action, entity_type, entity_id, payload)
         values ($1,'system','asset.duplicate','asset',$2,$3::jsonb)`,
        [asset.organization_id, newAssetId, JSON.stringify({ sourceAssetId: assetId })]
      );
    });

    const duplicated = await query(
      `select a.*, av.object_key, av.public_url
       from assets a
       left join asset_variants av on av.asset_id = a.id and av.variant_type = 'original'
       where a.id = $1`,
      [newAssetId]
    );
    res.status(201).json({ asset: duplicated.rows[0] });
  } catch (error) {
    next(error);
  }
});

storageRouter.delete('/assets/:assetId', async (req, res, next) => {
  try {
    const { assetId } = req.params;
    if (isLocalLibraryMode()) {
      const asset = await deleteLocalAsset(assetId);
      if (!asset) {
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      res.status(204).send();
      return;
    }
    const existing = await query(`select id, organization_id from assets where id = $1 limit 1`, [assetId]);
    const asset = existing.rows[0];
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    await query(`delete from assets where id = $1`, [assetId]);
    await query(
      `insert into audit_logs (organization_id, actor_label, action, entity_type, entity_id, payload)
       values ($1,'system','asset.delete','asset',$2,$3::jsonb)`,
      [asset.organization_id, assetId, JSON.stringify({ hardDelete: false, note: 'Database record removed. Underlying object cleanup is reserved for worker phase.' })]
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
