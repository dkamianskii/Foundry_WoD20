# Project

This repository is a heavily modified Foundry VTT game system derived
from WoD V20.

The target rules are defined in docs/RULES_SPEC.md.

Do not assume official WoD V20 rules when RULES_SPEC.md differs from them.

# Architecture

Before modifying a subsystem, identify its complete call chain.

Prefer modifying existing architecture over duplicating systems.

Do not introduce new abstractions unless they solve a concrete problem.

Do not rename unrelated classes, functions, templates, CSS selectors,
or data fields.

# Foundry

Preserve compatibility with the Foundry version declared in system.json.

Do not use deprecated Foundry APIs when an existing supported API
already exists in this repository.

# Game data

Never silently change persisted Actor or Item schema.

If a persisted field changes, document the migration requirement in
docs/MIGRATION.md.

# Project Documentation

Before implementing a feature, read:

- docs/RULES_SPEC.md
- docs/IMPLEMENTATION_STATUS.md
- relevant sections of docs/ARCHITECTURE.md

Do not reimplement mechanics already marked as implemented without first
inspecting their existing implementation.

After completing a feature, update IMPLEMENTATION_STATUS.md with:

- implementation status;
- affected files;
- important architectural decisions;
- remaining work;
- known issues.

RULES_SPEC.md describes desired game behavior and must not be modified merely
to match the implementation.

# Implementation

For each requested feature:

1. identify affected files;
2. explain the proposed implementation;
3. make the smallest coherent change;
4. inspect all call sites;
5. run available tests/checks;
6. review the diff for regressions.

# Scope

Do not "clean up", modernize, rename, or refactor unrelated code.

Do not change game mechanics not explicitly described in RULES_SPEC.md.

# Verification

After changing mechanics, report:
- files modified;
- behavior changed;
- affected callers;
- persisted data changes;
- possible regressions;
- manual Foundry tests required.