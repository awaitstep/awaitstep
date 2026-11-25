---
tag: fixed
date: 2026-11-25T13:00:00.000Z
title: Call Function reaches functions with any id
link: projects
linkLabel: Open your projects
---

A Call Function node failed when it ran if the function's id had mixed-case letters or started with a digit. The call now uses the same binding name the deploy creates, and a call to a function that is not bound says which binding is missing.
