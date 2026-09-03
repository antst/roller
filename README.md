# roller

roller is file rewind for DeepSeek Harness. It records the original contents
of files changed by DSH's `write`, `edit`, and mutating `str_replace_editor`
operations, then restores those files to a completed turn boundary. It does
not change conversation history; dashi can fork the conversation before asking
roller to restore the files.

Linux and macOS are supported.

## Install

Install roller into each DSH profile where file rewind should be available:

```sh
dsh plugin --profile <name> add @antst/roller
```

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
`str_replace`, and `insert` operations of `str_replace_editor`. The first touch
of a path in each turn stores its before-content. Each session retains its most
recent 100 turns, with a 1 MiB before-content limit per file.

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

External and excluded changes remain as they are. Covered paths are restored
unconditionally over their current contents.

## Known DSH gaps

DSH command definitions have no `presentCall` or `presentResult`, so roller's
restore result is rendered from durable `command/done` text.

DSH's filesystem service has no delete operation, so roller reverses a covered
file creation through one host-local unlink after DSH containment and sandbox
checks.

DSH rejects unrecognized required session-event types and offers no ignorable
custom-event flag, so roller uses the existing durable command lifecycle rather
than adding a restore event.

DSH has no UI-less command entry point, so command execution is exercised
end-to-end by dashi while roller's own profile smoke covers installation and
startup.
