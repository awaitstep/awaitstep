---
tag: fixed
date: 2026-11-14T12:00:00.000Z
title: Arms that skip straight to a shared step
link: projects
linkLabel: See your projects
---

An arm of a branch, loop, wait or other container that leads straight into a step another path also reaches is now flagged on the canvas and refused on save and deploy, because that step would only run on one path. Add a step to that arm first. Existing workflows with this shape need that change before their next save.
