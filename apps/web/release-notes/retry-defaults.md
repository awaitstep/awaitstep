---
tag: improved
date: 2026-11-11T13:40:00.000Z
title: Retries default to two, five seconds apart
link: projects
linkLabel: Open a workflow
---

Steps and durable HTTP calls now retry twice, five seconds apart, instead of Cloudflare's five retries ten seconds apart, so a failing call settles sooner. A node that sets its own retry limit or delay keeps it.
