---
tag: improved
date: 2026-11-27T10:00:00.000Z
title: Step code no longer takes a step object
link: projects
linkLabel: See your projects
---

A step's code is now written with env, event, inputs and ctx only, in workflows and functions. A step cannot start another step, so code that calls step.do, step.sleep or step.waitForEvent is refused on save with a message on the step, and the editor no longer suggests it.
