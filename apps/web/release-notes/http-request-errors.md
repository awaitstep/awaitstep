---
tag: fixed
date: 2026-11-11T17:00:00.000Z
title: HTTP requests that fail say why
link: projects
linkLabel: Open a workflow
---

An HTTP Request node now fails with a clear message, such as the status and what the server answered, when it gets an error reply or no reply at all. Pages that aren't JSON come back as text. To carry on after a failed request, put the node in a Try/Catch.
