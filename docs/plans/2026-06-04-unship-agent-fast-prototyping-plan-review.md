# Unship Agent Fast Prototyping Validation Review

**Date:** 2026-06-04
**Reviewed artifact:** `docs/superpowers/specs/2026-06-04-unship-agent-fast-prototyping-design.md`
**Verdict:** APPROVED after changes

## Summary

The design direction is sound: keep Unship small, avoid a broader command surface, and optimize for agent action compression through smarter read-only `doctor` and `check` output.

The first validation pass found wording that could accidentally create extra agent work or false scanner confidence. The spec was updated to address those concerns before implementation planning.

## Self Review

- **Scope:** Clear. The design keeps existing commands and explicitly excludes `prepare`, `wrap`, `keep`, `clean`, and session lifecycle commands.
- **Agent workflow:** Improved after review. The spec now handles greenfield timing, independent multi-round explorations, overlapping explorations, and no-browser default behavior.
- **Scanner risk:** Improved after review. The spec now requires conservative range confidence, uncertain options, and one shared scan result.
- **Cleanup:** Improved after review. The spec now separates settling one group from final cleanup.
- **Compatibility:** Clear. Existing JSON fields must be preserved and new fields must be additive.

## Subagent Validation

### Product/DX Review

**Initial verdict:** CHANGES_REQUESTED

Findings:

- Greenfield startup could run `setup` before any app shell exists.
- Existing exploration handling was too rigid for independent groups or explicit additional rounds.
- Cleanup needed separate "settle group" and "final cleanup" paths.
- Scanner output should not blur the direct-child runtime contract.
- One shared scanner result should feed both old and new JSON shapes.

Resolution:

- Added greenfield setup deferral.
- Made existing exploration blocking conditional on overlap or cleanup/ship intent.
- Added settle-vs-final cleanup language.
- Added direct/uncertain option handling and range confidence.
- Added shared scan-result requirement.

### Technical Implementation Review

**Verdict:** APPROVE

Findings:

- The refactor is implementable with a small shared text scanner extending the current `src/check/index.js` behavior.
- No AST/parser dependency is required.
- Preserve current `doctor --json` fields: `packageName`, `version`, `node`, `project`, `residue`, and `reminder`.
- Preserve current `check --json` fields: `ok` and `diagnostics`.
- Add compatibility tests for additive JSON behavior.

Resolution:

- Added explicit compatibility-field requirements.
- Added tests for JSON compatibility and conservative scanner uncertainty.

### Minimalism/Risk Review

**Initial verdict:** CHANGES_REQUESTED

Findings:

- Approximate line ranges could become false precision.
- `doctor` risked becoming a second `check`.
- Source inspection wording was still open-ended.
- Future cleanup-mutator wording created feature gravity.

Resolution:

- Added `rangeConfidence` and uncertainty rules.
- Made `doctor` summary-only and kept authoritative cleanup in `check`.
- Changed source inspection to target-first expansion.
- Strengthened the no-cleanup-mutator stance for this product phase.

## Rubric

- **Scope:** 2/2
- **Sequencing:** 2/2
- **Verification:** 2/2
- **Risk:** 2/2
- **Total:** 8/8

## Result

The design is ready to become an implementation plan.

Next recommended skill: `superpowers:writing-plans`.
