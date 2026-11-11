---
tag: improved
date: 2026-11-11T13:40:00.000Z
title: Retries default to two, five seconds apart
link: projects
linkLabel: Open a workflow
---

A new step or durable HTTP call starts with 2 retries, 5 seconds apart, instead of 5 and 10 seconds, so a failing call settles sooner. A node that sets its own retry limit or delay keeps it.
