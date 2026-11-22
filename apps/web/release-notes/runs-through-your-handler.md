---
tag: improved
date: 2026-11-22T14:00:00.000Z
title: Runs go through your own handler
link: projects
linkLabel: See your projects
---

When a workflow has a URL of its own (a route, custom domain or workers.dev), Trigger, Run again and the run API now go through its fetch handler, so your own checks run first. The same API can also send an event to a waiting run.
