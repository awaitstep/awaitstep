---
tag: improved
date: 2026-11-15T21:00:00.000Z
title: Stricter script protection on dashboard pages
link: projects
linkLabel: See your projects
---

Dashboard pages now run only the scripts the app itself serves, which blocks injected scripts. Quick test runs steps on a page of its own, so a step's calls to outside APIs still work.
