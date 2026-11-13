# Roller 0.2.0 / DSH 0.2.2-rc.3

Work in progress; not a release or cross-dashi acceptance claim. Integration
base 5821c5c. Only published DSH 0.2.2-rc.3 and the native Cordis 4.1.0 services
are used. The Node floor is 24.9.0; the hosted newest-released line is 26.
Historical ledger decisions and their old-version evidence remain history.

## Consequences and implementation

The architect ruling of 2026-11-13 governs this change. The detailed pre-edit
analysis is in W155-PLAN.md.

- One unchanged version 1 domain, checkpoint schema, first-touch key, retention
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
- DSH deliberately records no ordinary-fork source since 0.2.2-alpha.2
  (`dsh-session rc.3 README:32`; header types.d.ts:71-76). Both public fork
  routes omit parentSession. Retain parentSession ?? current.id, but refuse an
  boundary strictly inside the inherited prefix without source authority,
  including start/0. The fork point itself restores the child's own edits;
  later boundaries remain covered. This is a consequence of deliberate
  upstream design, not an upstream bug. A combined-rewind host must restore
  source files before forking; dashi does so from 0.3.0. Its cross-host proof
  requires separate acceptance.

## Lifecycle finding and fix

Failing-first real Cordis 4.1 control: dispose roller while the result of the
native domain open is held. Release it and await settlement. The old apply
registered close only after the await, leaving storageDomain.get('roller')
populated. The first diagnostic assertion hit pretty-format's inspection of
a Cordis proxy; the equivalent boolean assertion exposed the actual leak.
An earlier test-only barrier ordering deadlocked itself and is not product
evidence. Both stopped outputs are retained separately.

Approved correction: establish a native async-generator effect before opening,
yield its domain.close disposer before any later ctx access, then register the
existing command and intent listeners. Cordis 4.1 public types/fiber.d.ts:43-51
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
  dsh-tools declaration imports. Peer check caught auto-selected group 1.0.4;
  published dsh-app-boot's ~1.1.0 peer requires group 1.1.0 with Cordis 4.1 and
  loader 1.1. Pin the CLI plus app-boot peer minima, rather than accept old
  helper packages. Initial failure logs are retained.
- Native-wiring 22 controls first gave19 passes and3 setup failures. Corrections:
  isolate roller's terminal delegation from observation policy (that policy
  deliberately returns an intent without next); read in the child's own
  observation scope before its write; assert the exact native sandbox delete
  message rather than the retired manual-unlink message. Then 22/22 passed.
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
- Expanded capture/restore 30/30 passes. First full gate passed 29 tests before
  the last two restore controls were added. The next31-test run passed all
  native, installed-profile and peer stages, then its strengthened companion
  checker failed to resolve app-boot from a symlink-spelled CLI manifest.
  Resolve the installed CLI manifest's realpath before createRequire; no
  ambient lookup or pin relaxation. Direct six-companion closure check passes,
  then the complete gate passes 31/31 on the corrected checker.
- Native below-floor add on DSH 0.2.2-rc.2 refuses the declared requirements,
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

## Initial local candidate (historical)

Canonical Node 24.9.0/pnpm 11.7.0 archive SHA256:
6d25cccb43dd649f1fae77b97c8d224e4fdc81d7905765143cb8ba1b72bd439a.
All16 members equal the built proposed source, except the standard pnpm
package.json catalog expansion (all catalog specs resolve to the exact
workspace catalog pins). The first attestation draft mistakenly expanded only
zod; the observed devDependency differences were normal pnpm catalog expansion,
not an archive mutation. The corrected comparison derives every such value
from the workspace catalog and still compares the whole manifest.

Final native below-floor run uses those exact archive bytes: CLIrc.2 reports
the incompatibility, exits1 and restores the plugin-free manifest. No forced
install or exemption. Full local gate on Node 24.9.0 passes:31/31 tests,
typecheck, build, lint, peers,330 uniform DSH package records at rc.3,
eight DSH peers, exact CLI/app-boot companion minima and import/line guards.
Production466 lines; restore248. Zero skipped tests in the full gate.

## First hosted result and fixture-only correction

Run 43447477336 at 3620834: Linux Node 26.13.1 full gate PASS; macOS Node 24.9.0
reached 30/31 native tests plus installed-profile success, then failed the
test-constructed extra writable-root grant. Linux floor Docker's check was
CANCELLED by matrix fail-fast, but its gate had already failed: unpinned
Corepack selected pnpm 12.18.0 for a nested profile, whose bin layout it could
not load. The below-floor/preview steps did not run. All states are retained,
not replaced by the later run.

DSH deliberately rejects aliases in additional writable-root grants
(`dsh-sandbox rc.3 lib/index.js:220-232`, SANDBOX_INVALID_ROOT). The fixture
passed macOS's /var/folders alias, not the required physical /private/var path.
Linux with a symlink-valued TMPDIR reproduces exactly that refusal before the
correction. Realpath ONLY that explicit fixture grant. Raw session header cwd,
arguments, exact forwarded policy and actual-file assertions remain intact.
Both matrices now use fail-fast:false so required rows can finish independently.

Product audit: no additionalWritableRoots/registerWritableRoot/workspaceRoot
or other sandbox grant construction exists in production. restore.ts:95
obtains native sandboxPolicy.resolve; :110-112 forwards the whole policy on
write, :115 forwards it to the removal helper; restore-files.ts:29 passes it
unchanged to native delete. Coverage-path resolution is not a policy grant.
No product change or path normalization is needed or introduced.

There is no configured review bot on this repository. The architect confirmed
that the configured-bot rule therefore does not apply; independent review and
required CI remain gates. No app configuration or bot command was attempted.

The old fixture fails with SANDBOX_INVALID_ROOT under a symlinked TMPDIR;
the corrected fixture passes under both ordinary and symlinked TMPDIR. The
complete corrected gate passes 31/31 tests across all 3 files, including the
installed-profile control. Typecheck, build, lint, peers,330 uniform rc.3
package records, eight peers and import/line guards pass. The cache-isolated
below-floor run again observes the native rc.2 add refusal, exit1. Repacking
is byte-identical to6d25cccb43dd649f1fae77b97c8d224e4fdc81d7905765143cb8ba1b72bd439a;
all 16 members match the built source. The new hosted result remains pending.

Cache-isolation follow-up, test-only: pnpm 11 uses PNPM_CONFIG_ (published
pnpm 11.7 dist/pnpm.mjs:144272). npm_config_store_dir was ignored; own module
metadata confirmed the correction's first install used the standard shared
store. No shared store was chmodded or pruned. NPM_CONFIG_USERCONFIG remains
honored as its auth-file fallback (:145957), so the empty scratch config
continued to exclude the owner's npmrc. Both fixtures now set the supported
PNPM_CONFIG_STORE_DIR and PNPM_CONFIG_CACHE_DIR; npm_config_cache stays for
npm. The profile-install control checks its own .modules.yaml's storeDir
against its actual private store (physical path equality). Root validation
uses explicit --store-dir. The earlier claimed nested isolation is superseded
by these observed facts; package/runtime/model bytes are unchanged.
Changing only the profile fixture back to npm_config_store_dir makes that
new store-location control fail; restoring PNPM_CONFIG_STORE_DIR passes it.
The final complete gate uses the private root store and checks the fixture's
own physical store path, rather than inferring isolation from an env name.

## Independent-review product corrections

The architect ruling of 2026-11-13 requires the native outcome-preservation
and repeated-rewind corrections. The Docker image now establishes the repo's
pnpm 11.7.0 globally through Corepack; nested profiles have no packageManager.
The prior Linux floor cancellation did not establish a passing Docker gate.

The two native path probes fail on the reviewed source: an unrelated ENOTDIR
spelling adds a second, misattributed preflight problem; a later unresolvable
path blocks an otherwise valid symlink-only edit after a completed patch
prefix. The first probe initially expected a successful value record; native
preflight instead returns a tool error. The corrected oracle compares native
error, content and problem count, not a fabricated value. That setup slip is
retained separately from the failing-first native comparison.

Non-abort FsError during a spelling's resolve now excludes that spelling;
FS_ABORTED and unexpected exceptions still propagate. Storage failures keep
their existing fail-closed behavior. No per-call state is added. The reviewed
bound is at most spellings times intent events spelling resolutions per patch,
plus at most one header-cwd resolution per event. The
shipped fs-local resolve (rc.3 lib/index.js:820-828) calls resolveLocalTarget
(:183-216): path anchoring and local realpath/ancestor reads only. No permission
prompt, approval, sandbox grant, filesystem write or network call is reached.
fs-sandbox inherits that resolve unchanged (:106); its policy fences are on
mutations. This audit does not establish behavior of third-party providers.

The repeated-rewind control first fails on the child fork-point refusal.
The corrected cutoff refuses only strictly earlier inherited boundaries;
the inclusive fork point uses the child's own journal. The control restores
the source, forks it, makes real child edits, then restores the same prompt
again and checks the original bytes. The strict-prefix and historical
parentSession controls remain separate. No source is inferred or repaired.

Final local gate on Node 24.9.0: 35/35 tests across all three files, with
typecheck, build, lint, peers, 330 uniform rc.3 package records and import/line
guards passing. The corrected Docker floor also passes 35/35 using the image's
exact Corepack-global pnpm 11.7.0; the nested installed-profile control runs.
The same new archive passes the native CLI rc.2 add-refusal control (exit 1,
plugin absent after manifest restoration). Hosted macOS, Linux floor,
below-floor and preview results remain pending until the correction push.

Reviewed-correction archive SHA256:
1924ece1970b4b1fd9172712602239b84e2b54a242eef7d833b34eeb80419c1d.
All 16 members equal the built source with exact catalog expansion. Entries
and modes equal the historical 6d25cccb archive; only README.md,
lib/capture.js and lib/restore.js bytes differ. Tests, documentation and the
Node type-only dependency update are not extra runtime archive changes.
Roller's measured native prompt/tool contribution remains 0 bytes, with the
same 6559-byte assembled-options hash recorded above; no wire/cache claim.

The second path probe's first native comparison reused an observation scope
after deleting and recreating files; the native stale guard correctly refused
that fixture reset. The final comparison uses two fresh native Agents and
workspaces, normalizing only the explicit workspace root in results. Both
product probes and the strict-prefix/repeated-rewind controls now pass (4/4).

Fork cutoff provenance: dsh-api-session-controller rc.3 lib/index.js:835-837
uses the inclusive boundary with buildForkSeed; :848-851 passes
SessionLogOffset(boundary + 1). dsh-session:971-979 appends session/end-seed
after the cut, and SessionStore.fork:2097-2105 also records resolved + 1.
The native marker is NOT counted. The repeated-rewind test now calls the real
SessionStore.fork, pins its boundary/marker offsets, and takes that native
fork's seed/count into a production Agent created by the native factory.
No child header or inherited count is synthesized by that test.

Abort provenance: dsh-fs rc.3 lib/index.js:42 declares FS_ABORTED and :54-60
defines FsError. The shipped fs-local resolve raises FS_ABORTED before and
after metadata I/O (:821,823); lstat does the same (:854,857). A plain
AbortError or DOMException is not FsError and reaches the unchanged rethrow.
One control injects all three at the spelling probe, asserting exact error
identity, no delegation and no checkpoint.
The first final typecheck caught an explicit undefined cwd in the new test's
metadata copy. The corrected test omits that optional key when absent, exactly
as the native controller does; runtime sources and archive bytes are unchanged.

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
