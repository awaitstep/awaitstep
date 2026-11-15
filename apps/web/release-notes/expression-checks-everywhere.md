---
tag: improved
date: 2026-11-15T13:00:00.000Z
title: Expressions are checked as you type
link: projects
linkLabel: See your projects
---

A broken expression in a node's settings, such as an empty "{{}}" or one naming a step that runs later, is now pointed out as you type, on the canvas and in Code. Saving the node waits until it's fixed, and a deploy refuses it. To keep braces as text, put a space after them: "{{ name }}".
