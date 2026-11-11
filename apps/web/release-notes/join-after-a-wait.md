---
tag: fixed
date: 2026-11-11T02:00:00.000Z
title: A step after a branch or wait runs on every path
link: projects
linkLabel: Open a workflow
---

When a branch's two paths, or a Wait for Event's on-event and on-timeout paths, joined into one step, the generated workflow got the scope wrong: it could reference a value that only existed on one path, or leave out a value the path did create. That step now runs inside each path, once each, with what that path has.
