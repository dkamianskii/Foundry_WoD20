# Rules Implementation Status

This document compares the target rules in `RULES_SPEC.md` with the current implementation in version 7.3.0. `ARCHITECTURE.md` describes how the repository works today; this document records the gap between that architecture and the desired final system and orders the work needed to close it.

Status labels:

- **Implemented** — the current PC path implements the requirement end to end.
- **Partial** — supporting behavior exists, but the rule or one of its callers/data contracts differs.
- **Not implemented** — the current system uses a different rule or has no representation for it.
- **Legacy compatibility** — retained behavior for non-PC actor types; it is not the target PC implementation.

## 1. Executive status

The repository has completed the package rename, the PC Willpower redesign, Splat compatibility for that redesign, zero-pool automatic failure, and the specified botch comparison. The main conversion is not otherwise complete. Dice evaluation still implements configurable WoD20-style ones, tens, and specialities around that botch comparison. Health still uses seven configurable legacy wound levels and aggregate damage counts. Damage, weapons, and armor do not yet model the specification's independent nature/lethality, concentrated damage, or effective Protection pipeline.

The remaining work should be done in this dependency order:

1. establish stable rule result/data contracts and tests;
2. replace the generic Test evaluator;
3. replace the PC Health and wound-resolution model;
4. add damage-source, weapon, and armor fields;
5. connect attack, Damage Test, defense, wound conversion, and chat output;
6. migrate actors/items/Splats/compendia and decide the legacy-actor support boundary;
7. remove or clearly scope obsolete settings and compatibility code.

## 2. Work already implemented

### 2.1 Package identity and compatibility

**Status: Implemented, with a runtime compendium compatibility boundary.**

- `system.json` uses package id `wod-advanced`, version `7.3.0`, and Foundry v14 compatibility.
- runtime paths, settings namespaces, flags, tours, source compendium UUIDs, and pack metadata use `wod-advanced`.
- the internal object names `CONFIG.worldofdarkness` and `game.worldofdarkness` intentionally remain; these are JavaScript API names, not the package id.
- `module/scripts/drop-helpers.js::NormalizeCompendiumUuid` converts imported `Compendium.worldofdarkness.*` references to the active system id.
- bundled LevelDB records may still contain old namespace bytes. They are readable through normalization, but should be rebuilt when their source content is next migrated.

### 2.2 PC Willpower wound track

**Status: Implemented for PC actors; legacy actors retain their old representation.**

Persistent data and derivation:

- `module/actor/datamodel/base/actor_willpower.js` defines `system.willpower.damage.light/heavy`.
- `module/actor/datamodel/pc-actor-datamodel.js` includes and backfills the schema.
- `module/scripts/willpower.js::getWillpowerState` derives maximum, current, full, exhausted state, and display boxes from Composure, Resolve, and wound counts.
- `WoDActor._preUpdate` clamps the track if Composure or Resolve changes.

Sheet and click flow:

```text
PCActorSheet stats context
  -> getWillpowerState
  -> templates/actor/parts/stats_willpower.hbs
  -> editWillpower / context-menu action
  -> OnWillpowerCounterChange / OnWillpowerCounterClear
  -> getWillpowerUpdate
  -> actor.update(system.willpower.damage.light/heavy)
```

Roll and spend flow:

- Willpower is rollable through the normal roll dispatcher.
- `module/dialogs/dialog-generalroll.js` can choose current or full Willpower.
- current equals empty boxes; full ignores light but not heavy wounds.
- `DiceRoller` calls `spendWillpower` for a PC, adds a light wound or upgrades light to heavy when exhausted, grants one automatic success, and prevents botch.
- an all-heavy track cannot be spent further.

Compatibility and migration:

- `createWillpowerAdvantageFacade` supplies a transient read-compatible `actor.system.advantages.willpower`; it is not persisted.
- `WoDActor._prepareCharacterData` excludes legacy Willpower items and rebuilds the facade.
- `DropHelper` skips Willpower Advantages during Splat installation and direct drops, so templates use the base PC track.
- migration `7.3.0` in `module/migration.js` converts spent temporary Willpower to light wounds and removes the obsolete PC Willpower Advantage. Details are in `MIGRATION.md`.

### 2.3 Exhaustion and zero-pool Tests

**Status: Implemented, with one intentional UI override noted below.**

- `DiceRollContainer.exhaustionpenalty` distinguishes automatic derivation (`null`) from explicit `0` or `-2`.
- `DiceRoller` automatically applies `-2` to exhausted PC Tests when the caller does not explicitly choose a value.
- `DialogGeneralRoll` shows a checked-by-default “Use exhausted penalty (-2)” checkbox for an exhausted PC and writes `-2` or `0` to the request.
- wound and exhaustion penalties are additive.
- a final pool at or below zero is clamped to zero, creates no `Roll` objects, returns failure with zero successes, and sets `zeroPoolFailure`, even if automatic successes were also requested.
- `templates/dialogs/roll-template.hbs` explains the automatic failure for standard, attack, and damage cards.
- all seven catalogs contain `wod.dice.zeropoolfailure` and `wod.dialog.useexhaustedpenalty`.

`RULES_SPEC.md` states that exhaustion applies `-2` to all Tests. The general-dialog checkbox permits a user to suppress it. This is the currently requested UI behavior, but it is a deliberate exception/override to keep documented if the specification is intended to be mandatory.

## 3. Requirement matrix

### 3.1 Generic Dice Tests

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Final pool is base + bonuses - penalties | Partial | Dialogs assemble pools and `DiceRoller` adds wound/exhaustion penalties, but modifiers are distributed across dialogs and `BonusHelper`. | Define one normalized Test request/modifier contract and make all dialog/API callers use it. |
| Minimum pool 0; zero dice means automatic failure | **Implemented** | `DiceRoller` skips all rolls and sets `zeroPoolFailure`. | Add permanent automated coverage for general, attack, damage, multi-target, and automatic-success cases. |
| Difficulty range 3–9, default 6 | Not implemented | Lower limit comes from configurable `lowestDifficulty` (currently legacy values); no universal maximum clamp. | Clamp after every modifier to 3–9 in the evaluator; set default 6; update controls and retire/confine the legacy minimum setting. |
| Each die at or above difficulty is one raw success | Partial | Threshold counting exists, but extra-ten and ones settings mutate the same running success value. | Track `rawSuccesses` independently before resistance. |
| Resistance defaults to 0 and subtracts raw successes | Not implemented | There is no first-class resistance field/result. Ones directly subtract configured successes. | Add request `resistance`, default 0, and result fields for base/final resistance. |
| Each natural 1 increases resistance by 1 | Not implemented | Ones subtract a configurable `theRollofOne` amount only under legacy origin/favored/settings rules. | Count every rolled 1, add that count to resistance, and remove legacy branching from the target evaluator. |
| Each natural 10 succeeds and explodes recursively | Partial | Explosions and extra successes exist but are controlled by `explodingDice`, speciality, and `tenAddSuccess`. | Make every 10 worth its normal success and enqueue one die recursively; prevent settings from changing the target rule. |
| `net = max(0, raw - resistance)` | Partial | Final successes are clamped, but raw and resistance are not separate outputs. | Compute and expose the specified fields without mutating raw successes. |
| Botch iff rolled ones > raw successes, before clamp | **Implemented** | `DiceRoller` separately counts per-target natural 1s and raw successful dice, then evaluates the predicate before ordinary success/failure classification. Existing Willpower, origin, and speciality rules can explicitly prevent or downgrade a botch. | Add permanent automated coverage for exploding dice, automatic successes, multi-target rolls, and each botch-prevention gate. |
| Failure and margin of failure | Partial | Failure at zero exists; margin is absent. | Add `marginOfFailure = max(0, resistance - rawSuccesses)` and render it. |
| Success and additional successes | Partial | Success classification exists; some weapon code locally calculates successes minus one. | Add `additionalSuccesses = max(0, netSuccesses - 1)` to the common result and remove caller recomputation. |
| Specialization reduces difficulty by 1 before clamp | Partial | Dialogs apply setting-controlled speciality effects inconsistently; default reduction may be zero. | Represent applicable/enabled specialization on the request, apply exactly `-1` in the evaluator, then clamp to 3–9. |

Primary files: `module/scripts/roll-dice.js`, all builders in `module/dialogs/`, `module/actor/api-handler.js`, `module/scripts/action-helpers.js`, `module/settings.js`, `wod.js`, `templates/dialogs/roll-template.hbs`, and `lang/*.json`.

### 3.2 Willpower

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| Maximum is Composure + Resolve | **Implemented** | Derived from attribute `value` fields. | Decide whether future derived attribute bonuses should affect maximum; the current rule uses base values. |
| Empty/light/heavy wound boxes | **Implemented** | Actor-owned counts render health-style boxes. | Add focused tests for click transitions and maximum shrink/growth. |
| Spend adds light; exhausted spend upgrades light to heavy | **Implemented** | `spendWillpower` uses `getWillpowerUpdate`. | None for PC path. |
| Spend grants one automatic success and prevents botch | **Implemented** | PC branch in `DiceRoller`. | Revalidate after the evaluator rewrite, especially zero-pool precedence. |
| Exhaustion is `-2` until an empty box exists | **Implemented with override** | Automatic in the evaluator; general dialog may explicitly disable it. | Confirm whether the checkbox is a debugging/user override or whether the spec should state it is optional. |
| Current and full Willpower rolls | **Implemented** | General roll dialog selects current/full. | Ensure every future roll entry point uses the same selector contract. |
| Base PC always has Willpower; Splats do not reinstall it | **Implemented** | PC schema plus Splat/direct-drop filtering. | Rebuild affected compendia to eliminate obsolete Willpower content when convenient. |
| Legacy actor conversion | Legacy compatibility | Non-PC actors still use permanent/temporary Willpower. | Decide whether legacy actors remain supported, are migrated to PC, or receive the new schema separately. |

### 3.3 Health and wounds

| Requirement | Status | Current implementation | Required change |
| --- | --- | --- | --- |
| `maxHealth = 3 + Strength + Endurance + healthBonus` | Not implemented | Maximum is the sum of Splat-configured wound-level boxes plus bonuses. The current attribute set has Stamina, not an explicit Endurance field. | Resolve the Endurance data mapping, add one authoritative max calculation, and migrate/recalculate actor tracks. |
| Exactly five levels | Not implemented | Seven legacy levels: bruised, hurt, injured, wounded, mauled, crippled, incapacitated. | Replace the PC schema/config/context with Bruised, Hurt, Wounded, Mauled, Crippled. |
| Even distribution, remainder severe-first | Not implemented | Splat documents store per-level values. | Implement a deterministic distribution helper derived from max; stop treating Splat counts as canonical. |
| Penalties 0/-1/-2/-3/-5 | Partial | Levels contain penalties, but the current seven-level configuration and selection rule differ. | Define the five fixed penalties in the new health service/config. |
| Penalty from most severe box containing heavy/aggravated; no stacking | Not implemented | Penalty is based on aggregate damage position and does not distinguish severity for activation. | Derive active penalty from resolved boxes after each mutation. |
| Markers light `/`, heavy `X`, aggravated `Ж` | Partial | Counts use bashing/lethal/aggravated and display `/`, `x`, `*`. | Rename/model target severities and render exact target markers. |
| Fill least to most severe | Partial | Display arrays are filled in order, but storage is aggregate counts rather than resolved boxes. | Introduce an ordered wound-track resolver or a canonical ordered box representation. |
| `2 light -> heavy`, `2 heavy -> aggravated` | Not implemented | Overflow upgrades differ: excess bashing upgrades existing bashing one-for-one; lethal overflow is discarded. | Implement pairwise recursive combination. |
| Replacement, displacement, recursive cascades | Not implemented | `ApplyDamageWithOverflow` operates on aggregate capacities and does not implement the specified cascade. | Replace it with a pure resolver that returns the complete final track and overflow/death state. |

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
2. Resolve “Endurance”: map it to current Stamina or add a new attribute. Record the decision in `RULES_SPEC.md` before persisting data.
3. Decide whether exhausted penalty suppression is an intentional rule option. Align `RULES_SPEC.md`, the checkbox label, and evaluator behavior.
4. Define serializable contracts for `TestRequest`, `TestResult`, `DamageSource`, `DamageResolution`, and resolved health boxes. Keep UI/display strings out of core rule objects.
5. Add pure-unit fixtures for every numerical example and boundary in the specification, plus current Willpower and zero-pool regressions. Mock Foundry only at the document/chat boundary.

### Phase 1 — Replace the Test evaluator

1. Refactor `DiceRollContainer` or introduce a new request object containing base pool, typed modifiers, difficulty, resistance, specialization, automatic successes, botch prevention, targets, and origin metadata.
2. Move final-pool and 3–9 difficulty clamping into one evaluator; dialogs should report inputs, not enforce core arithmetic independently.
3. Evaluate dice with recursive tens while separately counting dice, ones, and raw successes.
4. Calculate resistance, pre-clamp botch, net successes, margin of failure, and additional successes exactly once.
5. Preserve zero-pool precedence: no dice, no explosions, zero net successes, automatic failure.
6. Adapt Willpower spending to the new request/result without regressing its persisted wound transaction.
7. Update every dialog, the PC API, initiative/special actions as applicable, and multi-target callers.
8. Update chat cards/localization to show the new result fields and retain Foundry `Roll` objects for actual rolled dice.
9. Deprecate, migrate, or scope conflicting settings (`theRollofOne`, ten/explosion switches, speciality success/botch settings, configurable minimum difficulty).

### Phase 2 — Replace PC Health persistence and wound resolution

1. Add the chosen Endurance mapping and calculate maximum Health from the formula plus `BonusHelper` health bonus.
2. Replace seven Splat-configured PC levels with five derived level groups and severe-first remainder distribution.
3. Choose canonical persistence:
   - recommended: ordered box severities, because displacement is inherently positional; or
   - compact severity counts plus a rigorously canonical resolver, if every position can be reconstructed without ambiguity.
4. Implement a pure recursive wound resolver for insertion, displacement, pairwise upgrades, aggravated caps, healing, and overflow.
5. Replace `CombatHelper.ApplyDamageWithOverflow` for PC callers and make `PCActorAPI.modifyHealth` use the new resolver.
6. Derive the active penalty only from the most severe level containing heavy/aggravated damage.
7. Replace `calculateHealth` and PC sheet actions/templates with the new resolved-box context and exact markers.
8. Update totals, initiative, pain-ignore logic, soak callers, favorites/macros if affected, and Splat editing so old level counts are no longer treated as canonical.
9. Add a versioned actor/Splat migration and document reversibility/data loss in `MIGRATION.md`.

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

- Endurance attribute choice if it is not mapped to Stamina;
- five-level Health configuration and maximum formula;
- canonical ordered wound state or replacement severity counts;
- damage nature, lethality, and concentration on damage sources;
- normalized weapon type;
- armor Protection, applicable nature rules, and degradation state;
- weapon armor-piercing semantics;
- removal or reinterpretation of legacy dice-rule settings;
- any conversion of non-PC actors to the new Willpower/Health model.

Do not derive new canonical fields only in sheet context. They must live in typed models (or explicitly supported legacy schemas), migrate existing documents, and be regenerated in bundled Splat/compendium sources.

## 6. Verification gates

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

- **PC-only versus all actor types:** the new Willpower implementation is PC-only, while the desired Health/damage rules are not explicitly scoped. This must be decided before schema work.
- **Endurance identity:** no explicit current Endurance attribute was found; the system uses Stamina. A silent mapping would make the rule ambiguous.
- **Mandatory exhaustion:** code permits the general-dialog checkbox to suppress `-2`, while the specification reads as mandatory.
- **Settings authority:** many current dice settings conflict with fixed target rules. Decide whether they are removed, migrated to fixed values, or retained only in a named legacy rules mode.
- **Health canonical form:** ordered boxes simplify displacement and penalty selection; aggregate counts simplify storage but risk losing positional meaning.
- **Armor degradation details:** the specification says AP affects degradation but does not define the degradation formula. That formula must be added before implementation.
- **Overflow at maximum aggravated Health:** death/incapacitation behavior is not specified and the current helper silently limits some overflow. Define the terminal rule before replacing it.
