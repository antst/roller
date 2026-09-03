# roller ledger

Append-only. Decisions are `D-NNN`; work items are `W-NNN`. Never rewrite
an entry; supersede it with a new one that references the old.

## Decisions

### D-001 (2026-09-02) Greenfield, no community dependency
Survey found DSH has no workspace-history service (its
session-checkpoint-policy is a log-flush policy) and eight community
rewind plugins, all wrong at the core: Git stash or shadow repos,
private filesystem journals with reconciliation, locks and providers,
or a Rust binary per operation. roller is written fresh; the Apache and
MIT projects are algorithm references only. Rule: fork when the base is
sound and the delta small, depend when sound and stable, greenfield when
the base is wrong at its core.

### D-002 (2026-09-02) Design accepted
DESIGN.md (343 lines) accepted after an independent check of every DSH
claim against the pinned tree 49a606bc and of the B-001 constraints
from dashi's ledger. Shape: prepended observers on DSH's
`fs/write-intent` and `fs/edit-intent` capture first-touch before
content per (session, turn, path) into one storage domain, 1 MiB per
file, last 100 turns, evict oldest; one command `/roller-restore
<turn-end-seq>` restores unconditionally newest-to-target and reports
through `command/done`; dashi forks the session first and calls the
command in the child for "conversation and files". No UI, no daemon,
no Git, no reconciliation. Forked children keep the parent's event
seqs, verified in DSH's fork seeding.

### D-003 (2026-09-02) Named DSH gaps
Command definitions have no presentCall/presentResult, so restore
output is command/done text with a pure formatter. FileSystem has no
delete primitive, so reversing a created file is a host-local unlink
after DSH's own resolve, containment, and sandbox-policy checks.
Out-of-tree session event types cannot be marked ignorable, so no
custom restore event. Each is a candidate optional upstream PR, never a
gate.

### D-004 (2026-09-02) Same working rules as dashi
AGENTS.md is dashi's with the bar restated for this plugin. Same gate
protocol: builder hands off with gate output, an independent
verification reproduces it, the architect accepts or sends back a
redesign instruction. Targets Linux and macOS only, Node only, published
DSH packages only, pinned and allowlisted versions.

### D-005 (2026-09-02) Command end-to-end proof lives in dashi
Pinned DSH exposes its command plane only through the Web remote
adapter (packages/interaction/commands/README.md:25-29; headless turns
argv into a user message at packages/bundle/headless/src/index.ts:168-200).
Driving the Web adapter without a browser, or adding a test-only
command adapter, would test invented infrastructure. Therefore W-003's
profile smoke proves only that the plugin installs and loads in a real
profile; the end-to-end `/roller-restore` proof through a real UI is a
dashi work item using the dashi-dev profile with roller added. This is
a fourth named DSH gap: no UI-less command entry point.

### D-007 (2026-09-03) Repository moved to GitHub; history squashed
Owner decision: development moves to https://github.com/antst/roller.
The current tree (roller 0.1.2) is pushed as a single initial commit;
prior commit hashes cited in this ledger refer to the Forgejo history,
which remains at ssh://git@forgejo.antst.net:224/ai/roller.git as the
secondary remote `forgejo`. Branch model: `main` is the release
branch, tagged vX.Y.Z; `develop` is the integration branch; work
branches open pull requests against `develop`. CI publishes preview
packages to pkg.pr.new from `develop` and pull requests, and to npm on
GitHub releases (W-008).

## Work items

### W-001 Package scaffold and capture journal — status: accepted 2026-09-02 (4ced006, merged to main)
Verified: gate reproduced, observers on both intents with policy still
running, one scan per turn by spy, four storage calls only, import lint
proven to bite, fail-closed capture tested. 243 production lines.
Owner: roller-exec. Branch `w-001-scaffold`.
Scope: pnpm workspace with one package `@antst/roller` shaped like a
published DSH plugin (peer ranges like DSH's own bundles, no CLI
dependency); `pnpm gate` mirroring dashi's (typecheck, build, lint,
tests, DSH version allowlist, import lint that confines `node:fs` to
the one restore module and forbids client `ui-*` packages); the
capture side only: prepended `fs/write-intent` and `fs/edit-intent`
observers writing first-touch before content or absence into the
storage domain with the 1 MiB cap and 100-turn eviction. No restore
command yet.
Acceptance evidence: gate passes; a test using DSH's in-process host
(reuse packages/test-support if it fits) runs the real write, edit, and
str_replace_editor tools against a temp workspace and proves one
journal record per (session, turn, path) with correct before content,
absence markers for created files, first-touch-wins across two edits in
one turn, the size cap, and eviction at turn 101; the observer calls
next() so fs-observation-policy still runs (test); new production
source under 400 lines.

### W-002 Restore command — status: accepted 2026-09-02 (4fa0528, merged to main)
Verified: one command, DSH runtime owns command events, parent journal
for seeded children, newest-to-oldest fold, one loop-level catch,
deletion seam 39 lines, formatter 31 lines, 11 tests.
Owner: roller-exec. Branch `w-002-restore`.
Scope: the native DSH command `/roller-restore <turn-end-seq>` per
DESIGN.md: resolve the journal for the current session, or for its
fork parent when the current session is a seeded child (cite the
lineage fact used); collect records with turn greater than the target
boundary; fold newest to oldest so each path keeps its earliest before
value; write text content through `ctx.fs.writeText` and remove
absent-marked files through the single host unlink in restore-files.ts
after DSH's resolve, containment, and sandbox-policy checks; restore
unconditionally; continue past per-path failures; report written,
deleted, and failed paths through `command/done` text produced by one
pure formatter. Argument validation: reject a non-numeric or unknown
turn with a one-line error. No dry run, no prompts, no rollback of a
failed restore, no custom events, no UI.
Not in scope: dashi integration (dashi calls the command by name in a
later dashi work item), eviction changes, any new capture rule.
Acceptance evidence: gate passes; integration tests on the in-process
host with DSH's commands service run three turns of real write, edit,
and create against a temp workspace, restore to turn 1, and prove every
file matches its turn-1 bytes, the created files are gone, untouched
files are unchanged, and the command/done text lists exactly the
written and deleted paths; a per-path failure (an unwritable path)
is reported and the remaining paths still restore; a forked child
session restores from the parent journal; a sandbox-denied path is
reported as failed without a host write; restore of a target with no
newer records reports nothing to do; new production source under 300
lines and the pure formatter under 40.

### W-003 Profile install, boot check, README — status: accepted 2026-09-02 (8a4d05a, merged to main)
Verified: real `dsh plugin add` of the packed tarball into a throwaway
profile, real CLI boot with headless plus replay, exact stdout, one
warning line when the allowlist is emptied; bundle shape identical to
DSH bundles; README has no overclaims. Carry-over into the next roller
change: a comment at src/index.ts:21 citing app-boot (loader service
defined only after profile boot) for the probe gate.

roller v0.1 capture and restore are complete in-process and installable.
Next: dashi integration (dashi work item), then publishing on the
owner's decision.
Owner: roller-exec. Branch `w-003-profile`.
Scope: the plugin as users install it. A boot-time one-line warning
when the running DSH version is outside validated-dsh-versions.json
(mirror dashi's probe: one read, one comparison, one stderr line).
README: what roller does and does not cover (the exclusions list
verbatim from DESIGN.md), install as `dsh plugin --profile <name> add
@antst/roller`, the command and its argument, how to find a
turn-end seq (from dashi's rewind picker or DSH's session tools), the
three named DSH gaps in one sentence each, and the "Known DSH gaps"
heading. A profile-level smoke test (revised by D-005): `dsh plugin --profile
roller-test add <local build>` in a throwaway DSH_HOME, then boot the
headless profile with roller added and prove it starts and exits
cleanly with roller loaded (no error, no version warning at the
validated version) and that the version warning appears when the
allowlist is emptied. Command execution end-to-end is a dashi item.
Not in scope: dashi integration (a dashi work item), publishing.
Acceptance evidence: gate passes; the smoke test runs the real
installed profile as revised; README contains no "minimal"; new
production source under 60 lines.

### W-004 Restore-time symlink and absent-target tests — status: accepted 2026-09-02 (1740774, merged to main)
Both edges proven with no production change; probe-gate citation added.
Owner: roller-exec. Branch `w-004-restore-edges`.
Scope: tests only, prompted by the community reply on DSH Discussion
5461. Add two integration cases to restore: (1) a journaled path that
has become a symlink by restore time is refused for both the write and
the delete branch, reported as a per-path failure, and the symlink and
its target are untouched; (2) restoring an absence-marked path that is
already absent counts as success and is listed as deleted or as
nothing-to-do (state which, matching the formatter). Also add the
carry-over comment at src/index.ts:21 citing app-boot for the probe
gate. If either test exposes a production gap, stop and report; do not
patch.
Acceptance evidence: gate passes; the two tests cite the exact
refusal lines in restore.ts and restore-files.ts; no production
change, or a stop report.

### W-005 Validate DSH 0.1.2-rc.1 — status: accepted 2026-09-03 (ab4a73d, merged to main, tagged v0.1.1)
Zero production changes; relied-on DSH contracts byte-identical
between alpha.5 and rc.1; six DSH peers pinned exactly with a gate
check; roller 0.1.1.
Owner: roller-exec. Branch `w-005-rc1`.
Basis: dashi D-030 (track the current DSH release; never pin
backwards). DSH published a full 0.1.2-rc.1 set on 2026-09-03.
Scope: bump validated-dsh-versions.json to 0.1.2-rc.1, move the
workspace catalog and lockfile to rc.1, fetch the rc.1 source tag into
the scratchpad as the pinned reference tree (record the commit), run
the full gate, and report every failure with the DSH change that
caused it, file:line in the rc.1 tree. Fix roller where its own code
broke; stop and report where rc.1 changed a contract roller relies on
(fs intents, KvTable, commands, sandbox policy, session fork lineage,
FileSystem resolve/contains/lstat/writeText/processPath). Then declare
DSH peer versions exactly as the validated version (same rule as dashi
D-029) with a gate check that the manifest matches the allowlist.
Acceptance evidence: gate green three runs at rc.1, or a stop report
naming the changed contract; profile smoke passes against an rc.1
CLI; new production source under 40 lines.
Builder note: `dsh-v0.1.2-rc.1` is commit
`a66e4702047846cdaa10c66c9d3df3951f5ea70d`, extracted as
`scratchpad/dsh-0.1.2-rc.1`; the relied-on contract sources are
byte-identical to the alpha.5 reference tree.

### W-006 Restore to the session start — status: accepted 2026-09-03 (4700dd9, merged to main)
14 production lines; `start` and `0` proven identical over three real
tool turns. Version bump to 0.1.2 deferred to the next release item.
Owner: roller-exec. Branch `w-006-restore-start`.
Basis: dashi D-032 and W-026. DSH forks only at a completed turn/end,
so rewinding to before the first prompt cannot be a fork; dashi will
run roller in the current session and then start a fresh root. roller
needs a target meaning "before everything". Scope: `/roller-restore
start` (alias `0`) restores every journaled path of the current
session (or its fork parent for a seeded child) to its earliest
before value, same fold, same report; the usage line names the alias.
No other change.
Acceptance evidence: gate passes; integration test: three turns of
real write, edit, and create, then `/roller-restore start` returns all
files to their pre-turn-1 bytes and deletes created files; `0` behaves
identically; new production source under 15 lines.

### W-007 Release 0.1.2 — status: accepted 2026-09-03 (74039e1, merged to main, tagged v0.1.2)
Owner: roller-exec. Branch `w-007-release-0.1.2`.
Scope: bump `@antst/roller` to 0.1.2 with a CHANGELOG line ("0.1.2:
/roller-restore start restores to the session start"); one gate run;
tag by the architect on merge. dashi-app pins this version (dashi
D-033).
Acceptance evidence: gate passes; version and changelog present.

## Upstream reports

- 2026-09-02 DSH Discussion (Ideas): policy-aware FileSystem delete primitive for plugins (D-003). https://github.com/deepseek-ai/deepseek-harness/discussions/5461
- 2026-09-02 DSH Discussion (Ideas): presentCall/presentResult on CommandDefinition (D-003). https://github.com/deepseek-ai/deepseek-harness/discussions/5462
- 2026-09-02 DSH Discussion (Ideas): ignorable marker for out-of-tree session event types (D-003). https://github.com/deepseek-ai/deepseek-harness/discussions/5463

### D-006 (2026-09-02) End-to-end restore proven through dashi
dashi W-006 (ada4bfa) installs roller's packed build into a throwaway
dashi profile and proves "conversation and files" restores the
workspace to turn-one bytes and renders roller's report; this closes
the proof deferred by D-005. No roller change was needed.
