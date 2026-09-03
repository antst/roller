# @antst/roller

roller is file rewind for DeepSeek Harness (DSH). It records the original
contents of files changed by DSH's `write`, `edit`, and mutating
`str_replace_editor` operations, then restores those files to a completed
turn boundary.

Install as a DSH plugin bundle, not as a standalone dependency:

```sh
npm install --global @deepseek-ai/dsh
dsh plugin --profile <profile> add @antst/roller
```

Full documentation, source, and issue tracker:
https://forgejo.antst.net/ai/roller
