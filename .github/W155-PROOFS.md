# Roller 0.2.0 / DSH 0.2.2-rc.3

Work in progress; not a release or cross-dashi acceptance claim. Integration
base5821c5c. Only published DSH0.2.2-rc.3 and the native Cordis4.1.0 services
are used. The Node floor is24.9.0; the hosted newest-released line is26.
Historical ledger decisions and their old-version evidence remain history.

## Consequences and implementation

The phase-0 report, C1/C2/R1-R3, the path-binding ruling and the rewind-source
ruling govern this change. The detailed pre-edit analysis is in W155-PLAN.md.

- One unchanged version1 domain, checkpoint schema, first-touch key, retention
  policy and restore command. No writable mirror, patch registry, retry,
  rollback, lineage repair or extra process in the product.
- Native apply_patch supplies the actor. Published dsh-fs-patch parsePatch
  (`lib/types/index.d.ts:2`) supplies source/destination spellings. Native
  write/edit/delete intent hooks remain admission and mutation authorities.
- `workingDirectory.get(session)` resolves arguments, matching the native
  file tool's ensure/resolve path (`dsh-tool-fs lib/index.js:175-180`). Header
  cwd remains the coverage and relative-record boundary. Outside targets are
  skipped without a roller notice; native policy and tool output are unchanged.
- Opaque targetKey equality joins intent targets to parsed paths. No lexical
  normalization. Any ordinary matching alias makes a planned target eligible;
  symlink-only targets stay excluded. Moves checkpoint endpoints independently.
  A preflight checkpoint does not claim that a mutation occurred.
- Native fs.deleteFile receives the complete sandbox policy and signal.
  Host-local regular-file/hard-link eligibility remains, not a second policy
  engine. The native provider owns delete admission, locking and cancellation
  (`dsh-fs-local lib/index.js:952-960`; fs-sandbox:148-153).
- DSH deliberately records no ordinary-fork source since0.2.2-alpha.2
  (`dsh-session rc.3 README:32`; header types.d.ts:71-76). Both public fork
  routes omit parentSession. Retain parentSession ?? current.id, but refuse an
  inherited prefix without source authority, including start/0 and inherited
  tail closers. Own post-fork boundaries remain covered. This is a consequence
  of deliberate upstream design, not an upstream bug. Dashi restores source
  files before forking; its cross-dashi proof is separately owned.

## Lifecycle finding and fix

Failing-first real Cordis4.1 control: dispose roller while the result of the
native domain open is held. Release it and await settlement. The old apply
registered close only after the await, leaving storageDomain.get('roller')
populated. The first diagnostic assertion hit pretty-format's inspection of
a Cordis proxy; the equivalent boolean assertion exposed the actual leak.
An earlier test-only barrier ordering deadlocked itself and is not product
evidence. Both stopped outputs are retained separately.

Approved correction: establish a native async-generator effect before opening,
yield its domain.close disposer before any later ctx access, then register the
existing command and intent listeners. Cordis4.1 public types/fiber.d.ts:43-51
documents async iterable effects. Its lib/index.js:448-458 collects the late
yielded disposer and checks the epoch before another generator advance;
:530-535 waits setup before draining disposers, and :559-562 observes setup
rejection. No private implementation/fiber field is read by roller.

Controls now prove late resolution leaves no domain, command or any of the
three intent listeners; fresh reactivation succeeds. Late rejection produces
no unhandled rejection or stale registration. Normal disposal closes the
domain; explicit reopen recovers durable state. In-flight capture is not a
new joined operation registry: a durable domain write drains through native
close; a capture reaching a closed/quarantined table refuses instead of
delegating mutation. Existing native caller cancellation remains authoritative.

## Observed local controls

- Initial setup: lock install succeeded. Typecheck caught two missing explicit
  dsh-tools declaration imports. Peer check caught auto-selected group1.0.4;
  published dsh-app-boot's ~1.1.0 peer requires group1.1.0 with Cordis4.1 and
  loader1.1. Pin the CLI plus app-boot peer minima, rather than accept old
  helper packages. Initial failure logs are retained.
- Native-wiring22 controls first gave19 passes and3 setup failures. Corrections:
  isolate roller's terminal delegation from observation policy (that policy
  deliberately returns an intent without next); read in the child's own
  observation scope before its write; assert the exact native sandbox delete
  message rather than the retired manual-unlink message. Then22/22 passed.
- Failing-first baseline mutation, on the same rc.3 graph:7/8 selected controls
  fail on the unchanged product sources. They detect absent patch records,
  alias/source capture loss, failed durable preflight admission, silent
  inherited-boundary empty success and the old extra-root deletion fence.
  The changed-directory case already worked on the old source. This is not
  a compatibility claim for an old runtime under rc.3.
- Native patch add/update/delete/move, repeated target, existing destination,
  mixed alias, symlink-only, symlink destination, physical symlink/.. and
  changed working directory controls pass. Bytes and journal records are
  checked, including an actual restore, not success strings alone.
- Failed preflight changes no file. Checkpoint failure blocks mutation.
  A real OS-denied source unlink gives a destination-only move; both before
  images survive and restore. Native patch reports partial failure through
  its operations value (isError is false); the test pins that actual contract.
- Mid-patch cancellation retains the completed first file, skips the second,
  permits a later valid mutation and restores the covered targets. The native
  batch executor returns ABORTED instead of the discarded patch value.
- Native command cancellation rejects with AbortError and records error in
  command/done, rather than returning the handler's partial report
  (`dsh-commands lib/index.js:131-146,386-392`). File effects are checked and a
  later valid restore succeeds. The first wrong result-shaped oracle is kept
  as a setup failure, not called a product regression.
- Fresh-process reopen uses the real JSON backend and the built product's
  domain spec. Unknown-state injection at the backend put quarantines reads
  and later writes, makes no automatic retry and blocks file mutation.
  Recovery occurs only after explicit disposal/reopen. Malformed saved bytes
  refuse that path while other paths restore. Ordinary storage failure,
  1MiB/UTF8/hard links/containment/retention and policy controls are preserved.
- Expanded capture/restore30/30 passes. First full gate passed29 tests before
  the last two restore controls were added. The next31-test run passed all
  native, installed-profile and peer stages, then its strengthened companion
  checker failed to resolve app-boot from a symlink-spelled CLI manifest.
  Resolve the installed CLI manifest's realpath before createRequire; no
  ambient lookup or pin relaxation. Direct six-companion closure check passes,
  then the complete gate passes31/31 on the corrected checker.
- Native below-floor add on DSH0.2.2-rc.2 refuses the declared requirements,
  exits nonzero and restores the manifest without the plugin. No exemption,
  forced adoption or old-runtime proof is used. First candidate archive was
  1e01744c0daddc9864ec8c5196f6187cb60288580555f62929925770591b95f9;
  later documentation edits mean it is not the final candidate archive.

## Model-prefix measurement

Real rc.3 native prompt/tool assembly with roller mounted versus disposed is
byte-identical:6559B, SHA256
2d996fe13f03812ed532bb77a1fa6e946f55662ee0613d1420c6fc0e2cc4ed5e.
No cwd/identity normalization is applied to that controlled assembly. Tool
schemas are also compared directly. Roller adds0 bytes; it registers no model
tool, skill or prompt section. This is native assembly, not provider wire.
Provider serialization and server-side cache behavior are NOT measured. The
separate corpus prefix comparison records DSH's nonzero shared prefix change;
zero roller-owned bytes is not a fleet cache-hit claim.

## Final local candidate

Canonical Node24.9.0/pnpm11.7.0 archive SHA256:
6d25cccb43dd649f1fae77b97c8d224e4fdc81d7905765143cb8ba1b72bd439a.
All16 members equal the built proposed source, except the standard pnpm
package.json catalog expansion (all catalog specs resolve to the exact
workspace catalog pins). The first attestation draft mistakenly expanded only
zod; the observed devDependency differences were normal pnpm catalog expansion,
not an archive mutation. The corrected comparison derives every such value
from the workspace catalog and still compares the whole manifest.

Final native below-floor run uses those exact archive bytes: CLIrc.2 reports
the incompatibility, exits1 and restores the plugin-free manifest. No forced
install or exemption. Full local gate on Node24.9.0 passes:31/31 tests,
typecheck, build, lint, peers,330 uniform DSH package records at rc.3,
eight DSH peers, exact CLI/app-boot companion minima and import/line guards.
Production466 lines; restore248. Zero skipped tests in the full gate.

Linux/macOS hosted matrix and newest released Node row remain pending.
Cross-dashi rewind acceptance belongs
to the separately reviewed dashi change using the same candidate archive.
No release, tag, publish, owner profile/config/process or daemon action occurs
in this work. Native tests use disposable workspaces and real services;
adverse injection is labelled, not described as a model decision.

All commands use owned scratch configuration. Nested profile installs now
explicitly set their own package-manager stores/caches too; earlier nested
invocations did not explicitly override the store and may have used the
standard shared cache. No shared store is pruned or chmodded. No secret,
credential, owner setting or process environment is read into evidence.
