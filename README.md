# roller

roller is file rewind for DeepSeek Harness. It records the original contents
of files changed by DSH's `write`, `edit`, `apply_patch`, and mutating `str_replace_editor`
operations, then restores those files to a completed turn boundary. It does
not change conversation history. A host that rewinds both files and conversation
must restore files on the source session before forking; dashi does so from 0.3.0.

Linux and macOS are supported.

## Install

Install roller into each DSH profile where file rewind should be available:

```sh
dsh plugin --profile <name> add --save-exact @antst/roller@0.2.0
```

roller 0.2.0 requires DSH 0.2.2-rc.3 and Node >=24.9.0.
Keep every DSH package in a profile on one uniform DSH version.

## Restore files

Run the native DSH command with the event sequence number of a `turn/end`:

```text
/roller-restore <turn-end-seq>
```

The selected boundary is inclusive. roller restores every covered path changed
after that turn, reports written, deleted, and failed paths, and continues when
one path fails. It does not prompt, compare current contents, or roll back paths
that already succeeded.

dashi's rewind picker supplies the sequence number directly. With DSH's
optional session-history tools, find the relevant `turn/end` using
`session_event_search` and inspect it with `session_event_read`; pass that
event's `seq` to `roller-restore`.

## Coverage

roller records changes made by DSH's `write` and `edit` tools and the `create`,
`str_replace`, and `insert` operations of `str_replace_editor`, plus native
`apply_patch` add/update/delete/move operations. Move source and destination
are checkpointed independently, not as an atomic transaction. The first touch
of a path in each turn stores its before-content. Each session retains its most
recent 100 turns, with a 1 MiB before-content limit per file.

Arguments resolve against the session's current working directory, but coverage
and stored relative paths stay anchored to the immutable header cwd. If the
working directory moves outside that boundary, targets there are skipped with
no roller notice, as with other excluded paths; the native tool and its report
are unchanged. In a patch with aliases to one canonical target, an ordinary
non-symlink path makes that target eligible; symlink-only targets stay excluded.
Preflight can record a planned target that never mutates.

roller does not promise to reverse:

- edits made by `bash`, PowerShell, jobs, hooks, Git, editors, watchers, or any
  external process;
- subagent edits that do not traverse the same roller-mounted filesystem intent
  listener (those that do are recorded under the subagent's own session id);
- symlinks or hard links;
- directories, special files, or non-UTF-8 files;
- files whose before-content exceeds 1 MiB;
- paths outside the immutable session cwd;
- mutation tools or plugin-defined writers outside the allowlist above;
- changes older than the retained 100-turn window; or
- deletion on a filesystem provider whose process path is not host-local.

External and excluded changes remain as they are. Covered paths are restored
unconditionally over their current contents.

## Known DSH gaps

DSH command definitions have no `presentCall` or `presentResult`, so roller's
restore result is rendered from durable `command/done` text.

DSH deliberately records no ordinary-fork source since 0.2.2-alpha.2
(`@deepseek-ai/dsh-session` 0.2.2-rc.3 README:32: "without recording a source
relationship"). This is an upstream design choice, not a DSH bug.
Restoring strictly inside the inherited prefix (including `start`/`0`) in
such a fork is refused, not reported as an empty success. Restoring TO the
fork point undoes the child's own edits and remains supported, as do later
boundaries and historical forks with `parentSession`. A combined-rewind host
must restore on the source before forking; dashi does so from 0.3.0.

Removal uses native `fs.deleteFile` with the full sandbox policy. Capture and
restore-removal eligibility still require a host-local hard-link probe; that
is a roller limitation, not a missing DSH delete API.

DSH rejects unrecognized required session-event types and offers no ignorable
custom-event flag, so roller uses the existing durable command lifecycle rather
than adding a restore event.

Roller's native service tests exercise file-tool edits and command execution;
its installed headless-profile smoke covers loading. Combined conversation
and file rewind requires separate acceptance through the host's native path.

## Development

Work branches open pull requests against the integration branch, `develop`;
`main` contains releases. Pull requests and pushes to `develop` publish
installable previews through pkg.pr.new once its GitHub App is installed.
Run `pnpm gate:docker` to execute the same containerized gate used by CI.

To release, update the version and changelog on `develop`, merge it to `main`,
then push the matching `vX.Y.Z` tag. The release workflow runs the full gate,
creates the GitHub release, and publishes to npm with trusted publishing.
