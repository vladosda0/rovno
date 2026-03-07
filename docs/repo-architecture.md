# Rovno Repository Architecture

Rovno uses a **polyrepo architecture**.

Two repositories exist:

## rovno-db

Backend authority.

Contains:
- Supabase migrations
- schema evolution
- RLS policies
- RPC functions
- backend contract generator

Produces:

backend-truth

## rovno

Application repository.

Contains:
- UI
- state management
- domain screens
- integration scaffolding

Consumes:

backend-truth

## backend-truth

A generated contract snapshot describing the backend schema.

It is produced from:

rovno-db/scripts/generate-backend-truth.mjs

It includes:

- schema tables
- relations
- RLS summaries
- RPC definitions
- slice contracts
- generated Supabase types

The folder is **read-only** in the app repo.

## Contract workflow

1. Change backend schema in `rovno-db/supabase/migrations`
2. Regenerate backend truth
3. Sync `backend-truth` into `rovno`
4. Frontend code uses this contract to implement features

## Source-of-truth hierarchy

1. SQL migrations in `rovno-db`
2. generated backend-truth contract
3. frontend adapters
4. UI models
