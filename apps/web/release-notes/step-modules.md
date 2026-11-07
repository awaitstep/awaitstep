---
tag: improved
date: 2026-11-07T12:00:00.000Z
title: A step is the module the worker calls
link: projects
linkLabel: See your projects
---

A step's code is now the whole module: export default async function, named after the step, with env, event, inputs, step and ctx as its parameters. The file you edit is the file the worker imports, so there is nothing wrapped around your code any more. Earlier steps are read explicitly, as inputs.sample_step, and the panel lists them under the editor. A step inside a branch, try, loop or parallel arm is a module like any other, with its own file, Quick test and Returned as row; a loop body reads inputs.item and inputs.index, a catch arm reads inputs.error, and what a loop body step returns becomes the loop's value. Renaming a step renames its function; a function named otherwise is refused on save. Steps saved before this open as modules automatically.
