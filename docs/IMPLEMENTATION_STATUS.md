# Rules Implementation Status

This document compares the target rules in `RULES_SPEC.md` with the current implementation in version 7.4.0. `ARCHITECTURE.md` describes how the repository works today; this document records the gap between that architecture and the desired final system and orders the work needed to close it.

Status labels:

- **Implemented** — the current PC path implements the requirement end to end.
- **Partial** — supporting behavior exists, but the rule or one of its callers/data contracts differs.
- **Not implemented** — the current system uses a different rule or has no representation for it.
- **Legacy compatibility** — retained behavior for non-PC actor types; it is not the target PC implementation.

## 1. Executive status

The repository has completed the package rename, the PC Willpower redesign, Splat compatibility for that redesign, the PC Health redesign, zero-pool automatic failure, enforced Test difficulty bounds, explicit Resistance, the specified botch comparison, Test margins, and the reordered chat result display. New-world defaults now select the requested 5th-edition Test profile. Legacy Actor types and PC chimerical damage retain compatibility Health paths. Damage, weapons, and armor do not yet model the specification's independent nature/lethality, concentrated damage, or effective Protection pipeline.

The remaining work should be done in this dependency order:

1. establish stable rule result/data contracts and tests;
2. replace the generic Test evaluator;
3. add damage-source, weapon, and armor fields;
4. connect attack, Damage Test, defense, wound conversion, and chat output;
5. migrate dependent items/compendia and decide the legacy-actor support boundary;
6. remove or clearly scope obsolete settings and compatibility code.

## 2. Work already implemented

### 2.1 Package identity and compatibility

**Status: Implemented, with a runtime compendium compatibility boundary.**

- `system.json` uses package id `wod-advanced`, version `7.4.0`, and Foundry v14 compatibility.
- runtime paths, settings namespaces, flags, tours, source compendium UUIDs, and pack metadata use `wod-advanced`.
- the internal object names `CONFIG.worldofdarkness` and `game.worldofdarkness` intentionally remain; these are JavaScript API names, not the package id.
- `module/scripts/drop-helpers.js::NormalizeCompendiumUuid` converts imported `Compendium.worldofdarkness.*` references to the active system id.
- bundled LevelDB records may still contain old namespace bytes. They are readable through normalization, but should be rebuilt when their source content is next migrated.

### 2.2 PC Willpower wound track

**Status: Implemented for PC actors; legacy actors retain their old representation.**

Persistent data and derivation:

- `module/actor/datamodel/base/actor_willpower.js` defines `system.willpower.damage.light/heavy/aggravated`.
- `module/actor/datamodel/pc-actor-datamodel.js` includes and backfills the schema.
- `module/scripts/willpower.js::getWillpowerState` derives the `2 + Composure + Resolve` maximum, current/full pools, five levels, active penalty, spend availability, and display boxes.
- `WoDActor._preUpdate` clamps the track if Composure or Resolve changes.

Sheet and click flow:

```text
PCActorSheet stats context
  -> getWillpowerState
  -> templates/actor/parts/stats_willpower.hbs
  -> editWillpower / context-menu action
  -> OnWillpowerCounterChange / OnWillpowerCounterClear
  -> getWillpowerUpdate
  -> actor.update(system.willpower.damage.light/heavy/aggravated)
```

Roll and spend flow:

- Willpower is rollable through the normal roll dispatcher.
- `module/dialogs/dialog-generalroll.js` can choose current or full Willpower.
- current equals empty boxes; full ignores light but not heavy or aggravated wounds.
- `DiceRoller` calls `spendWillpower` for a PC, adds a light wound when an empty box exists, grants one automatic success, and prevents botch.
- any full track, including an all-light track, cannot be spent further.

Compatibility and migration:

- `createWillpowerAdvantageFacade` supplies a transient read-compatible `actor.system.advantages.willpower`; it is not persisted.
- `WoDActor._prepareCharacterData` excludes legacy Willpower items and rebuilds the facade.
- `DropHelper` skips Willpower Advantages during Splat installation and direct drops, so templates use the base PC track.
- migration `7.3.0` in `module/migration.js` converts spent temporary Willpower to light wounds and removes the obsolete PC Willpower Advantage. Details are in `MIGRATION.md`.

### 2.3 Willpower wound penalties and zero-pool Tests

**Status: Implemented.**

- `DiceRollContainer.willpowerpenalty` distinguishes automatic derivation (`null`) from an explicit value.
- `DiceRoller` automatically applies the PC's five-level Willpower wound penalty to every Test.
- the former exhaustion checkbox and fixed `-2` rule have been removed.
- Health and Willpower wound penalties are additive.
- a final pool at or below zero is clamped to zero, creates no `Roll` objects, returns failure with zero successes, and sets `zeroPoolFailure`, even if automatic successes were also requested.
- `templates/dialogs/roll-template.hbs` explains the automatic failure for standard, attack, and damage cards.
- all seven catalogs contain `wod.dice.zeropoolfailure`.

Willpower wound penalty derivation is centralized, so dialogs and direct API callers share it.

Affected files are the Health/Willpower services and typed model, Actor lifecycle,
shared dice evaluator, general roll dialog, PC tracker templates and CSS, Splat
reset/migration paths, localization catalogs, and focused Health/Willpower tests.
The persisted-data addition and PC-only compatibility boundary are documented
in `MIGRATION.md`; manual Foundry v14 sheet, roll-card, and migrated-actor checks
remain required.

### 2.4 Resistance and Test margins

**Status: Implemented in the shared evaluator and chat result.**

- `DiceRollContainer.resistance` defaults to 0.
- the general Test dialog and direct PC roll API accept non-negative explicit Resistance;
- `DiceRoller` adds one Resistance for every natural 1, then clamps net successes to zero;
- each per-target result exposes total Resistance, margin of failure, and additional successes;
- the shared chat card shows pre-Resistance successes first, nonzero total Resistance second, the final outcome third, then additional successes for a successful Test or margin of failure for a failed or botched Test.

Affected files are `module/scripts/roll-dice.js`, `module/dialogs/dialog-generalroll.js`, `module/actor/api-handler.js`, the general-roll and chat templates, and all localization catalogs. Resistance is request data only and requires no persisted-data migration. Specialized dialogs currently use the shared default of 0 because they do not expose their own Resistance input. Configurable legacy ten/speciality success behavior remains and can still change the successes present before Resistance.

### 2.5 Default Test profile, bounds, and result presentation

**Status: Implemented as new-world defaults and shared runtime bounds; legacy settings remain configurable.**

- new worlds default to speciality eligibility at 2 dots and fifth-edition attributes;
- attack successes do not add damage dice by default;
- damage and soak Tests allow botches by default;
- speciality-added successes default to disabled, while an applicable speciality lowers difficulty by 1;
- exploding 10s default to `always` and can recursively schedule further dice;
- the world minimum difficulty defaults to 3 and cannot initialize below 3; administrators may select an active minimum from 3 through 6;
- the runtime maximum is fixed at 9, and `DiceRoller`, shared selectors, dialog selectors, and Arete casting use that ceiling;
- the chat card shows the running success total captured immediately before Resistance, then nonzero total Resistance, then the final outcome, followed by the appropriate margin field and remaining result details;
- Botch, Failure, and Success use `.tray-test-result` at `1.25em` and font weight `700` in every standard, attack, and damage result branch;
- the English failure label is “Failure”; Resistance, margins, and result labels exist in all seven localization catalogs.

The displayed pre-Resistance count is not identical to `rawSuccesses`: `rawSuccesses` counts successful die faces for botch and margin calculations, while the displayed running total can also include Willpower/bonus successes and configured 10/speciality additions. Natural 1s always increase total Resistance. The damage/soak ones toggles only control whether those origins can botch.

Commit `c07379e` fixed a missing closing parenthesis in the favored-roll branch of `roll-dice.js`. That syntax error demonstrated an important dependency: the PC sheet imports the roll stack through `ActionHelper`, so failure to parse the dice module can leave a title-only actor application. The fix was manually verified in Foundry v14 by reopening a PC sheet and confirming all sheet parts rendered.

### 2.6 PC Health and wounds

**Status: Implemented for normal PC Health; compatibility boundaries remain.**

- maximum Health is derived from `2 + Strength.value + Stamina.value + healthBonus`;
- the manual bonus is edited in Options → Combat, and active `health_buff`
  values add to it without retaining their legacy per-level target on PCs;
- five fixed levels are distributed evenly with remainders assigned
  Crippled → Mauled → Wounded → Hurt → Bruised;
- normal wounds persist as ordered `light`, `heavy`, and `aggravated` ids and
  render with the original diagonal square-box CSS marks;
- manual sheet interaction is compact and severity-ordered: empty clicks append
  light at the first empty box, light/heavy clicks promote the first wound of
  that severity, and aggravated or right-click removal shifts later wounds;
- heavy and aggravated wounds therefore cannot be placed arbitrarily by
  clicking a later box;
- partial wound updates no longer reset the manual Health Bonus: data-model
  migration converts only payloads containing actual legacy Health fields and
  leaves omitted fields untouched;
- overflow displacement performs recursive light→heavy→aggravated pairwise
  upgrades and retains unresolved overflow;
- only heavy/aggravated wounds activate the fixed 0/-1/-2/-3/-5 penalty;
- `damage.woundlevel`, `damage.woundpenalty`, and aggregate Health traits remain
  derived compatibility outputs, so the existing roll/initiative pipeline was
  reused rather than reimplemented;
- soak and API callers temporarily map bashing→light and lethal→heavy pending
  the separate Damage conversion;
- migration 7.4.0 converts legacy PC counters/levels and preserves excess
  wounds; legacy Actors and PC chimerical mutation retain old rules.

Primary files are `module/scripts/health.js`, the PC Health data model and Actor
lifecycle, PC sheet/actions, `module/actor/api-handler.js`, `dialog-soak.js`,
Splat/drop compatibility, migration, localization, and `tests/health.test.mjs`.

## 3. Requirement matrix

### 3.1 Generic Dice Tests

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Final pool is base + bonuses - penalties | Partial | Dialogs assemble pools and `DiceRoller` adds Health and Willpower wound penalties, but modifiers are distributed across dialogs and `BonusHelper`. | Define one normalized Test request/modifier contract and make all dialog/API callers use it. |
| Minimum pool 0; zero dice means automatic failure | **Implemented** | `DiceRoller` skips all rolls and sets `zeroPoolFailure`. | Add permanent automated coverage for general, attack, damage, multi-target, and automatic-success cases. |
| Difficulty range 3–9, default 6 | **Implemented** | The evaluator clamps to the active world minimum and fixed maximum 9; initialization prevents a minimum below 3, shared selectors use the same bounds, and the default Test difficulty is 6. The legacy minimum setting may intentionally raise the active floor to 4–6. | Add permanent automated boundary coverage and decide whether target rules should retain a configurable raised floor. |
| Each die at or above difficulty is one raw success | **Implemented with legacy additions** | `rawSuccesses` independently counts successful die faces. A separate running total includes automatic successes and configured 10/speciality additions before Resistance. | Add pure tests and decide whether the remaining configurable additions belong in the target rules mode. |
| Resistance defaults to 0 and subtracts raw successes | **Implemented** | `DiceRollContainer` has a default-zero Resistance field; the general Test dialog and PC API accept it, and `DiceRoller` subtracts total Resistance before clamping. | Expose the input in specialized Test dialogs if those workflows require nonzero explicit Resistance. |
| Each natural 1 increases resistance by 1 | **Implemented** | Every natural 1, including results from explosion dice, adds one to total Resistance independently of botch prevention. `theRollofOne` is still registered/cached but no longer subtracts successes in `DiceRoller`. | Remove or formally deprecate the obsolete ones-subtraction setting. |
| Each natural 10 succeeds and explodes recursively | Partial | Every 10 counts as a raw successful face. The new-world default is recursive `always` explosion, but `explodingDice`, speciality, and `tenAddSuccess` remain configurable. | Lock or scope the remaining settings if the target rule must be invariant in every world. |
| `net = max(0, raw_successes - resistance)` | **Implemented with success-source nuance** | The evaluator subtracts total Resistance once from the running `successesBeforeResistance` total and clamps to zero. That total can include automatic/configured extra successes; the code's successful-face `rawSuccesses` remains separate for botch and margin calculations. | Clarify whether the specification's `raw_successes` includes automatic/configured success sources, then encode both counters in a structured public result contract. |
| Botch iff rolled ones > raw successes, before clamp | **Implemented with explicit gates** | `DiceRoller` separately counts per-target natural 1s and raw successful dice. It botches only when `canBotch` is true and ones exceed raw successes; spent Willpower prevents botch, disabled damage/soak botching prevents it for those origins, and speciality protection can downgrade botch to failure. | Add permanent automated coverage for exploding dice, automatic successes, multi-target rolls, and each botch-prevention gate. |
| Failure and margin of failure | **Implemented** | Per-target results calculate and render `marginOfFailure = max(0, resistance - rawSuccesses)` for failed and botched Tests. | Add automated chat-card and numerical boundary coverage. |
| Success and additional successes | Partial | Per-target results calculate and render `additionalSuccesses = max(0, netSuccesses - 1)`, but weapon code still recomputes successes minus one from the numeric return value. | Migrate weapon and other downstream callers to a structured Test result. |
| Specialization reduces difficulty by 1 before clamp | Partial | The new-world default is `specialityReduceDiff = 1`, but dialogs apply the setting before the shared evaluator and existing worlds may configure 0–3. | Represent applicable/enabled specialization on the request and apply exactly `-1` centrally if the target rule must be invariant. |

Primary files: `module/scripts/roll-dice.js`, all builders in `module/dialogs/`, `module/actor/api-handler.js`, `module/scripts/action-helpers.js`, `module/settings.js`, `wod.js`, `templates/dialogs/roll-template.hbs`, and `lang/*.json`.

### 3.2 Willpower

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Maximum is 2 + Composure + Resolve | **Implemented** | Derived from base attribute `value` fields. | Decide whether future derived attribute bonuses should affect maximum. |
| Empty/light/heavy/aggravated wound boxes | **Implemented** | Actor-owned counts render the same five levels and CSS marks as Health. | Add Foundry interaction coverage for maximum shrink/growth. |
| Spend adds light only when an empty box exists | **Implemented** | `spendWillpower` rejects every full track, including all-light tracks. | None for PC path. |
| Spend grants one automatic success and prevents botch | **Implemented** | PC branch in `DiceRoller`. | Revalidate after the evaluator rewrite, especially zero-pool precedence. |
| Health-style 0/-1/-2/-3/-5 penalty | **Implemented** | Heavy/aggravated Willpower in the most severe occupied level sets a non-stacking penalty applied to all Tests. | None for PC path. |
| Current and full Willpower rolls | **Implemented** | General roll dialog selects current/full. | Ensure every future roll entry point uses the same selector contract. |
| Base PC always has Willpower; Splats do not reinstall it | **Implemented** | PC schema plus Splat/direct-drop filtering. | Rebuild affected compendia to eliminate obsolete Willpower content when convenient. |
| Legacy actor conversion | Legacy compatibility | Non-PC actors still use permanent/temporary Willpower. | Decide whether legacy actors remain supported, are migrated to PC, or receive the new schema separately. |

### 3.3 Health and wounds

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| `maxHealth = 2 + Strength + Stamina + healthBonus` | **Implemented for PC** | The manual sheet bonus and active Health buffs are included. | Decide separately whether legacy Actors should adopt the target rules. |
| Exactly five levels | **Implemented for PC** | Bruised, Hurt, Wounded, Mauled, and Crippled are derived. | Legacy Actors retain seven levels. |
| Even distribution, remainder severe-first | **Implemented for PC** | Pure deterministic helper assigns remainders from Crippled toward Bruised. | None for PC path. |
| Penalties 0/-1/-2/-3/-5 | **Implemented for PC** | Fixed in the PC Health service. | None for PC path. |
| Penalty from most severe box containing heavy/aggravated; no stacking | **Implemented for PC** | Derived from resolved boxes; light wounds are ignored. | None for PC path. |
| Markers light `/`, heavy `X`, aggravated three-stroke | **Implemented for PC** | CSS gradients keep diagonals square-aligned and add a centered vertical aggravated stroke. | Chimerical/legacy tracks retain compatibility markers. |
| Fill least to most severe | **Implemented for PC** | Canonically ordered wounds are projected onto derived boxes from Bruised onward. | None for PC path. |
| Manual box interaction preserves track order | **Implemented for PC** | Empty adds the first light wound; light/heavy clicks promote the first matching severity; aggravated and right-click removal compact the array. | Chimerical/legacy tracks retain their compatibility controls. |
| Health Bonus survives wound updates | **Implemented for PC** | Partial data-model migration never supplies defaults for omitted Health fields; wound-only updates preserve `system.health.bonus`. | None for PC path. |
| `2 light -> heavy`, `2 heavy -> aggravated` | **Implemented for PC** | Overflow displacement recursively combines least-severe pairs. | Add more boundary fixtures as the Damage pipeline is converted. |
| Replacement, displacement, recursive cascades | **Implemented for PC** | The pure resolver passes the seven-light plus two-heavy example and retains unresolved overflow. | Death/terminal overflow effects remain unspecified. |

Primary files: `module/actor/datamodel/base/actor_health.js`, `module/actor/datamodel/base/actor_traits.js`, `module/actor/data/wod-actor-base.js`, `module/config.js`, `module/scripts/health.js`, `module/scripts/combat-helpers.js`, `module/scripts/totals.js`, `module/actor/api-handler.js`, PC health templates/actions, Splat schema/sheets, and migration code.

### 3.4 Damage Tests and damage semantics

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Successful attack starts Damage Test using damage pool | Partial | Weapon V2 has attack then damage stages and item damage pool fields. | Make the chain consume the common structured Test result and formal damage-source data. |
| Base damage difficulty 6; one success = one damage | Partial | Damage rolls default near 6 and success counts exist, but legacy dice settings change semantics. | Route through the target evaluator with fixed base 6 and convert net successes to damage units. |
| Additional attack successes reduce damage difficulty | Not implemented | When enabled, attack successes are added as damage dice. | Use common `additionalSuccesses` to reduce difficulty, then clamp 3–9; remove/retire `successesToDamageRolls` for target rules. |
| Armor/modifiers resolve before wounds | Partial | Soak dialog subtracts roll successes before applying legacy damage counts. | Define a deterministic damage-resolution object and stage order: source -> applicable defenses -> effective Protection/absorption/degradation -> remaining damage -> wounds. |
| Damage nature independent from lethality | Not implemented | `damage.type` is bashing/lethal/aggravated and mixes wound severity with damage type. | Add stable nature ids/list and a separate lethality enum. Support one or more natures. |
| Subdual/light, normal/heavy, deadly/aggravated | Not implemented | Legacy bashing/lethal/aggravated maps approximately but is not independent from nature and uses different overflow rules. | Add lethality-to-wound conversion after defenses; default missing lethality to normal. |
| Distributed damage | Not implemented | No explicit concentration mode. | Add source mode with distributed as default and pass all damage units to the wound resolver. |
| Concentrated: at most three wounds; excess upgrades evenly | Not implemented | No representation or algorithm. | Add a pure concentration algorithm and verify the 5-heavy and 8-light examples before applying wounds. |

Primary files: `module/dialogs/dialog-weaponv2.js`, `module/dialogs/dialog-soak.js`, `module/scripts/roll-dice.js`, `module/scripts/combat-helpers.js`, `module/actor/api-handler.js`, weapon/armor data models or `template.json`, item sheets, chat template, settings, localization, and migration.

### 3.5 Weapons and armor

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Stable weapon type: unarmed/melee/thrown/bow/firearm/other ranged | Partial | Melee/Ranged document types and ranged modes exist, but not the specified normalized taxonomy. | Add a stable weapon-type enum and migrate subtype/mode values. |
| Damage pool | Partial | Legacy weapon `system.damage` has attribute/bonus/type/rollable fields. | Preserve/migrate the useful pool fields into the target source schema. |
| One or more damage natures | Not implemented | No independent nature list. | Add validated nature ids and multi-select sheet controls. |
| Lethality enum, normal default | Not implemented | Legacy damage type combines concepts. | Add subdual/normal/deadly with schema default normal and localization. |
| Armor Piercing reduces effective Protection, minimum 0 | Not implemented | `system.piercing` is editable but has no resolution consumer. Armor uses soak values, not Protection. | Add armor Protection and AP calculation in the damage pipeline. |
| AP affects absorption and degradation without mutating permanent Protection early | Not implemented | No armor degradation pipeline. | Calculate transient effective Protection, then apply absorption/degradation updates after resolution in one transaction. |

Primary files: `template.json` or new typed item models, `module/items/datamodel/`, `module/items/template/`, `templates/items/`, `templates/sheets/`, `module/dialogs/dialog-weaponv2.js`, `module/dialogs/dialog-soak.js`, `module/scripts/combat-helpers.js`, `module/items/data/wod-item-base.js`, and migrations/compendia.

## 4. Dependency-ordered implementation plan

### Phase 0 — Freeze contracts and add regression fixtures

1. Decide whether the final game targets only `PC` or must reproduce every new rule on legacy actor types. This controls every schema and migration below.
2. Define serializable contracts for `TestRequest`, `TestResult`, `DamageSource`, `DamageResolution`, and resolved health boxes. Keep UI/display strings out of core rule objects.
3. Add pure-unit fixtures for every numerical example and boundary in the specification, plus current Willpower and zero-pool regressions. Mock Foundry only at the document/chat boundary.

### Phase 1 — Replace the Test evaluator

1. **Partial:** `DiceRollContainer` now carries Resistance and a Willpower wound penalty, but there is no serializable structured `TestRequest`/`TestResult` contract and the function still returns only a number.
2. **Partial:** the shared evaluator enforces the active minimum and maximum 9, but dialogs still assemble modifiers and speciality difficulty changes independently.
3. **Partial:** dice, ones, and raw successful faces are counted separately and explosions recurse by extending the loop; however, explosion/10 behavior remains setting-controlled.
4. **Implemented in the current evaluator:** total Resistance, botch comparison, clamped net successes, margin of failure, and additional successes are calculated per target.
5. **Implemented:** a zero final pool rolls no dice, produces no explosions, and is an automatic failure even when automatic successes exist.
6. **Implemented for PC actors:** spending persists the Willpower wound update, adds one automatic success, and prevents botch; legacy actors retain their old resource path.
7. **Partial:** the general dialog and direct PC attribute/ability/advantage API accept Resistance; specialized dialogs inherit zero and downstream weapon code still consumes a numeric return.
8. **Implemented for existing card branches:** standard, attack, and damage cards show the ordered result fields and retain Foundry `Roll` objects.
9. **Not completed:** conflicting settings remain registered. Their new-world defaults now match the requested profile, but existing worlds may retain different values.

### Phase 2 — Replace PC Health persistence and wound resolution

**Completed for normal PC Health in 7.4.0 and updated to the current formula.** The formula uses Stamina;
ordered severity ids are canonical; maximum, five levels, display boxes, and
penalty are derived; the resolver handles recursive overflow upgrades; the PC
API, soak adapter, sheet controls, Splat application, migration, and focused
pure tests use the new path. Follow-up fixes make manual clicks promote the
first matching severity, compact on removal, render a legible black uppercase
aggravated marker, and preserve the manual bonus across partial wound updates.
Legacy Actors and PC chimerical mutation remain an explicit compatibility
boundary. Terminal consequences for unresolved overflow remain pending because
the specification does not define them.

### Phase 3 — Introduce damage-source and defense models

1. Add independent `nature[]`, `lethality`, and `concentration` fields with stable ids and schema validation.
2. Add armor `protection`, applicable natures/defense rules, and degradation state; retain legacy soak only behind an explicit compatibility path.
3. Implement pure functions for lethality-to-wound severity, distributed conversion, and concentrated three-wound conversion.
4. Define the exact defense sequence and implement effective Protection as `max(0, protection - armorPiercing)` without mutating permanent Protection before resolution.
5. Return one `DamageResolution` containing attack linkage, Damage Test result, applicable defenses, absorbed damage, degradation, remaining damage, wound instances, and final track changes.
6. Apply actor and armor document changes after successful resolution in a controlled transaction/order, then render from the returned result.

### Phase 4 — Convert weapons and combat dialogs

1. Create or extend typed weapon/armor models for weapon type, damage pool, multiple natures, lethality, concentration, AP, and Protection.
2. Update item sheets and validation/select lists; add localization in all catalogs.
3. Change `DialogWeaponV2._rollAttack` to consume `TestResult.additionalSuccesses`.
4. Change `_rollDamage` so additional attack successes reduce difficulty rather than add dice.
5. Replace the current soak/apply chain with the new defense and `DamageResolution` pipeline.
6. Update attack, damage, and defense chat cards to expose the calculation without leaking internal/localized ids into persistence.
7. Migrate world items, embedded items, Splat references, macros if applicable, and bundled compendium content.

### Phase 5 — Migration, compatibility, and cleanup

1. Assign a new system version and make every persisted schema conversion idempotent.
2. Migrate actors before dependent embedded items where necessary; handle unlinked tokens and compendium documents explicitly.
3. Rebuild source packs under `wod-advanced` so old namespace bytes and obsolete Willpower Advantages are no longer distributed.
4. Keep readers for old fields for one defined compatibility window; never write both old and new canonical values indefinitely.
5. Remove or relabel settings that no longer affect target rules, and stop caching settings whose live value must be authoritative.
6. If legacy actor types remain, either port each subsystem completely or label them as legacy-rule sheets. Avoid silently mixing target dice rules with old health/resources.
7. Update `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, and `MIGRATION.md` in the same change as each phase.

## 5. Migration impact inventory

The following future changes alter persisted data and require versioned migration plus compendium/Splat conversion:

- damage nature, lethality, and concentration on damage sources;
- normalized weapon type;
- armor Protection, applicable nature rules, and degradation state;
- weapon armor-piercing semantics;
- removal or reinterpretation of legacy dice-rule settings;
- any conversion of non-PC actors to the new Willpower/Health model.

Do not derive new canonical fields only in sheet context. They must live in typed models (or explicitly supported legacy schemas), migrate existing documents, and be regenerated in bundled Splat/compendium sources.

PC Health persistence was migrated in 7.4.0. Its Stamina formula, five-level
derivation, ordered wound state, and compatibility boundaries are documented
in `MIGRATION.md`.

## 6. Verification gates

Current verification progress: JavaScript checks pass for the changed Health, Willpower, roll, dialog, Actor, data-model, and migration modules. The focused rules suite has 21 passing tests: 16 Health cases plus 5 Willpower cases covering the new formula, shared distribution/penalties, aggravated promotion, full-track spend rejection, and successful spend. Broader Test/chat-card regression coverage remains absent, so the gates below remain the completion standard rather than a claim that the full conversion is verified.

Each phase is complete only after these checks pass:

1. JavaScript syntax and every localization JSON file parse successfully.
2. Pure rules tests cover specification examples, boundaries, recursive explosions/cascades, zero pools, and multi-target behavior.
3. All entry points—PC sheet, item sheet, general dialog, weapon flow, direct actor API, and chat send paths—use the same core result contracts.
4. A migrated PC opens without validation errors, retains its effective prior values where a meaningful mapping exists, and saves/reloads identically.
5. Splat installation neither creates obsolete Willpower items nor overwrites the actor-owned track.
6. Chat cards render standard, attack, damage, zero-pool, success, failure, and botch cases in all layout branches.
7. Manual Foundry v14 testing covers a fresh world, a migrated world, world compendium drops, bundled compendium drops, unlinked token actors, and permissions for owner/observer users.
8. `MIGRATION.md` states changed paths, conversion rules, compatibility scope, and any irreversible loss.

## 7. Known design decisions still required

- **Legacy Health scope:** Willpower and target Health are PC-only. Decide separately whether legacy Actor types should ever be migrated.
- **Settings authority:** new-world defaults now match the requested Test profile, but existing saved values and the settings UI can still select conflicting behavior. Decide whether those controls are removed, migrated to fixed values, or retained only in a named legacy rules mode.
- **Armor degradation details:** the specification says AP affects degradation but does not define the degradation formula. That formula must be added before implementation.
- **Overflow at maximum aggravated Health:** unresolved overflow is retained in
  canonical PC wound data, but death/incapacitation behavior is not specified.
  Define the terminal consequence before adding it.
