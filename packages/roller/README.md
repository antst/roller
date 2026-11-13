# @antst/roller

roller is file rewind for DeepSeek Harness (DSH). It records the original
contents of files changed by DSH's `write`, `edit`, `apply_patch`, and mutating
`str_replace_editor` operations, then restores those files to a completed
turn boundary.

Install as a DSH plugin bundle, not as a standalone dependency:

```sh
npm install --global @deepseek-ai/dsh@0.2.2-rc.3
dsh plugin --profile <profile> add --save-exact @antst/roller@0.2.0
```

roller 0.2.0 requires DSH 0.2.2-rc.3 and Node >=24.9.0.

Coverage stays inside the session's original header cwd, even after its current
working directory changes. Targets outside it are skipped without a roller
notice. DSH deliberately records no ordinary-fork source since 0.2.2-alpha.2
(dsh-session 0.2.2-rc.3 README:32); this is not a DSH bug, so restoring
an inherited boundary there is refused. Dashi restores files on the source
before forking; historical parentSession forks remain supported.

Full documentation, source, and issue tracker:
https://github.com/antst/roller
