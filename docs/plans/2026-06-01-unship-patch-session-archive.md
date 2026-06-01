# Patch-Session Execution Archive

**Date:** 2026-06-01  
**Status:** Archived historical execution.

The previous Unship direction centered on source-backed patch sessions: a local bridge, session state, variant post-images, source writes, reload-based switching, decisions, finalize, abort, and cleanup checks.

That direction is now archived.

The new canonical product direction is:

`docs/superpowers/specs/2026-06-01-unship-instant-picker-prd.md`

The retired implementation and historical 2026-05-31 docs were moved outside this folder:

`/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`

The new product is a hard reset around:

- DOM-local instant switching;
- temporary `data-unship-*` attribute markup;
- no bridge;
- no session engine;
- no confirm/wait loop;
- local-only cleanup;
- a tiny CLI for instructions, snippets, and cleanup scanning.

Historical docs and code should stay in the external archive. New planning and implementation should target the instant picker PRD, technical spec, and implementation plan.
