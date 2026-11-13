---
tag: fixed
date: 2026-11-13T00:30:00.000Z
title: Custom nodes run as written, durable or inline
link: projects
linkLabel: Open a project
---

A custom node's template now gets the full ctx it declares, so logging or destructuring it no longer fails the run. Each custom node runs as a step with the retries in its node.json, or inline when you switch it in the node's panel.
