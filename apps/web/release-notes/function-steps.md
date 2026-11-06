---
tag: improved
date: 2026-11-06T16:00:00.000Z
title: Steps in a function work like steps in a workflow
link: projects
linkLabel: See your projects
---

A step in a function now runs as a step: what it returns is its value, the next steps can use it, and the retries and timeout you set on it apply. Before, its code was pasted in as is, so a return ended the whole function. Top-level steps also get their own file in the Code view. If a function relied on a step ending the run, or on a const one step declared for a later one, return the value instead or mark that step as inline to keep the old behaviour.
