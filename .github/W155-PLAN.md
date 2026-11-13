# Roller 0.2.0 / DSH 0.2.2-rc.3

Implementation and local validation; independent/hosted gates pending.
Base develop5821c5c. The accepted phase-0
report and architect C1/C2/R1-R3 plus the path-binding ruling govern this work.
No original checkout, owner profile, daemon, credential or host install is
changed. Validation is in progress in an owned scratch checkout.

Initial setup evidence: frozen install completed, then typecheck refused the
tests' missing explicit dsh-tools type augmentation; the tests now import that
public declaration. Peer check also caught an old auto-selected group helper:
dsh-app-boot rc.3 declares cordis-plugin-group ~1.1.0, which itself requires
Cordis ~4.1.0 and loader ~1.1.0. Pinning published group1.1.0 in the test graph
replaces the stale1.0.4 selection. Neither correction changes product behavior
or weakens a runtime assertion. The initial logs are retained; no native
control had completed at that setup stage; later results are below.

The first native-wiring run reached22 controls:19 passed and3 refused on
fixture/oracle setup. The changed-directory delegation check had installed a
policy waterfall that intentionally returns an intent without next(); isolate
roller's terminal delegation there, while retaining policy composition in the
other controls. A new child must read a file in its own observation scope
before writing, so the fork control now performs that real read. Native
sandboxed delete reports its shared write-denial message; pin that exact
message, path and unchanged bytes instead of the retired manual-unlink wording.
These are recorded as setup corrections, not product passes or relaxed policy.

Adverse-control setup: native patch partial failures are reported in the
operations value (not isError); the native batch executor replaces a cancelled
value with ABORTED. Assertions therefore pin those native facts and actual file
bytes. The held-open test must release its barrier after requesting disposal,
not await disposal before releasing it (that would be a test-owned deadlock).
Initial adverse output is retained; no production correction is inferred from
these oracle/setup mistakes.

## Consequences and ownership before edits

- One journal/domain/restore command and first-touch key remain unchanged.
  No schema migration, per-patch registry, lock, queue, retry or rollback.
- Native apply_patch joins the existing write/edit/editor allowlist. The
  published dsh-fs-patch parsePatch supplies source and move-destination paths;
  native write/edit/delete intents still own admission and mutation. Capture
  awaits durable storage then returns next(), without replacing its decision.
- Header cwd remains containment and relative-record authority. Only argument
  interpretation uses public workingDirectory.get(session), like the native
  file tools after their ensure call. Paths are not normalized by roller;
  resolve and opaque targetKey comparison remain provider-owned. A changed
  directory outside header cwd is skipped silently, the existing exclusion
  behavior; the native tool/report is unchanged. This will be explicit in README.
- Native patch planning deduplicates canonical targets. Per the binding ruling,
  one matching ordinary non-symlink path makes that target eligible; symlink-only
  targets remain excluded. Move endpoints are captured independently. An
  eligible planned target may be captured during preflight and never mutate.
  The journal does not claim otherwise. No operation counter is inferred.
- Absent/existing, repeated aliases and mixed aliases share the same earliest
  before-state. Hard links, non-files, non-UTF-8, over1MiB and outside-header
  targets remain excluded. Medium/quarantine errors block delegation; ordinary
  exclusions delegate unchanged. Capturing adds bounded per-intent path probes,
  not persisted state or another filesystem grammar.
- Restore removal uses public fs.deleteFile with the full native sandbox
  policy and invocation signal. Keep the existing host-only hard-link and
  regular-file eligibility probe; no second policy algorithm or host unlink.
  Already absent is a no-op; an intervening race/error is not swallowed as
  absence. Partial successful paths remain restored after a later failure.
- Context/intent/service owners remain native Cordis; storage closes through
  its existing effect. No background task or disposable mirror is introduced.
  New capture awaits and disposal/replacement races require real4.1 controls.
- Roller contributes no model tool, skill or prompt. Its own intended prefix
  delta remains0, to be measured; DSH's shared prefix delta is not a cache claim.
- Exactly rc.3 and Node>=24.9.0 replace old support claims. Historical ledger
  decisions/evidence are not edited or relabelled. Only published packages;
  native one-call batches and real Agents replace removed test API/fake casts.

## Planned order (progress recorded below)

1. Native test wiring and failing-first controls, then the bounded product
   changes; target catalog/peers/engines0.2.0 and current companion minima.
2. Add/update/delete/move, mixed aliases, symlink-only, symlink destination,
   changed working-directory and outside-boundary controls. Check bytes and
   journal entries, not success text alone.
3. Preserve all existing restore/retention/UTF8/size/policy/fork/storage controls;
   add failed preflight, destination-only partial move, cancellation and
   continued valid mutation, reopen/quarantine and real4.1 lifecycle coverage.
4. Full gate on real rc.3; Linux+macOS hosted matrix and explicit below-floor
   refusal. Source-only prep is not a completed feature or gate PASS.
5. Review candidate archive before cross-dashi adoption. No release/tag/host
   actions. The architect owns the append-only ledger decision for this scope.

## Binding fork-lineage correction

RULING-REWIND-LINEAGE.md489cf71e: rc.3 ordinary forks omit parentSession in
both controller and SessionStore; only isSeeded/inheritedEventCount and an
end-seed marker survive, not the source id. Public sessionQuery.traceSession
also follows parentSession, so it cannot recover an ordinary fork's source.
Keep parentSession ?? current.id, but refuse an inherited boundary without a
source id, including start/0 and generated tail closers predating the first
own turn. A truly empty inherited prefix has no hidden earlier file journal;
its own changes remain restorable. One existing historical snapshot scan is
reused for the own-turn cutoff, not a new session index or deprecated reader.
Historical parentSession-bearing forks remain covered. Dashi now restores on
the source before forking; failures and partial outcomes stay explicit.
Tests must catch silent empty-success, and prove own post-fork boundaries and
historical parent selection. No header repair, map, seed matching or fallback.

The absent fork source is deliberate since0.2.2-alpha.2, per the architect's
source correction and dsh-session rc.3 README:32. It is not an upstream bug.

## Native progress (not a full gate claim)

- Corrected native wiring22/22 passed. The unchanged baseline product then
  failed7/8 selected new controls: absent patch checkpoints, durable preflight
  refusal, inherited-prefix empty-success and the old extra-root deletion fence.
  Those failures are retained, not called native compatibility of the old line.
- Actual destination-only move and mid-patch cancellation/recovery passed.
  The native executor reports cancellation as ABORTED; completed file bytes
  remain and are subsequently restored. No operation result is invented.
- Held-open disposal exposed a product leak: a domain was returned after its
  consumer's close effect could be registered. The architect approved the
  native async-generator effect, established before open and yielding close
  before more ctx access. Cordis4.1 types/fiber.d.ts:43-51 documents the shape;
  lib/index.js:448-458 collects the late yielded disposer and checks epoch
  before advancing again; :530-535 drains setup before disposal, :559-562
  handles setup rejection. No private implementation record is read by roller.
- The held-open resolution and rejection controls now pass: no domain,
  command or stale intent listener remains. Fresh reactivation succeeds.
- Expanded native capture/restore28/28 passes, including a fresh-process JSON
  domain reopen, unknown-state quarantine (no later capture or automatic retry)
  and recovery only after explicit disposal/reopen. Native prompt+tool assembly
  is equal with/without roller (own delta0); this is not provider wire or a
  server cache measurement. Full gate, below-floor and hosted remain pending.
