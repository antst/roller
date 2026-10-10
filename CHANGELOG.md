0.1.4:
- Supports DSH 0.2.0-rc.2 and 0.2.1-alpha.2; the DSH peer floor is now `>=0.2.0-rc.2`.
- No change to roller's capture or restore behavior.
0.1.3:
- DSH compatibility floor: every @deepseek-ai peer is now `>=0.1.5-rc.2`; tested on 0.1.5-rc.2, 0.1.6-alpha.1 and 0.1.6-alpha.2.
- Removed the runtime DSH version allowlist and warning; the tested-version list is CI evidence only.
- Test harness follows DSH session format V3 and the rc.2 test kit.
0.1.2: /roller-restore start restores to the session start
0.1.1: validated against DSH 0.1.2-rc.1; DSH peers pinned exactly
0.1.0: first release
