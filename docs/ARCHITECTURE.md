# World of Darkness V20 Advanced System Architecture

This document describes the architecture of the repository as it exists in version 7.4.0 (Foundry VTT v14). It records current behavior, including partially migrated and compatibility paths; it is not the target rules definition. See `RULES_SPEC.md` for desired rules and `IMPLEMENTATION_STATUS.md` for the requirement-by-requirement gap analysis and roadmap.

## 1. Executive summary

The system is in the middle of an architectural migration and effectively contains two implementations behind shared document classes and roll code:

- **PC/ApplicationV2 path:** the single `PC` actor type uses a typed Foundry `DataModel`, an `ActorSheetV2`, and mostly item-centric character construction. A dropped `Splat` item configures the actor; `Ability`, `Advantage`, `Sphere`, and `Realm` items are typed documents. Embedded items are projected into transient `actor.system.abilities` and `actor.system.advantages` lookup objects during preparation. Willpower is the exception: its damage is canonical actor data and preparation creates a transient Advantage-shaped compatibility facade.
- **Legacy/AppV1 path:** the named actor types (`Mortal`, `Vampire`, `Werewolf`, etc.) use `template.json`, persist abilities and advantages directly under `actor.system`, and use `MortalActorSheet` plus game-specific subclasses. Most equipment, feature, trait, and power items also remain `template.json` types with the legacy `WoDItemSheet`.

Both paths converge on:

- `WoDActor` and `WoDItem` document lifecycle logic;
- `ActionHelper.RollDialog` for dispatching sheet actions to dialogs;
- dialog-specific pool construction;
- `DiceRollContainer` and `DiceRoller` for actual d10 evaluation;
- `templates/dialogs/roll-template.hbs` and `ChatMessage.create` for chat cards;
- `CONFIG.worldofdarkness`, settings, localization keys, bonus helpers, and common health/combat helpers.

For a derivative game, the most consequential design choice is whether to retain both paths or standardize on the PC/typed-model path. Ordinary PC advantages have an extra `.system` level in their runtime projection; legacy advantages do not. PC Willpower is neither representation: it is stored at `actor.system.willpower.damage`, while legacy actors still use `actor.system.advantages.willpower`.

## 2. Top-level layout and runtime entry points

| Area | Relevant files | Responsibility |
| --- | --- | --- |
| Manifest and legacy schemas | `system.json`, `template.json` | The `wod-advanced` package id, Foundry metadata, document types, languages, compendia, HTML fields, and legacy template inheritance |
| Runtime entry point | `wod.js` | `init`, `setup`, and `ready`; registers settings, models, documents, sheets, helpers, hooks, icons, migrations, and global lookup data |
| Static configuration | `module/config.js` | Populates the imported `wod` object with sheet types, splats, eras, attribute/ability lists, damage types, wound levels, and other localization-key maps |
| Document classes | `module/actor/data/wod-actor-base.js`, `module/items/data/wod-item-base.js` | Shared Actor and Item preparation/lifecycle behavior |
| Typed models | `module/actor/datamodel/`, `module/items/datamodel/` | Foundry v14 schemas for PC and the five new item types |
| Sheets | `module/actor/template/`, `module/items/template/` | ApplicationV2 PC/new-item sheets and AppV1 legacy sheets |
| Interaction controller | `module/scripts/action-helpers.js` | Routes HTML datasets to roll dialogs and sheet actions |
| Rules/calculation services | `module/scripts/roll-dice.js`, `totals.js`, `health.js`, `combat-helpers.js`, `bonus-helpers.js` | Dice, totals, health display, damage overflow, initiative/movement, and bonuses |
| UI dialogs | `module/dialogs/` | Build roll pools and options for general, power, weapon, soak, frenzy, shapechange, and casting rolls |
| Rendering | `templates/`, `module/templates.js`, `module/handlebars.js` | Sheets, partials, dialogs, chat cards, template preloading, and custom helpers |
| Integration | `module/hooks.js`, `module/ui/` | Render-time classes/themes, item dialog grouping, settings sidebar, and migration UI |
| Localization | `lang/*.json` and `system.json` language declarations | Seven translation catalogs keyed primarily under `wod.*` |

### High-level runtime flow

```text
system.json loads wod.js
  -> Hooks.once("init")
     -> systemSettings()
     -> build CONFIG.worldofdarkness
     -> register typed data models
     -> install WoDActor / WoDItem document classes
     -> register Actor and Item sheets
     -> preload templates and register Handlebars helpers/partials
     -> register render and integration hooks
     -> expose game.worldofdarkness lookup data/icons
  -> Hooks.once("ready")
     -> discover installed powers
     -> register dynamic shape-form status icons
     -> tours and migration/version work (GM)
     -> cache language and dark-mode state
```

The package id and all runtime asset/template/settings/flag/compendium namespaces are `wod-advanced`. The internal JavaScript compatibility namespaces remain `CONFIG.worldofdarkness` and `game.worldofdarkness`; they are object names rather than Foundry package ids. Old `Compendium.worldofdarkness.*` references found in imported Splat data are normalized at runtime by `DropHelper`.

## 3. Actor data models

### 3.1 Declared actor types

`template.json` declares `PC`, `Mortal`, `Werewolf`, `Mage`, `Vampire`, `Changeling`, `Hunter`, `Demon`, `Wraith`, `Mummy`, `Exalted`, `Changing Breed`, and `Creature`. `system.json` declares the rich-text fields for `PC`. `wod.js` registers only `CONFIG.Actor.dataModels.PC = PCDataModel`; all other types therefore continue to use the legacy `template.json` definitions.

### 3.2 PC typed model

Relevant files:

- `module/actor/datamodel/pc-actor-datamodel.js` — `PCDataModel`.
- `module/actor/datamodel/base/actor_attributes.js` — eleven attribute records (20th- and 5th-edition alternatives coexist and visibility selects the active set).
- `module/actor/datamodel/base/actor_health.js` — PC Health bonus, ordered wound severities, derived penalty compatibility fields, and chimerical compatibility counters.
- `module/actor/datamodel/base/actor_willpower.js` — actor-owned PC Willpower light/heavy/aggravated damage counters.
- `module/actor/datamodel/base/actor_settings.js` — feature flags, splat/variant/era, maximums, and soak permissions/bonuses.
- `module/actor/datamodel/base/actor_traits.js` — aggregate health-level value/max.
- `module/actor/datamodel/_module.js` — model export used by `wod.js`.

Important PC schema branches:

- `settings`: creation/update flags, splat/game/variant/era, feature flags (`haswillpower`, `hasgifts`, `hasspheres`, etc.), attribute/ability/power maximums, and per-damage-type soak configuration.
- `bio`: basic identity fields, dynamic `splatfields`, and HTML fields.
- `attributes`: value, bonus, total, max, type, label, speciality, ordering, visibility, and favored state.
- `soak`: derived normal and chimerical pools.
- `health.bonus`: a persistent non-negative integer edited in Options → Combat.
- `health.wounds`: the canonical ordered normal-PC wound array; every entry is
  `light`, `heavy`, or `aggravated`. Array position is box position and removal
  compacts later wounds toward the start of the track.
- `health.damage.woundlevel` / `.woundpenalty`: derived compatibility outputs;
  `health.damage.chimerical` retains legacy bashing/lethal/aggravated counters.
- `willpower.bonus`: persistent non-negative manual adjustment edited in Options → Combat.
- `willpower.damage`: persistent `light`, `heavy`, and `aggravated` wound counts. Maximum/current/full values, five levels, severity-specific penalties, and display boxes are derived rather than persisted.
- `traits.health.totalhealthlevels`: derived current/max health boxes.
- `initiative`, `conditions`, `movement`, `gear`, and `favoriterolls`.

`PCDataModel.migrateData` backfills chimerical soak and the PC Willpower damage
object. PC Health conversion is delegated to
`module/scripts/health.js::migratePCHealthSource`. That helper converts only a
source which actually contains legacy Health counters or seven-level fields.
This presence check is important because Foundry may pass partial update data
through model migration: a wound-only update must not synthesize `bonus: 0` or
replace omitted wounds. It does not define persistent `abilities` or
`advantages`: `WoDActor._prepareCharacterData` creates those runtime
projections from embedded items and installs the transient Willpower
compatibility facade.

### 3.3 Legacy actor templates

`template.json` composes each legacy actor type from named templates:

- `base`: identity, narrative fields, gear/money, conditions, soak, initiative, movement, and generic settings.
- `ability`: a fixed object of all built-in talent/skill/knowledge records.
- `mortal`: attributes, advantages, health, and flags for optional resource families.
- game templates: `werewolf`, `mage`, `vampire`, `changeling`, `hunter`, `demon`, `wraith`, `mummy`, `exalted`, and `creature` add their specific fields.

Examples include `werewolf.renown` and `shapes`, `mage.spheres` and `quintessence/paradox`, `vampire.generation` and clan/sect data, `changeling` chimerical health, `wraith` corpus/pathos/angst, and `exalted` essence pools.

### 3.4 Document preparation and derived values

The common document class is `WoDActor` in `module/actor/data/wod-actor-base.js`.

Main lifecycle call chain:

```text
Foundry Actor.prepareData()
  -> WoDActor.prepareData()
     -> super.prepareData()
        -> Foundry base data, embedded documents/effects, prepareDerivedData()
     -> WoDActor._prepareCharacterData(actor)
```

`prepareDerivedData`:

- for PC actors, calls `_handleWoundLevelCalculations` and `CombatHelper.CalculateMovementv2`;
- for legacy actors, derives/clamps Willpower, dispatches to game-specific calculation methods, derives wounds, and calls `CombatHelper.CalculateMovement`.

`_prepareCharacterData` is the major normalization layer. On PC actors it:

1. filters embedded items into abilities, advantages, spheres, realms, powers, shapes, and other groups, deliberately excluding legacy Willpower Advantage items;
2. applies configured trait maximums and 20th/5th attribute visibility;
3. builds `system.abilities[key] = ability.toObject()` and ordinary `system.advantages[key] = advantage.toObject()` projections;
4. derives PC Willpower through `getWillpowerState`, installs `createWillpowerAdvantageFacade(...)` at `system.advantages.willpower` for old readers, and keeps `settings.haswillpower` enabled;
5. derives presence flags for other resource families;
6. applies special resource rules such as path bearing, virtue limits, blood-pool generation limits, and quintessence/paradox constraints;
7. creates list/group data consumed by sheets and rolls and may batch-update embedded items where persisted values are stale.

`WoDActor._preUpdate` also clamps PC Willpower wound counts when Composure or Resolve changes. In the same hook it normalizes PC Health wounds and refreshes maximum/current Health and the compatibility wound penalty whenever relevant Actor data changes. `_onUpdateDescendantDocuments` performs the same derived-Health refresh when activation or editing of an embedded `health_buff` changes maximum Health.

On legacy actors the same document class works directly with persistent `system.abilities`, `system.advantages`, and game-specific branches. `_preCreate` uses `CreateHelper` to seed type/era data. `_onUpdate` and `_onUpdateDescendantDocuments` coordinate recalculation, `calculateTotals`, and embedded-item changes. `_setItems` synchronizes item maximums/bonuses where actor changes affect them.

Dependencies:

- `CreateHelper` and `DropHelper` create/configure actors and attach template content.
- `calculateTotals` consumes attributes, items, shape state, armor, and `BonusHelper` results.
- `CombatHelper` consumes derived attribute totals and health state.
- actor sheets assume the preparation-created lookup/list structures exist.
- roll dialogs branch explicitly on `actor.type === "PC"` to account for the item projection's extra `.system` level.

## 4. Item and advantage data models

### 4.1 Item types and the migration boundary

`template.json` declares: `Splat`, `Ability`, `Advantage`, `Sphere`, `Realm`, `Armor`, `Bonus`, `Experience`, `Feature`, `Fetish`, `Item`, `Melee Weapon`, `Ranged Weapon`, `Power`, `Rote`, and `Trait`.

Typed Foundry models are registered only for:

| Type | Model file | Core data |
| --- | --- | --- |
| `Ability` | `module/items/datamodel/ability-item-datamodel.js` | id/reference/type/label, value/bonus/total/max, speciality, description; settings include visibility, favorite, and weapon/power roles |
| `Advantage` | `module/items/datamodel/advantage-item-datamodel.js` | id/group/label, permanent/temporary/max/roll/per-turn, bearing, imbalance, description; settings control which pools exist and how roll value is selected |
| `Sphere` | `module/items/datamodel/sphere-item-datamodel.js` | id/reference/label, value/max, speciality, technocracy flag, description |
| `Realm` | `module/items/datamodel/realm-item-datamodel.js` | id/reference/label, value/max, speciality, affinity flag, description |
| `Splat` | `module/items/datamodel/spalt-item-datamodel.js` | character-template settings plus arrays of bio fields, abilities, advantages, features, and powers, and a health schema |

All share `module/items/datamodel/base/item_base_settings.js` for lifecycle/visibility/order fields. The filename `spalt-item-datamodel.js` is misspelled but is the active Splat model.

The remaining item types use legacy template composition:

- `settings`: creation/active/visible/removable/order/version/parent linkage.
- `base`: reference, HTML description/details, properties, and `bonuslist`.
- `feature`: type/placement/level/value/max.
- `object`: equipment/container/equipped/magical/era fields.
- `weapon`: attack pool, damage pool/type, difficulty, strength, piercing, concealment, and handedness.
- `power`: category, two dice selectors, custom ability, bonus/difficulty, rollability, and resource-spend flags.

Type additions include armor soak and dexterity penalty, ranged weapon mode/clip/range/rate, Rote sphere requirements, and Trait roll/soak/icon fields.

### 4.2 `WoDItem` lifecycle

`module/items/data/wod-item-base.js` installs `WoDItem` for every item type.

- `_preCreate` stamps creation/version fields at the correct typed or legacy path, chooses default images, initializes ability id/label/type, disables legacy soak behavior on shape forms, and gives PC advantages an order.
- `_preUpdate` dispatches to `_handleAbilitiesCalculations`, `_handleAdvantagesCalculations`, or `_handlePowerCalculations`.
- ability/power handlers enforce the owning actor's configured maximum.
- `_handleAdvantagesCalculations` implements legacy/resource Advantage rules: 5th-edition Willpower for actors still using a Willpower item, virtue maximums, path bearing, permanent/temporary clamping, and the derived `roll` selection controlled by `advantageRolls` and item settings. It is not the canonical PC Willpower handler.

Advantages are therefore both resources and rollable traits. Their `settings.usepermanent`, `usetemporary`, `usebothrolls`, `useroll`, and `highertemporary` flags determine data validation and which rating becomes `system.roll`. The actor-owned PC Willpower track is a deliberate exception and is adapted to this interface only through a transient facade.

### 4.3 Splat/template application

The `Splat` item is the PC character-construction model. Its arrays describe what should be installed on a PC and its settings configure the actor. The major implementation points are:

- `module/items/template/splat-item-sheet.js` — edits Splat settings and content arrays.
- `module/scripts/drop-helpers.js` — handles dropping a Splat or individual item onto an actor and applies template data.
- `module/scripts/create-helpers.js` — creates abilities and game/era/variant defaults.
- `module/scripts/item-helpers.js` and `item-actions.js` — item relationships, actions, and cleanup.
- `module/actor/template/pc-actor-sheet.js::_onDropItem` — enforces the PC sheet's Splat/drop rules before delegating.

Dependencies: actor preparation expects specific embedded item ids/groups; power and weapon dialogs read legacy item fields; bonus calculation scans active/equipped embedded items and their `bonuslist` arrays.

PC Splat/drop compatibility rules are concentrated in `DropHelper`:

- `IsWillpowerAdvantage` recognizes legacy Willpower entries and prevents them from being installed by a Splat or direct item drop; the PC keeps its actor-owned track instead.
- `NormalizeCompendiumUuid` rewrites old `Compendium.worldofdarkness.*` references to the current `Compendium.wod-advanced.*` namespace before lookup and storage.
- Splat replacement deletes prior embedded content through the target actor, preserves `settings.haswillpower`, and guards missing compendium documents.

Migration `7.3.0` converts an existing PC Willpower Advantage's spent temporary points into actor-owned light wounds, ensures the new damage object exists, and removes the obsolete embedded item. Bundled LevelDB data may still contain old namespace strings; runtime normalization is the compatibility boundary until those packs are rebuilt.

## 5. Actor sheets

### 5.1 PC ActorSheetV2

`PCActorSheet` in `module/actor/template/pc-actor-sheet.js` extends `HandlebarsApplicationMixin(ActorSheetV2)`.

Its `PARTS` are navigation, bio, stats, powers, combat, gear, feature, effects, and settings. `_prepareContext` creates shared context; `_preparePartContext` delegates to part-specific context builders in the same file. Important prepared values include enriched HTML, lists of embedded items, grouped advantages/powers, `calculateHealth` output, permission/lock state, and select-list data.

The stats context calls `getWillpowerState(actor)` and `templates/actor/parts/stats_willpower.hbs` renders the same five-level layout and diagonal CSS wound marks as Health. Each box is empty, light (`/`), heavy (`X`), or aggravated (an `X` plus a centered vertical stroke); empty boxes are available Willpower. The `editWillpower` action maps to `OnWillpowerCounterChange`, while the sheet's context-menu listener calls `OnWillpowerCounterClear`; both delegate to `getWillpowerUpdate` and persist `system.willpower.damage.light/heavy/aggravated`. Left-click advances light to heavy to aggravated and then clears; right-click clears the selected severity.

PC stats and combat contexts call `calculateHealth`, which returns the derived
five-level Health state. `stats_health.hbs` renders its boxes and the exact
light/heavy/aggravated markers. In Options → Combat, the former editable
per-level values and penalties are replaced by one editable Health Bonus plus
read-only formula inputs, maximum, and distribution.

Normal-PC box interaction is severity-based rather than arbitrary positional
editing. `OnSquareCounterChange` delegates to `cycleHealthBox`:

- clicking any empty box appends one light wound at the first empty position;
- clicking a light box promotes the first light wound in track order to heavy;
- clicking a heavy box promotes the first heavy wound in track order to aggravated;
- clicking an aggravated box removes that wound and compacts later wounds;
- right-clicking any occupied box removes that exact box through `setHealthBox`
  and likewise compacts the track.

Normal-PC Health and Willpower use the shared diagonal-gradient wound marks.
Legacy and chimerical counters keep their older interaction path.

Static `DEFAULT_OPTIONS.actions` maps `data-action` events to functions imported mostly from `module/scripts/action-helpers.js` and `module/scripts/item-actions.js`. Typical flow:

```text
HBS data-action / form change
  -> PCActorSheet action or onSubmitActorForm
  -> ActionHelper / item action / actor.update / item.update
  -> WoDActor or WoDItem lifecycle recalculation
  -> sheet rerender and part-context preparation
```

The sheet also owns drag/drop/reordering, lock behavior, tab visibility based on Splat flags and permissions, dot/square inputs, collapsible state stored in user flags, and health/quintessence context menus.

### 5.2 Legacy ActorSheetV1 family

`MortalActorSheet` in `module/actor/template/mortal-actor-sheet.js` extends `foundry.appv1.sheets.ActorSheet`. All named game sheets subclass it:

- `werewolf-actor-sheet.js`
- `mage-actor-sheet.js`
- `vampire-actor-sheet.js`
- `changeling-actor-sheet.js`
- `hunter-actor-sheet.js`
- `demon-actor-sheet.js`
- `wraith-actor-sheet.js`
- `mummy-actor-sheet.js`
- `exalted-actor-sheet.js`
- `changingbreed-actor-sheet.js`
- `creature-actor-sheet.js`

Each supplies a top-level `templates/actor/<game>-sheet.html`, extends `getData` for its game, and may add listeners. The base class performs HTML enrichment, health-list preparation, variant prompting, era/variant switching, drag/drop, counters, item CRUD, activation/equipment, roll dispatch, and chat sending.

Legacy roll flow begins at `.vrollable` or `.macroBtn` listeners in `activateListeners`, then `_onRollDialog`, then `ActionHelper.RollDialog`. Item edits and counter changes update either the actor's persistent structures or embedded item data.

### 5.3 Sheet dependencies

- Both sheet generations depend heavily on `CONFIG.worldofdarkness` maps and translation keys.
- PC context depends on transient projections created by `WoDActor._prepareCharacterData`.
- PC Willpower context and actions depend on `module/scripts/willpower.js`; templates must not recreate or drop an Advantage item for it.
- The PC sheet imports `ActionHelper`, which imports the shared roll stack. A syntax/module-load failure in `module/scripts/roll-dice.js` can therefore prevent PC sheet parts from initializing and leave only Foundry's application frame/title visible. Treat a title-only PC sheet as a likely upstream import error and check the browser console before debugging the sheet templates.
- Legacy templates directly address `actor.system.abilities`, `advantages`, and game branches.
- `module/hooks.js` applies language, splat, font, and dark-mode CSS classes after rendering.
- `BonusHelper`, `SelectHelper`, `DropHelper`, `ItemHelper`, and `ActionHelper` act as service/controller modules; the sheets themselves remain large orchestration classes.

## 6. Item sheets

### 6.1 Typed ApplicationV2 sheets

`WoDItemSheetV2` in `module/items/template/item-sheet-v2.js` is the common base. It supplies shared context, permissions, image editing, item deletion, form submission, tabs, editor support, and helpers for nested fields.

Subclasses and templates:

- `AbilityItemSheet` -> `templates/items/ability-sheet.hbs` plus `parts/header-sheet.hbs`.
- `AdvantageItemSheet` -> `templates/items/advantage-sheet.hbs`.
- `SphereItemSheet` -> `templates/items/sphere-sheet.hbs`.
- `RealmItemSheet` -> `templates/items/realm-sheet.hbs`.
- `SplatItemSheet` -> header/navigation plus Splat main, bio, abilities, and feature parts.

Each subclass prepares localized options and item-specific context. Splat context preparation is substantially larger because it edits arrays that will later become actor content.

### 6.2 Legacy AppV1 item sheet

`WoDItemSheet` in `module/items/template/item-sheet.js` serves `Armor`, `Bonus`, `Experience`, `Feature`, `Fetish`, `Item`, `Melee Weapon`, `Ranged Weapon`, `Power`, `Rote`, and `Trait`.

Its `template` getter chooses a file in `templates/sheets/` by item type. `getData` enriches descriptions, determines actor/game/splat context, provides configuration lists, and interprets power/weapon subtype data. Listeners edit properties and bonuses and provide type-specific controls.

Dependencies: item forms write data consumed directly by roll dialogs and `BonusHelper`; `WoDItem._preUpdate` then normalizes maximums/resource fields; owning actor descendant-document hooks trigger actor total recalculation.

## 7. Roll pipeline

### 7.1 Entry points

Rolls can start from:

- actor sheet rollable elements and macro icons;
- item/weapon/power buttons;
- the global dice icon listener in `wod.js`;
- the PC-only `actor.api` (`module/actor/api-handler.js`);
- helper calls such as `CombatHelper.RollInitiative`.

The main UI call chain is:

```text
sheet click
  -> PC action `RollDice` or legacy `_onRollDialog`
  -> ActionHelper.RollDialog(dataset, actor)
  -> select dialog/model by dataset and item type
  -> dialog getData/_prepareContext calculates initial pool/options
  -> user submits roll
  -> dialog constructs DiceRollContainer
  -> DiceRoller(container)
  -> Roll("1d10").evaluate() once per die
  -> render roll-template.hbs
  -> ChatMessage.create(...)
  -> return numeric successes to caller
```

`ActionHelper.RollDialog` is the central dispatcher. It opens:

- `DialogGeneralRoll` for attributes, abilities, raw dice, and generic traits;
- `DialogWeaponV2` for melee/ranged attack and damage;
- `DialogPower` subclasses for gifts, rites, disciplines, rituals, arts, edges, lores, arcanoi, hekau, numina, horrors, and Exalted powers;
- `DialogAreteCasting` for Rotes;
- `DialogItem`/`DialogRoll` for generic items and traits;
- `DialogSoakRoll`, `DialogCheckFrenzy`, and `DialogShapeChange` for specialized mechanics;
- direct containers for initiative, paradox, fetish activation, and remaining active.

The PC API bypasses dialogs for `rollAttribute`, `rollAbility`, and `rollAdvantage`, but still constructs the same `DiceRollContainer` and calls `DiceRoller`. All three direct methods accept `options.resistance`, normalize it to a non-negative integer, and default it to 0. Feature, weapon, and power API methods intentionally route back through `ActionHelper.RollDialog`.

### 7.2 Pool construction

`DiceRollContainer` in `module/scripts/roll-dice.js` is the shared request DTO. Important fields are actor, attribute/ability keys, display text, base dice, special dice, bonus, Resistance, Health wound penalty, Willpower wound penalty, difficulty, action/origin, targets, speciality, Willpower use, system text, power type, and incoming/applicable damage. Resistance defaults to `0`. `willpowerpenalty` defaults to `null`, which tells `DiceRoller` to derive the PC's active Willpower wound penalty from the shared five-level table.

Dialogs are responsible for:

1. resolving PC item projections versus legacy actor fields;
2. selecting attribute, ability, advantage, custom ability, sphere/realm, or weapon ratings;
3. applying `BonusHelper` pool and difficulty modifiers;
4. identifying speciality and optionally reducing difficulty;
5. adding wound penalties unless the action ignores them;
6. for the general Test dialog, exposing a fillable Resistance field beside the other Test inputs, initialized to 0 and normalized to a non-negative integer;
7. exposing independent checked-by-default Health and Willpower wound-penalty toggles in the general Test dialog when their effective penalties are nonzero;
8. adding attack successes to damage where configured;
9. setting `origin` (`general`, `power`, `attack`, `damage`, `soak`, or `initiative`) so the evaluator can apply origin-specific rules.

Weapon attack is a two-stage chain: `DialogWeaponV2._rollAttack` builds and evaluates the attack; if it succeeds and damage is rollable it opens/continues in damage state with `extraSuccesses` (usually successes minus one). `_rollDamage` builds target-specific pools and calls the same evaluator.

## 8. Dice evaluation

All ordinary pools are evaluated by `DiceRoller` in `module/scripts/roll-dice.js`.

Evaluation sequence:

1. clamp difficulty to `CONFIG.worldofdarkness.lowestDifficulty` and `CONFIG.worldofdarkness.highestDifficulty`; the runtime hard floor is 3 and the ceiling is 9;
2. add automatic successes from active bonuses;
3. attempt to spend Willpower and apply its configured effect;
4. disable botching for damage/soak when their “ones” settings are off;
5. choose themed dice colors from actor type, Splat, variant sheet, or per-actor dice setting;
6. create a default target when none is supplied, otherwise evaluate each target pool;
7. resolve the Willpower wound penalty from an explicit container value or the PC Willpower track;
8. compute `numberDices = target.numDices + woundpenalty + willpowerpenalty`, clamped to zero;
9. when that value is zero, create no Foundry `Roll` objects, force zero successes and a failure result, and mark `diceResult.zeroPoolFailure`;
10. otherwise evaluate a separate `Roll("1d10")` for each die and collect each face/color;
11. count successful die faces in `rawSuccesses` and natural 1s in `rolledOnes`, while separately accumulating automatic and configurable 10/speciality successes into the running success total;
12. snapshot that running total as `successesBeforeResistance`, add natural 1s to explicit Resistance, subtract total Resistance once, and clamp net successes to zero;
13. classify result as success, failure, or botch; a botch occurs only when botching is allowed and `rolledOnes > rawSuccesses`, while Willpower and origin-specific gates can prevent it and speciality settings can downgrade it to failure;
14. calculate per-target margin of failure and additional successes, applying speciality botch protection;
15. add informational lines (difficulty, speciality, Health and Willpower wound penalties, spent Willpower, automatic successes, soak remainder, and Demon evocation Torment outcome);
16. render and create the chat message, then return the last target's numeric success count.

Important implications:

- It does not evaluate one Foundry pool formula such as `10d10`; it evaluates one Foundry `Roll` per die. All success/botch/explosion logic is custom JavaScript.
- `rolls: allDices` is attached to the chat message so Foundry and modules such as Dice So Nice can still see roll objects.
- A zero final pool is an automatic failure even if the request also contains automatic successes; the chat card renders a localized zero-pool explanation in standard, attack, and damage layouts.
- Multi-target results are displayed together, but the returned `success` variable is the final target's value.
- `rawSuccesses`, `successesBeforeResistance`, and final `success` are distinct values. Raw successes count successful faces for botch/margin rules; the pre-Resistance value also includes automatic and configured extra successes; final success is the clamped value after Resistance and remaining legacy adjustments.
- Natural 1s always add to total Resistance. `useOnesDamage` and `useOnesSoak` control whether those origins may botch; disabling botch does not stop their 1s from contributing Resistance.
- Each displayed target result renders pre-Resistance successes, nonzero total Resistance, the final outcome, and then either margin of failure or additional successes, in that order. The outcome uses a dedicated `tray-test-result` style (`1.25em`, weight `700`) so Botch, Failure, and Success are more prominent than surrounding text.
- Favored attribute/ability flags currently add informational chat metadata only; they do not exempt natural 1s from Resistance.
- Demon Lore Torment compares successful die faces with permanent Torment after the normal roll.

`InitiativeRoll` is separate: it rolls one d10, adds derived initiative, tries to add/update the actor's token combatant, and emits the same chat template.

Dependencies: evaluation depends on settings cached in `CONFIG.worldofdarkness`, `BonusHelper`, actor conditions/data layout, Foundry `Roll`, the dice SVG helpers/icons, localization, and chat rendering.

## 9. Damage and health processing

### 9.1 Health representation and display

Normal PC wounds are canonically stored as ordered severity ids in
`system.health.wounds`; the sheet adjustment is `system.health.bonus`.
`module/scripts/health.js::getHealthState` derives:

- `max = 2 + Strength.value + Stamina.value + manual bonus + active health_buff values`;
- exactly five level groups with severe-first remainder distribution;
- current Health, display boxes, and retained overflow;
- the active fixed penalty from the most severe level containing heavy or aggravated damage.

PC Health and Willpower markers use square-box CSS gradients: one diagonal for light, two diagonals for heavy, and the same two diagonals plus a centered vertical stroke for aggravated. `damage.woundlevel`,
`damage.woundpenalty`, and `traits.health.totalhealthlevels` remain derived
compatibility outputs for existing roll and initiative consumers; they are not
independently editable rules data.

The manual bonus is persisted independently of wounds. Partial wound updates
do not include or default this field; `migratePCHealthSource` deliberately
leaves omitted fields untouched. Active `health_buff` item values are summed
separately and are not written into the manual bonus.

Legacy Actor types continue to store aggregate bashing/lethal/aggravated
counts and seven configured levels. PC chimerical damage also retains its old
counters but is presented against the derived five-level capacity; as before,
the worse normal/chimerical track drives the shared PC penalty. Splat
documents retain their legacy health schema for source compatibility, although
their level counts are no longer applied to PCs.

### 9.2 Applying damage

For normal PCs, `module/scripts/health.js::applyWounds` inserts light, heavy,
or aggravated wounds, resolves least-severe overflow through recursive
pairwise upgrades, and retains unresolved overflow. The specification example
of seven light wounds followed by two heavy wounds resolves to four heavy and
three light wounds.

`CombatHelper.GetApplicableDamageCapacity` and `ApplyDamageWithOverflow` remain the legacy/chimerical mutation path:

- fill empty boxes with the incoming type;
- excess bashing upgrades existing bashing to lethal;
- excess aggravated converts lethal, then bashing, to aggravated;
- excess lethal and damage beyond a fully aggravated track are not resolved as death/torpor by this layer.

The principal automated damage call chain is:

```text
DialogSoakRoll._soakRoll
  -> DiceRoller(soak container)
  -> unsoaked = incoming - successes
  -> _applyUnsoakedDamage
     -> PC normal: actor.api.modifyHealth -> PC wound resolver
     -> PC chimerical or legacy: CombatHelper.ApplyDamageWithOverflow directly
  -> actor.update
  -> WoDActor preparation derives wound level/penalty
```

`PCActorAPI.modifyHealth` accepts the new severity ids and temporarily maps
legacy soak inputs as bashing→light and lethal→heavy. Health-box clicks use
the same canonical wound array but use `cycleHealthBox` for manual interaction:
empty adds light, light promotes the first light, heavy promotes the first
heavy, and aggravated removes/compacts. Right-click removes the exact selected
wound. This prevents users from placing heavy or aggravated wounds arbitrarily
on the track. The adapter intentionally does not implement the later
independent damage-nature/lethality design.

Dependencies: PC Health calculation depends on base Strength and Stamina, the
persistent manual bonus, active Health bonuses, chimerical flags, actor type,
soak dialog input, and actor lifecycle recalculation. Splat-configured legacy
level counts are retained only for source compatibility and do not determine
normal-PC Health capacity or distribution.

## 10. Roll penalties

The canonical wound penalty is `actor.system.health.damage.woundpenalty`, derived by `_handleWoundLevelCalculations`.

General behavior:

- general, ability, attribute, advantage, item, power, shapechange, and weapon attack builders usually copy it into `DiceRollContainer.woundpenalty`;
- frenzy retains its legacy full Health-penalty suppression before evaluation;
- Ignore Pain is resolved centrally: heavy-derived Health and Willpower penalties are ignored, but each track's aggravated-derived penalty remains;
- `DiceRoller` applies it arithmetically to the target pool and clamps the result to zero;
- soak, frenzy, initiative's d10, paradox, and several special rolls explicitly use zero;
- damage rolls use it only when the `usePenaltyDamage` world setting is enabled;
- the chat card displays the localized wound level and numeric penalty when applied.

PC Willpower wounds are the second centralized pool penalty. `getWillpowerState` distributes the track across the same five levels as Health and derives combined, heavy-only, and aggravated-only penalty states. `DiceRoller` applies the combined penalty to every PC Test unless the general dialog explicitly disables it. Health and Willpower penalties are additive; if their sum reduces the pool to zero, no dice are rolled and the Test automatically fails.

Other penalties/bonuses are not unified into a single modifier pipeline. Dialogs query specialized `BonusHelper` methods for attribute, ability, attack, soak, movement, health, initiative, fixed-value, and difficulty effects. Armor applies its configured `dexpenalty` while `calculateTotals` derives Dexterity. A derivative system should treat `BonusHelper` and dialog code together as the effective modifier engine.

## 11. Willpower and other resources

### 11.1 Willpower storage and derived roll value

- PC canonical storage: `actor.system.willpower.damage.light`, `.heavy`, and `.aggravated`, defined by `module/actor/datamodel/base/actor_willpower.js`.
- PC derived state: `module/scripts/willpower.js::getWillpowerState` computes `max = 2 + composure.value + resolve.value + willpower.bonus`, current/full pools, five levels, combined/heavy/aggravated penalties, spend availability, and rendered boxes. Empty boxes are available points; `/` is light, `X` is heavy, and the three-stroke mark is aggravated damage.
- PC compatibility view: `createWillpowerAdvantageFacade` places a transient Advantage-shaped object at `actor.system.advantages.willpower` during actor preparation so existing readers and roll dispatch can obtain `system.roll`. This object is never canonical and must not be updated as an embedded item.
- Legacy actors: persistent `actor.system.advantages.willpower` remains in use and follows the original permanent/temporary logic.

For a PC Willpower roll, the default pool is `current`; selecting “Use full Willpower” in `DialogGeneralRoll` uses `full`, so light wounds are ignored but heavy and aggravated wounds still reduce the pool. Ordinary Advantage and legacy Willpower rolls retain `WoDItem._handleAdvantagesCalculations` and the `advantageRolls` settings behavior.

### 11.2 Spending Willpower in rolls

`DiceRoller` owns the transaction through private `_spendTemporaryWillpower`:

1. for a PC, call `spendWillpower(actor)`; for a legacy actor, locate the old persistent Willpower path;
2. on a PC, add a light wound only when an empty box exists; any completely filled track, including an all-light track, cannot be spent further;
3. persist the actor update before dice evaluation;
4. grant one automatic success and prevent a botch for the Test. The legacy branch retains its older setting-dependent bonus-dice behavior.

Dialogs only set `container.usewillpower`; they do not spend the resource. This means direct API and UI rolls share the same spending behavior.

Tracker/edit call chain:

```text
PCActorSheet stats context
  -> getWillpowerState(actor)
  -> stats_willpower.hbs
  -> click data-action="editWillpower" / sheet contextmenu listener
  -> OnWillpowerCounterChange / OnWillpowerCounterClear
  -> getWillpowerUpdate(state, box, button)
  -> actor.update(system.willpower.damage.*)
  -> preparation rebuilds state and compatibility facade
```

### 11.3 Other resources

Rage, Gnosis, blood, Glamour, Faith/Torment, quintessence/paradox, path/virtues, Essence, and game-specific pools use Advantage items on PC actors but legacy branches on legacy actors. Important logic is distributed across:

- `WoDActor._handleWerewolfCalculations`, `_handleVampireCalculations`, `_handleMageCalculations`, and other game handlers;
- `WoDItem._handleAdvantagesCalculations`;
- action functions in `module/scripts/action-helpers.js` (including quintessence/paradox wheel and imbalance handling);
- power/casting/frenzy dialogs;
- `calculateTotals` and `BonusHelper`.

Power item flags such as `spendwillpower`, `spendrage`, `spendgnosis`, `spendblood`, and `spendglamour` describe costs, but their interpretation belongs to the relevant dialog/action path rather than a universal resource service.

## 12. Handlebars templates and helpers

### 12.1 Template families

- `templates/actor/*.html`: top-level legacy actor sheets.
- `templates/actor/parts/*.hbs`: PC ApplicationV2 parts and partials.
- `templates/actor/parts/*.html`: legacy partials, including game-specific subdirectories.
- `templates/items/*.hbs` and `templates/items/parts/*.hbs`: typed item sheets.
- `templates/sheets/*.html`: legacy item sheets and shared item partials.
- `templates/dialogs/*`: roll, weapon, power, soak, settings, migration, and selection UIs.
- `templates/dialogs/roll-template.hbs`: shared roll and “send to chat” card.

`module/templates.js::preloadHandlebarsTemplates` explicitly loads the reusable actor and item partials. Top-level sheet/application templates are loaded by Foundry when their applications render.

### 12.2 Context construction

- ApplicationV2 sheets declare `PARTS`; Foundry calls `_prepareContext` and `_preparePartContext` before rendering each part.
- AppV1 sheets use `getData` and `activateListeners`.
- Dialogs use either AppV1 `getData`/`_updateObject` or ApplicationV2 `_prepareContext` and action methods.
- rich text is enriched through `foundry.applications.ux.TextEditor.implementation.enrichHTML`.

### 12.3 Custom helpers and icon partials

`module/handlebars.js::registerHandlebarsHelpers` registers a large domain-specific helper surface. Major groups include:

- arithmetic/comparison/string helpers;
- attribute/ability/stat rendering;
- power hierarchy and connected-item lookup;
- tooltip and bonus rendering;
- item/notes/experience filtering;
- shape, sphere, health, and quintessence rendering;
- setting/variant/era and damage-code translation.

Many helpers return `Handlebars.SafeString` HTML and perform domain queries, so templates are not purely presentational.

`wod.js` registers `dtSvgDie` and a partial for every race/icon combination returned by `IconHelper`. `SvgHtml` selects the correct inline SVG for each result face/color. The chat template embeds those SVGs as data URLs.

Dependencies: helpers access `CONFIG.worldofdarkness`, actor embedded items, game settings, localization, and the mixed PC/legacy data shapes.

## 13. Hooks and Foundry initialization

### 13.1 `init`

`wod.js` performs nearly all registration during `Hooks.once("init")`:

1. call `systemSettings`;
2. attach imported static config and PC tab metadata to `CONFIG.worldofdarkness`;
3. cache rule, era, combat, permission, and game-specific setting values;
4. register typed models and the `WoDActor`/`WoDItem` document classes;
5. unregister core sheets and register every actor/item sheet by type;
6. preload templates and register Handlebars helpers;
7. call `registerHooks` and initialize the settings sidebar customization;
8. expose `game.worldofdarkness.bio`, `.abilities`, and icon maps;
9. register dice SVG helpers/partials.

`Hooks.once("setup")` is currently empty.

### 13.2 `ready`

`Hooks.once("ready")`:

- discovers installed power definitions with `WoDSetup.getInstalledPowers`;
- registers static and actor-discovered shape-form icons into `CONFIG.statusEffects`;
- starts tours;
- shows a GM migration/version message when appropriate;
- runs `migration.UpdateWorld` or `migration.updates` for GMs;
- sets `CONFIG.language` and dark-mode state and performs a setup sanity check.

The jQuery document-ready handler adds a global raw-dice dialog to the roll-privacy dice icon.

### 13.3 Registered hooks

`module/hooks.js::registerHooks` installs:

- `createItem` — shared-item receipt notification;
- `renderActorSheetV2` and `renderActorSheet` — language, splat/game, font, and dark-mode CSS classes;
- `renderItemSheetV2` and `renderItemSheet` — corresponding item-sheet classes;
- `renderFormApplication`, `renderApplicationV2`, and `renderDialog` — dialog theming and item-type option grouping;
- `dragRuler.ready` — movement-speed provider integration.

`module/ui/settings-sidebar.js` separately listens to `renderSettings` to inject the system's grouped settings entry points.

Dependencies: initialization order is significant because document preparation, sheets, dialogs, and helpers assume `CONFIG.worldofdarkness` is already populated. Most cached settings have no `onChange` handler, so live setting changes do not necessarily update the corresponding cached `CONFIG` value until reload/reinitialization.

## 14. Settings

`module/settings.js::systemSettings` registers world-scoped settings and grouped `registerMenu` applications. Almost all are `config: false` because the custom menus expose them.

| Group | Important keys | Main consumers |
| --- | --- | --- |
| Core rules | `advantageRolls`, `specialityLevel`, `attributeSettings`, `fifthEditionWillpowerSetting`, `willpowerBonusDice` | Ordinary/legacy Advantage preparation and roll behavior; PC Willpower uses the actor-owned rules service instead |
| Dice | `theRollofOne`, `successesToDamageRolls`, `useOnesDamage`, `usePenaltyDamage`, `useOnesSoak`, `lowestDifficulty`, `specialityAddSuccess`, `specialityReduceDiff`, `specialityAllowBotch`, `tenAddSuccess`, `explodingDice` | Dialog pool building and `DiceRoller` evaluation |
| Era | `eraMortal`, `eraMage`, `eraVampire`, `eraWerewolf` | Actor creation and ability seeding |
| Combat | `autoAmmo` | Ranged weapon dialog |
| Game-specific | `demonCreateForms`, `demonEvocationTorment`, `demonSystemSettings`, `hunteredgeSettings`, `virtuesLimit`, `wererwolfrageSettings` | Creation, actor calculations, powers, dice result interpretation |
| Permissions | observer/limited view, actor/item image change, item administrator level | Sheet tab filtering and edit actions |
| Graphics | `useSplatFonts`, `useLinkPlatform` | Render hooks and sheet context |
| Migration/internal | `worldVersion`, `patch*`, `readmessage01` | Migration and release messaging |

### 14.1 Current defaults and enforced bounds

The following are registration defaults for a newly created world. Existing worlds retain their saved setting values unless a migration or administrator changes them.

| Setting/behavior | Current default or bound | Runtime effect |
| --- | --- | --- |
| `specialityLevel` | `2` | An ability is eligible for its speciality at two dots. |
| `attributeSettings` | `"5th"` | Uses the fifth-edition attribute grouping/selection path. |
| `successesToDamageRolls` | `false` | Attack successes are not added to damage dice by default; the legacy option still exists. |
| `useOnesDamage` | `true` | Damage Tests may botch by default. Natural 1s still add Resistance regardless of this toggle. |
| `useOnesSoak` | `true` | Soak Tests may botch by default. Natural 1s still add Resistance regardless of this toggle. |
| `theRollofOne` | `1` (legacy registration) | Still cached for compatibility, but `DiceRoller` no longer subtracts this value from successes; each 1 instead adds one Resistance. |
| `specialityAddSuccess` | `0` | The legacy speciality-extra-success rule is disabled by default. |
| `specialityReduceDiff` | `1` | An enabled applicable speciality lowers difficulty by 1 by default. |
| `specialityAllowBotch` | `true` | Speciality Tests may botch by default; when false, a computed botch is downgraded to failure. |
| `tenAddSuccess` | `0` | No extra configured successes are added to a 10 beyond its normal success by default. |
| `explodingDice` | `"always"` | Every rolled 10 schedules another d10 by default; explosion dice can explode recursively. |
| `lowestDifficulty` | default `3`, choices `3`–`6` | The saved world value selects the active minimum, but initialization clamps it to at least 3. |
| `highestDifficulty` | fixed runtime value `9` | This is not a world setting. Evaluators and shared selectors use 9 as the upper bound. |
| General Test Resistance | `0` | The dialog and PC roll API accept non-negative explicit Resistance; each natural 1 adds another point. |

`DiceRoller` enforces both active bounds even if a caller supplies a value outside them. Shared difficulty selectors enumerate the active minimum through 9, and Arete casting uses the same maximum when converting excess difficulty into required successes.

The menu classes (`Rules`, `Dices`, `Era`, `Combat`, `Demon`, `Hunter`, `Vampire`, `Werewolf`, `Permissions`, and `Graphics`) extend `FormApplication`, filter Foundry's setting registry into a template context, and save changed values with `game.settings.set`. Their templates are in `templates/dialogs/dialog-settings-*.hbs`.

## 15. Localization

`system.json` declares English, German, Spanish, Italian, French, Brazilian Portuguese, and Ukrainian catalogs in `lang/`. English is the reference catalog.

Localization is structural, not only cosmetic:

- `module/config.js` stores many localization keys (for example attribute, ability, damage, wound, era, and type names) rather than display strings.
- schemas and `template.json` defaults often store keys such as `wod.attributes.strength` and `wod.health.hurt` directly in documents.
- sheets/dialogs call `game.i18n.localize` and `game.i18n.format`; templates use `{{localize ...}}`.
- render hooks add language-specific CSS classes for layout adjustments. Explicit special classes exist for German, Spanish, Italian, French, and Portuguese; other languages fall back to `langEN`.
- some matching and branching compares localization keys or fixed English identifiers, so changing key semantics is more invasive than changing translations.

When deriving the system, preserve stable machine ids separately from localized labels. In this codebase `id`, `type`, `label`, item names, and localization keys are sometimes used interchangeably by older paths.

## 16. Chat-message generation

There is one principal card template: `templates/dialogs/roll-template.hbs`. It branches on `data.type`:

- `general`, `soak`, `power`, `magic`, and `item` use the standard result layout;
- `attack` and `damage` have parallel combat layouts;
- `initiative` displays initiative output;
- `send` displays an item's/message's description and system text without dice.

Roll message call chain:

```text
DiceRoller / InitiativeRoll
  -> build templateData.data
     (actor, type, action, title, info, systemtext, multipleresult)
  -> renderTemplate(roll-template.hbs)
  -> { rolls, content, speaker }
  -> ChatMessage.applyMode(chatData)
  -> ChatMessage.create(chatData)
```

`MessageHelper.printMessage`, `ActionHelper.SendChat`, and the legacy sheet `_onSendChat` use the same template with `type: "send"`. Speaker attribution consistently comes from `ChatMessage.getSpeaker({actor})`; Foundry's current chat mode is applied immediately before creation.

The template renders selected informational/system fields with triple braces because descriptions and several rule annotations are HTML. Any derivative that accepts less-trusted content should review this trust boundary.

For a zero final dice pool, `DiceRoller` emits no roll objects and puts `zeroPoolFailure` on the result. The standard, attack, and damage branches of `roll-template.hbs` display `wod.dice.zeropoolfailure`; all seven language catalogs define that key.

For standard, attack, and damage results, each target block currently renders in this exact order:

1. localized Successes using `successesBeforeResistance`;
2. localized total Resistance, omitted when it is zero;
3. localized final outcome (Botch, Failure, or Success), enlarged and bold through `.tray-test-result` in `css/chat.css`;
4. additional successes for success, otherwise margin of failure;
5. zero-pool explanation when applicable, followed by the rolled dice display.

Informational header fields (`action`, title, `info`, actor conditions, and `systemtext`) remain above the per-target result blocks. Resistance/result labels are localized in every catalog; English uses “Failure” for `wod.dice.fail`.

Dependencies: chat generation requires localization, actor condition state, the SVG Handlebars helpers/partials, Foundry roll objects, and the data contract built by the evaluator or send helper.

## 17. Cross-subsystem dependency map

```text
settings + module/config.js + localization
              |
              v
Splat/Item data ---> WoDActor/WoDItem preparation ---> sheet contexts/templates
      |                    |                              |
      |                    v                              v
      +--------------> calculateTotals <--- sheet actions / item updates
                           |
                           +--> BonusHelper, armor, shapes, health, movement

sheet/API action
  -> ActionHelper dispatcher
  -> specialized dialog
  -> DiceRollContainer
  -> DiceRoller
       |--> PC actor-owned Willpower update / legacy Advantage update
       |--> custom d10 evaluation
       |--> roll-template.hbs + SVG helpers
       +--> ChatMessage

soak dialog
  -> DiceRoller successes
  -> CombatHelper damage overflow
  -> actor update
  -> wound-level preparation
  -> future roll penalties and sheet health display
```

The highest-coupling modules are `WoDActor`, `ActionHelper`, `BonusHelper`, `module/handlebars.js`, and the roll dialogs. They all know about actor types, Splat variants, item subtypes, configuration keys, and the PC/legacy storage distinction.

## 18. Architectural considerations for a derivative

1. **Choose one document representation early.** New work should preferably use typed models and embedded items consistently. Maintaining both PC and legacy paths doubles nearly every resource, dialog, and template branch.
2. **Do not treat transient PC projections as canonical storage.** Embedded `Ability`/ordinary `Advantage` items are canonical; `system.abilities` and `system.advantages` are rebuilt convenience indexes. PC Willpower is the explicit exception: `system.willpower.damage` is canonical and its projected Advantage facade is read-only compatibility data.
3. **Separate ids from display labels.** Existing code frequently falls back from slug to id to lowercased name and sometimes compares localization keys. A derivative should establish stable identifiers.
4. **Centralize modifiers if changing core rules.** Wound penalties are relatively centralized, but bonus dice, difficulty changes, fixed values, armor penalties, specialities, and form effects are distributed among `BonusHelper`, totals, and dialogs.
5. **Treat dialogs as rule code.** They do much more than collect input: they resolve traits, apply bonuses, enforce speciality rules, add attack successes, and choose resource behavior.
6. **Keep damage resolution, manual track interaction, and display distinct.**
   Normal PC damage enters `applyWounds` through `PCActorAPI`; manual clicks use
   `cycleHealthBox`/`setHealthBox`; `getHealthState` creates derived levels and
   display boxes. Legacy/chimerical damage still uses `CombatHelper`. Changing
   Health mechanics must account for both paths without reintroducing arbitrary
   positional severity editing.
7. **Review setting caching.** Many settings are copied into `CONFIG.worldofdarkness` during `init`. Add explicit `onChange` behavior or read settings at use time if live reconfiguration matters.
8. **Reduce template-helper domain logic cautiously.** Many existing templates depend on helpers that query items and generate HTML. Moving that logic into context preparation is desirable only if all affected AppV1 and AppV2 templates are accounted for.
9. **Preserve chat data contracts while replacing dice rules.** Dialogs and cards expect `DiceRollContainer` fields and `multipleresult` entries. A new evaluator can be introduced behind that boundary, or the boundary can be redesigned together with every caller.
10. **Plan migration and compendium conversion together.** `Splat` items and bundled compendia are part of character construction, not optional content. Schema changes must include world migration plus conversion of template/compendium documents.

## 19. File index by requested subsystem

| Subsystem | Primary files | Supporting files |
| --- | --- | --- |
| Actor data models | `template.json`; `module/actor/datamodel/*`; `module/actor/data/wod-actor-base.js` | `create-helpers.js`, `drop-helpers.js`, `totals.js`, `combat-helpers.js` |
| Item/advantage models | `template.json`; `module/items/datamodel/*`; `module/items/data/wod-item-base.js` | `item-helpers.js`, `item-actions.js`, `bonus-helpers.js`, `drop-helpers.js` |
| Actor sheets | `module/actor/template/pc-actor-sheet.js`; `mortal-actor-sheet.js`; game subclasses | `templates/actor/**`, `action-helpers.js`, `select-helpers.js` |
| Item sheets | `module/items/template/item-sheet-v2.js`; typed subclasses; `item-sheet.js` | `templates/items/**`, `templates/sheets/**` |
| Roll pipeline | `module/scripts/action-helpers.js`; `module/dialogs/*`; `module/actor/api-handler.js` | actor/item sheet event handlers |
| Dice evaluation | `module/scripts/roll-dice.js` | `bonus-helpers.js`, `combat-helpers.js`, settings/config |
| Damage/health | `module/scripts/combat-helpers.js`; `health.js`; `WoDActor._handleWoundLevelCalculations`; `dialog-soak.js` | `api-handler.js`, `totals.js`, health templates/helpers |
| Roll penalties | `WoDActor._handleWoundLevelCalculations`; dialog pool builders; `DiceRoller` | `CombatHelper.ignoresPain`, `BonusHelper`, `totals.js` |
| Willpower/resources | `module/scripts/willpower.js`; `module/actor/datamodel/base/actor_willpower.js`; `roll-dice.js`; `wod-actor-base.js` | `pc-actor-sheet.js`, `stats_willpower.hbs`, `dialog-generalroll.js`, migration, legacy `wod-item-base.js` |
| Handlebars | `module/templates.js`; `module/handlebars.js`; `templates/**` | `module/ui/icons.js`, sheet context builders |
| Hooks/init | `wod.js`; `module/hooks.js` | `settings-sidebar.js`, `migration.js`, tours |
| Settings | `module/settings.js`; relevant initialization in `wod.js` | settings dialog templates, `settings-sidebar.js` |
| Localization | `lang/*.json`; languages in `system.json`; maps in `module/config.js` | templates, sheets, dialogs, hooks |
| Chat messages | `module/scripts/roll-dice.js`; `message-helpers.js`; `templates/dialogs/roll-template.hbs` | `ActionHelper.SendChat`, legacy sheet send action, SVG helpers |
