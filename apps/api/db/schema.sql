create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  order_index integer not null default 0,
  width integer not null default 2000,
  height integer not null default 2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists library_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('mockup','design','brand','other')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  library_section_id uuid references library_sections(id) on delete set null,
  type text not null check (type in ('mockup','design','export','misc')),
  title text not null,
  status text not null default 'pending' check (status in ('pending','uploaded','processed','failed')),
  mime_type text,
  file_size bigint,
  checksum text,
  width integer,
  height integer,
  source_type text not null default 'internal' check (source_type in ('internal','google_drive','onedrive')),
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asset_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  variant_type text not null check (variant_type in ('original','thumbnail','preview','export')),
  storage_provider text not null default 'r2',
  bucket_name text not null,
  object_key text not null,
  content_type text,
  bytes bigint,
  width integer,
  height integer,
  public_url text,
  created_at timestamptz not null default now(),
  unique(asset_id, variant_type)
);

create table if not exists upload_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  asset_id uuid not null references assets(id) on delete cascade,
  object_key text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  status text not null default 'prepared' check (status in ('prepared','uploaded','failed')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  format text not null check (format in ('png','jpg','pdf','zip')),
  transparent boolean not null default false,
  scope text not null check (scope in ('selected','all')),
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists export_files (
  id uuid primary key default gen_random_uuid(),
  export_job_id uuid not null references export_jobs(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  stage_id uuid references project_stages(id) on delete set null,
  file_type text not null,
  object_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists storage_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('google_drive','onedrive')),
  status text not null default 'planned',
  external_email text,
  external_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, provider)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  actor_label text,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_organization_id on projects(organization_id);
create index if not exists idx_assets_organization_id on assets(organization_id);
create index if not exists idx_assets_project_id on assets(project_id);
create index if not exists idx_upload_sessions_organization_id on upload_sessions(organization_id);
create index if not exists idx_export_jobs_project_id on export_jobs(project_id);
