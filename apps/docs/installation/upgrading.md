---
title: Upgrading
---

# Upgrading

AwaitStep uses the `latest` tag by default. Upgrading is a three-step process: pull the new image, recreate the container, and verify startup.

## Pull and recreate

```bash
docker compose pull awaitstep
docker compose up -d --force-recreate awaitstep
```

Check the logs to confirm the new version started cleanly:

```bash
docker compose logs -f awaitstep
```

Database migrations run automatically on startup. You do not need to run any migration commands manually.

## Pinning to a specific version

Running `latest` always gives you the newest release. If you prefer stability over automatic updates, pin to a specific image tag:

```yaml
# docker-compose.yml
services:
  awaitstep:
    image: ghcr.io/awaitstep/awaitstep:1.4.0
```

Check the [GitHub Container Registry](https://github.com/awaitstep/awaitstep/pkgs/container/awaitstep) for available tags.

To upgrade to a specific version, change the tag and run:

```bash
docker compose pull awaitstep
docker compose up -d --force-recreate awaitstep
```

## Rollback

If the new version has a problem, roll back by restoring the previous image tag and recreating the container.

If you were running `latest` and did not pin a version, you can pull a specific previous tag:

```yaml
image: ghcr.io/awaitstep/awaitstep:1.3.2
```

Then:

```bash
docker compose up -d --force-recreate awaitstep
```

:::warning
Migrations that have already run cannot be automatically reversed. If a new version includes a destructive schema migration, rolling back the image does not undo the migration. Restore from a database backup if you need to fully revert state.
:::

## Before upgrading

Always take a database backup before upgrading to a new major version. See [Database](./database#backups) for backup instructions.
