---
tag: fixed
date: 2026-11-20T09:00:00.000Z
title: Values from earlier steps in HTTP headers
link: projects
linkLabel: Open your projects
---

A value like {{fetch_order.id}} in an HTTP request's URL, headers or query parameters, or in a script call's URL or headers, now sends the real value. Before, it could go out as the literal text. A step name that doesn't exist there is now flagged before you deploy.
