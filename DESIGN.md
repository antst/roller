# roller design

Status: proposed for architect acceptance, 2026-09-02. Package:
`@antst/roller`, MIT. Target: DeepSeek Harness (DSH) `0.1.2-alpha.5` at commit
`49a606bc5b5934603f22a26957a07dc799ab0291`.

All `packages/...` citations below are relative to the pinned DSH tree supplied
for this design. They describe that version, not an assumed future API.

## 1. Contract

roller restores a workspace to its state at a completed DSH turn boundary. It
records the before-content of eligible files changed through DSH's own
file-mutation tools, once per path per turn, and exposes one native slash
command that undoes later recorded turns.

The plugin is the only writer of its checkpoint domain. DSH remains the only
writer of session history and command lifecycle events. dashi owns selection
and forking, never checkpoint data. There is no Git reset, stash, worktree, UI,
daemon, helper process, background reconciliation, or second authority.

The mechanism has no lifecycle state machine. Capture is a guarded
read-before-delegate operation. Restore is one finite scan followed by one
finite sequence of path operations. Each restore path settles as written,
deleted, or failed.

## 2. Pinned DSH seams

### 2.1 Capture point: filesystem intents

roller registers prepended listeners for `fs/write-intent` and
`fs/edit-intent`. These waterfalls receive the resolved `FsTarget` immediately
before `writeText` or `editText`; their contract calls the second argument the
opaque tool-execution actor (`packages/fs/fs/src/index.ts:49-66`). The built-in
`write` implementation passes its `exec`, awaits the waterfall, then writes
(`packages/fs/tool-fs/src/write.ts:101-114`); `edit` does the same
(`packages/fs/tool-fs/src/edit.ts:111-132`). `str_replace_editor` also passes
`exec` before each mutating write
(`packages/fs/tool-str-replace-editor/src/index.ts:240-268,275-325,329-368`).
Thus this pinned version supplies both the
resolved path and the actual tool execution before mutation.

The listener awaits durable capture, then calls and returns `next()` exactly
once. It never supplies or changes an `FsWriteIntent`. `prepend: true` is
required because the observation policy is a first-wins waterfall and does not
delegate after deciding; its tests explicitly say a prepended listener runs
first (`packages/fs/fs-observation-policy/tests/policy.spec.ts:175-212`), while
Cordis defines prepend as front insertion
(`vendor/cordis/src/events.ts:90-97,111-116`). Calling `next()` preserves that
policy as the sole decision owner.

This is version-gated. Although the event types `actor` as opaque, the cited
built-ins pass the `ToolRunContext` object. roller structurally accepts only an
actor with `name`, `arguments`, and `agent.session`; any other actor is outside
coverage and is delegated unchanged.

Alternatives are worse fits here. Claude-compatible `PreToolUse` hooks map to
`tools/pre-execute` (`packages/hooks/hooks-claude-code/README.md:85-95`) and add
an external hook mechanism. `tools/execute` has typed tool identity but only
raw arguments, so roller would duplicate each tool's validation, path
resolution, and mutating-subcommand rules. Filesystem intents are the narrowest
point with an already-resolved target.

### 2.2 Exact covered tools

At the pinned version the closed allowlist is:

- `write`, path from `arguments.file_path`;
- `edit`, path from `arguments.file_path`;
- `str_replace_editor` with `command` equal to `create`, `str_replace`, or
  `insert`, path from `arguments.path`.

The registrations name `write` and `edit` directly
(`packages/fs/tool-fs/src/write.ts:68-74`,
`packages/fs/tool-fs/src/edit.ts:82-90`). The editor exposes exactly `view`,
`create`, `str_replace`, and `insert`, and only the latter three call mutation
paths (`packages/fs/tool-str-replace-editor/src/index.ts:425-498`). `view` is
not captured. No name outside this list is inferred to mutate files.

In particular, `bash`, PowerShell, job, hook, and external-process changes are
not covered even when their commands happen to edit the workspace.

### 2.3 Turn identity

For the actor's session, roller finds the last `turn/start` or `turn/end` in
the append-only log. Capture is allowed only when the last boundary is an open
`turn/start`; its `data.turn` is the journal turn. DSH assigns the same turn
number to `turn/start` and `turn/end`
(`packages/core/session/src/types.ts:261-277`). No plugin counter or turn index
exists.

Built-in mutation tools are exclusive because only an explicit
`isConcurrencySafe() === true` opts into parallel execution
(`packages/core/tools/src/index.ts:248-261,1262-1275`). Combined with DSH
storage-domain's serialized durable write chain, first-touch capture needs no
roller lock.

## 3. Eligibility and before-content

The fixed content cap is 1 MiB (1,048,576 bytes) per file. It is a constant,
not a profile flag.

Before writing a record, roller:

1. Requires a session cwd and resolves it through `ctx.fs`.
2. Requires `ctx.fs.contains(cwdTarget, target)`; DSH exposes canonical
   containment without parsing target keys (`packages/fs/fs/src/index.ts:143-157`).
3. Calls `ctx.fs.lstat(requestedPath, {cwd})` and excludes a final-component
   symlink. DSH exposes this non-following probe specifically for trust-boundary
   rejection (`packages/fs/fs/src/index.ts:159-181`).
4. For a present entry, requires a regular file, obtains the host path through
   `ctx.fs.processPath(target)`, and excludes `nlink > 1` using Node `lstat`.
5. Reads with `ctx.fs.readBytes(target, signal, 1_048_576)`, whose API refuses
   to buffer above its bound (`packages/fs/fs/src/index.ts:199-212`), then
   requires lossless UTF-8 decoding. The original bytes are stored as base64;
   an absent entry becomes an absence marker.

Symlinks, hard links, directories, special files, non-UTF-8 files, oversized
files, and paths outside the session cwd are delegated but deliberately have no
checkpoint. An unexpected read or storage error is different: it fails the
tool before mutation, because proceeding would falsely claim recoverability.

## 4. Journal

roller opens one DSH storage domain:

```text
domain: roller, version: 1, layout: per-record
table: checkpoints
key:   sha256(sessionId NUL turn NUL targetKey) as lowercase hex
```

The hexadecimal key is path-safe for the JSON backend, whose per-record keys
must match `[a-zA-Z0-9_-]+`
(`packages/storage/storage-json/src/per-record-unit.ts:12-17,307-311`).
`targetKey` is used only as an opaque identity; roller
does not parse or manufacture it.

Each record is schema-validated and contains:

```ts
interface CheckpointRecord {
  sessionId: string
  turn: number
  targetKey: string
  relativePath: string       // normalized separator, relative to session cwd
  displayPath: string        // presentation only
  before:
    | { kind: 'absent' }
    | { kind: 'text'; contentBase64: string; byteLength: number }
}
```

This is one logical record per `(session, turn, path)`. The key is checked
against the stored identity on a hit; a mismatch is a fatal collision. If the
key already exists, capture returns without reading: first touch wins.

The table is authoritative. It uses `ctx.storageDomain.open()` and table
`get`, `entries`, `put`, and `delete`; those operations are durable and ordered
by the domain's single write chain
(`packages/storage/storage-domain/src/domain.ts:1-8,42-89`). `per-record` is
intended for large, sparse, individually disposable records
(`packages/storage/storage-domain/src/spec.ts:34-47`). There is no index file,
global slot, plugin-owned in-memory cache,
rebuild pass, or lock. DSH storage-domain's own loaded table is the storage
service, not a second roller cache.

Retention has one rule: before inserting a record for turn `T`, delete every
record for that session whose turn is less than `T - 99`. Therefore only the
current DSH turn and its previous 99 turns can remain; eviction is oldest turn
first. All paths from an evicted turn are deleted. Table enumeration replaces
an index.

The storage-size stop condition is cleared for the pinned default JSON route:
records contain at most 1 MiB of source bytes (less than 1.4 MiB base64), and
the backend's per-record test durably round-trips a 4 MiB value
(`packages/storage/storage-json/tests/json-backend.spec.ts:306-316`). A
configured backend without the domain KV
facet makes plugin startup fail loudly rather than degrade
(`packages/storage/storage-domain/src/index.ts:84-117`).

## 5. Restore command

The sole native command is:

```text
/roller-restore <turn-end-seq>
```

The argument is one base-10 non-negative event sequence number in the source
session and must identify a `turn/end`. No aliases, flags, ranges, dry run, or
file filters exist.

For an invocation in a fork child, the source session is
`agent.session.header.parentSession`; otherwise it is the current session. The
source must be live in `ctx.sessions`. DSH forks preserve cwd, set
`parentSession` to the direct source, and seed the child through the inclusive
boundary (`packages/core/session/src/index.ts:1132-1160`). This makes the child
lookup exact without copying checkpoint records.

The command validates the boundary event, finds the source's latest completed
turn, and rejects a target more than 100 turns behind it. A target boundary is
inclusive: the workspace state immediately after that `turn/end` is desired,
so only records whose turn is greater than the target turn are undone.

Restore then:

1. Enumerates source-session records in the target-exclusive range.
2. Walks turns newest to oldest. For each target key, each older record replaces
   the selected value, leaving the earliest before-content after the target.
3. Sorts the selected records by `relativePath` for deterministic execution.
4. Resolves every path afresh under the child session cwd, rechecks containment
   and the link exclusions, and resolves
   `ctx.sandboxPolicy.resolve({session: child})`.
5. For `text`, strictly decodes `contentBase64` back to UTF-8 and calls
   `ctx.fs.writeText(target, content, undefined, signal, policy)`: omitted
   intent is the DSH unconditional-write contract and the policy is enforced
   by sandboxing filesystem providers
   (`packages/fs/fs/src/index.ts:223-241`).
6. For `absent`, deletes the regular unlinked path with Node `unlink`; absence
   is success. The command never removes a directory.

Step 6 is a named DSH gap: the pinned `FileSystem` service ends with
`writeText` and `editText` and has no delete primitive
(`packages/fs/fs/src/index.ts:223-263`). roller therefore supports deletion
only for host-local filesystem providers, using `ctx.fs.processPath()` after a
fresh DSH resolve/containment check and only when the resolved sandbox mode is
writable. It remains in the DSH process; no shell or helper process is started.
A non-host path or read-only policy becomes a per-path failure. This direct
unlink is used only to reverse a DSH-tool-created file, never to maintain the
journal.

Restore is unconditional. It does not compare current content or versions,
prompt per file, reconcile external edits, or roll back successful paths. A
path failure is recorded and processing continues.

## 6. Durable report and rendering

The restore report is the command's core `command/done` event, not a custom
event. The handler returns a `CommandResult` only after every path settles. DSH
itself appends `command/run` before the handler and `command/done` afterward as
durable log-only events (`packages/interaction/commands/src/index.ts:306-359`).
The result text is the durable report and has this stable form:

```text
Restored files to turn/end <seq> (turn <turn>).
Written (<n>):
- <path>
Deleted (<n>):
- <path>
Failed (<n>):
- <path>: <operation>: <message>
```

Empty sections retain the heading and show `- none`. Per-path failures still
produce `kind: success` because the restore transaction ran to completion; an
invalid command or boundary produces `kind: error`. The report contains every
successfully written/deleted path and every failed path.

The brief's `presentCall`/`presentResult` names are tool-only extension points
in this DSH version (`packages/core/tools/src/index.ts:263-279`). A native
`CommandDefinition` has only name, description, input, recordInput, and handler
(`packages/interaction/commands/src/index.ts:55-70`). Therefore the supported
command equivalents are defined as:

- `presentCall`: DSH's existing command node renders the durable command name
  and raw argument, `/roller-restore <turn-end-seq>`.
- `presentResult`: the pure formatter above supplies `CommandResult.text`;
  DSH's existing command node renders outcome text.

The generic command fold preserves name, args, text, and outcome
(`packages/client/ui-conversation/src/client/contract/records.ts:217-246`). Any
DSH UI using the existing command path therefore renders the file lists. roller
ships no browser, terminal, modal, presenter registry, or UI state.

Using only core `command/done` is also the compatibility-safe durable choice:
the pinned session persistence refuses unknown required event types from
out-of-tree plugins, while custom `Session.append()` offers no ignorable flag
(`packages/core/session/src/known-event-types.ts:7-20`,
`packages/core/session/src/index.ts:668-697`).

## 7. Conversation and dashi

roller never forks, truncates, replaces, or appends model-visible conversation
messages. Native command lifecycle records are log-only and do not enter model
history.

For “conversation and files,” dashi performs exactly:

1. `childId = ctx.sessionController.fork({sessionId: sourceId, atSeq:
   turnEndSeq})`;
2. resolve `childId` to its exact Agent;
3. execute `/roller-restore ${turnEndSeq}` on that child if the command is
   present;
4. switch the UI to the child after the command settles.

“Conversation only” omits step 3. The source session and its checkpoint records
remain unchanged. DSH validates fork boundaries and rejects a prefix ending
inside an open turn (`packages/core/session/src/index.ts:1163-1203`).

## 8. Explicit non-coverage

roller does not promise to reverse:

- edits made by `bash`, PowerShell, jobs, hooks, Git, editors, watchers, or any
  external process;
- subagent edits that do not traverse the same roller-mounted filesystem intent
  listener (those that do are recorded under the subagent's own session id);
- symlinks or hard links;
- directories, special files, or non-UTF-8 files;
- files whose before-content exceeds 1 MiB;
- paths outside the immutable session cwd;
- mutation tools or plugin-defined writers outside the exact allowlist in
  section 2.2;
- changes older than the retained 100-turn window; or
- deletion on a filesystem provider whose process path is not host-local.

There is no claim that the restored tree equals a historical whole-workspace
snapshot. It equals the composition of the before-content roller actually
recorded for covered DSH-tool mutations. External or excluded changes are left
as they are, and covered paths are restored unconditionally over them.

## 9. Verification gate

Implementation acceptance requires tests for:

- all five covered mutation routes (`write`, `edit`, editor `create`,
  `str_replace`, `insert`) and editor `view` exclusion;
- capture occurring before the provider mutation and preserving the downstream
  observation-policy intent;
- first touch winning across repeated same-turn edits and target aliases;
- absence, exact UTF-8 content, 1 MiB boundary, and every exclusion;
- storage restart, malformed authoritative record failure, and oldest-turn
  eviction at turns 100 and 101 without an index;
- inclusive boundary selection, newest-to-oldest folding, deterministic writes
  and deletes, partial failure continuation, and no rollback;
- read-only/workspace-write sandbox behavior and non-host deletion failure;
- parent lookup after fork, no conversation-surface change, and durable
  `command/run`/`command/done` replay with the complete formatted report; and
- proof that shell and out-of-band edits remain untouched.

Tests use published pinned DSH packages and temporary workspaces. The supplied
source tree is evidence for the design only and is never a runtime dependency.
