---
tag: improved
date: 2026-11-07T18:00:00.000Z
title: Your HTTP entry is a file, and handlers speak AwaitStep
link: projects
linkLabel: See your projects
---

A new function or workflow starts with handlers/fetch.ts in its project, ready to edit, instead of a hidden default. Handlers are written against AwaitStep's own contract (FetchContext, QueueContext and ScheduledContext from #awaitstep/runtime) rather than Cloudflare's parameters, so the same handler deploys to any provider; the generated worker adapts. The graph now lives in a generated awaitstep/function.ts that handlers import, so nothing imports the worker any more. A step's module is its own steps/<id>.ts file; the duplicate under nodes/ is gone.
