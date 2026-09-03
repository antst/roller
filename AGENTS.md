# roller: working agreement

roller is a workspace-rewind plugin for DeepSeek Harness (DSH), built out of
tree as the published DSH plugin package `@antst/roller`. DESIGN.md is the
accepted design. LEDGER.md is the append-only record of decisions and work
items.

Roles: the architect (Claude session) decides and gates. The builder
(dsh-exec) designs details, implements, and tests. The builder proposes;
the architect disposes. Disagreement is welcome; scope creep is not.

## Rules that are not derivable from the code

1. **Completeness is the product; minimalism is the implementation.**
   The user-facing bar is Claude Code's checkpointing behavior for the file
   mutations roller claims to cover. Remaining gaps must be DSH gaps, named as
   such, never papered over. "Minimal" applies only to dependencies (published
   DSH packages), owned state (one storage domain), mechanisms (one process,
   one journal, one restore command), code size, and scope (nothing that is not
   about restoring DSH-tool file edits). The word "minimal" never appears in
   user-facing text; the package is "roller: file rewind for DeepSeek Harness".
2. **One owner per fact.** roller alone owns the checkpoint store through
   DSH's storage service. DSH owns session history and command outcomes. A UI
   keeps only disposable presentation state. No writable mirror or cache that
   writes back.
3. **A growing diagram is a redesign signal.** If a mechanism needs more
   than a few states, more than one lock, a reconciliation loop, retries or
   flags to patch ownership, stop and redesign. Do not patch.
4. **Prefer old, rigid, boring solutions.** Append-only logs, one keyed
   journal, synchronous state, and one direct command. No event bus, generic
   abstraction with one consumer, speculative seams, daemon, or helper process.
5. **Reuse before writing.** Call `ctx.fs`, `ctx.storageDomain`,
   `ctx.sandboxPolicy`, `ctx.commands`, and `ctx.sessions` directly. Copying
   DSH source is allowed only when the published package does not export it;
   state the copy in the ledger and keep it small.
6. **No fake completion.** TODO markers, skipped tests, stubs, and
   unimplemented branches are blockers, not progress.
7. **Published packages only.** roller depends on published
   `@deepseek-ai/*` releases at pinned versions, never on a source checkout or
   fork.

## Handoff protocol

- Work items live in LEDGER.md as `W-NNN`. The builder takes one at a time, in
  ledger order, and works on a branch named `w-NNN-short-name`.
- Before handing off, run the gate script (`pnpm gate`, once W-001 lands) and
  paste its final summary into the handoff message.
- A handoff message has three parts: what changed (files and behavior), gate
  output, and anything the builder is unsure about or wants to discuss. Cite
  file:line for claims about DSH.
- The architect replies with ACCEPT, or with a redesign instruction. A
  redesign instruction names the mechanism to remove, not a patch to add.
- The builder never edits LEDGER.md decision entries. It may append a
  `Builder note:` line under its own work item.
- Commits go on the work branch. The architect merges to `main` after ACCEPT.

## Verification

Tests run against recorded DSH session logs and temporary workspaces through
the real DSH filesystem, storage-domain, sandbox-policy, command, and session
services. A feature is done when the ledger's stated acceptance evidence
exists and the gate passes, not when the code compiles.
