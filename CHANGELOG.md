0.2.0: (unreleased)
- Require DSH 0.2.2-rc.3 and Node >=24.9.0; retire the older supported lines without relabelling their evidence.
- Capture native apply_patch add/update/delete/move intents through the existing first-touch journal; use the published parser and the session working directory for arguments, with the original header cwd still the coverage boundary.
- Remove covered created files through native fs.deleteFile with the native sandbox policy; retain the host-local hard-link eligibility probe.
- Refuse inherited-prefix restores on ordinary forks without a recorded source id; DSH deliberately records no fork source since 0.2.2-alpha.2 (dsh-session rc.3 README:32). Historical parentSession forks remain supported. Dashi restores the source before creating the rewound conversation.
- Own storage opening through a native async effect, so disposal during opening releases the domain and cannot register stale commands or listeners.
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
