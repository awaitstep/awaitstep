---
tag: fixed
date: 2026-11-11T01:10:00.000Z
title: A timed-out wait takes its timeout path
link: projects
linkLabel: Open a workflow
---

When a Wait for Event node ran out of time, the run could fail instead of taking its on-timeout path. The generated code now catches the timeout the way Cloudflare documents, and recognises the timeout error in the form a run's step history shows.
