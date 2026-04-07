---
title: Database
---

# Database

AwaitStep stores all application data — users, projects, workflows, and connections — in a relational database.

## SQLite (default)

SQLite requires zero configuration. When `DATABASE_URL` is unset, AwaitStep creates a SQLite file at `/app/data/awaitstep.db` inside the container.

This is the recommended option for single-node deployments and self-hosted setups where simplicity is more important than horizontal scaling.

```bash
# .env — omit DATABASE_URL entirely
```

Make sure `/app/data` is a persistent Docker volume:

```yaml
volumes:
  - awaitstep_data:/app/data
```

## PostgreSQL

Set `DATABASE_URL` to a standard PostgreSQL connection string:

```bash
DATABASE_URL=postgresql://user:password@host:5432/awaitstep
```

AwaitStep is compatible with any PostgreSQL 14+ server, including managed services like Supabase, Neon, and Railway.

:::tip
If you use Neon or another serverless Postgres provider, prefer a pooled connection string to avoid connection exhaustion.
:::

## Migrations

Database migrations run automatically on startup. You do not need to run any migration commands manually. If a migration fails, the container will exit with a non-zero code — check the logs for details.

## Backups

### SQLite

The database file is a single file at `/app/data/awaitstep.db`. Back it up by copying the file while the application is idle, or use the SQLite backup API:

```bash
# Copy the file out of the Docker volume
docker run --rm \
  -v awaitstep_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/awaitstep.db /backup/awaitstep.db.bak
```

For a consistent snapshot while the app is running, use the SQLite online backup:

```bash
docker exec <container_name> sqlite3 /app/data/awaitstep.db ".backup /app/data/db.backup.sqlite"
```

### PostgreSQL

Use `pg_dump`:

```bash
pg_dump "$DATABASE_URL" > awaitstep_$(date +%Y%m%d).sql
```

Restore with:

```bash
psql "$DATABASE_URL" < awaitstep_20260101.sql
```
