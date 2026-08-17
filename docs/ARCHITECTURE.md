# World of Darkness 20th Edition System Architecture

This document describes the architecture of the repository as it exists in version 7.2.9 (Foundry VTT v14). It is intended as a map for building a substantially modified derivative system, not as a rules reference.

## 1. Executive summary

The system is in the middle of an architectural migration and effectively contains two implementations behind shared document classes and roll code:

- **PC/ApplicationV2 path:** the single `PC` actor type uses a typed Foundry `DataModel`, an `ActorSheetV2`, and item-centric character construction. A dropped `Splat` item configures the actor; `Ability`, `Advantage`, `Sphere`, and `Realm` items are typed documents. Embedded items are projected into transient `actor.system.abilities` and `actor.system.advantages` lookup objects during preparation.
- **Legacy/AppV1 path:** the named actor types (`Mortal`, `Vampire`, `Werewolf`, etc.) use `template.json`, persist abilities and advantages directly under `actor.system`, and use `MortalActorSheet` plus game-specific subclasses. Most equipment, feature, trait, and power items also remain `template.json` types with the legacy `WoDItemSheet`.

Both paths converge on:

- `WoDActor` and `WoDItem` document lifecycle logic;
- `ActionHelper.RollDialog` for dispatching sheet actions to dialogs;
- dialog-specific pool construction;
- `DiceRollContainer` and `DiceRoller` for actual d10 evaluation;
- `templates/dialogs/roll-template.hbs` and `ChatMessage.create` for chat cards;
- `CONFIG.worldofdarkness`, settings, localization keys, bonus helpers, and common health/combat helpers.

For a derivative game, the most consequential design choice is whether to retain both paths or standardize on the PC/item-centric path. The two representations are not interchangeable: PC advantages have paths such as `actor.system.advantages.willpower.system.temporary`, while legacy advantages use `actor.system.advantages.willpower.temporary`.

## 2. Top-level layout and runtime entry points

| Area | Relevant files | Responsibility |
| --- | --- | --- |
| Manifest and legacy schemas | `system.json`, `template.json` | Foundry metadata, document types, languages, compendia, HTML fields, and legacy template inheritance |
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

## 3. Actor data models

### 3.1 Declared actor types

`template.json` declares `PC`, `Mortal`, `Werewolf`, `Mage`, `Vampire`, `Changeling`, `Hunter`, `Demon`, `Wraith`, `Mummy`, `Exalted`, `Changing Breed`, and `Creature`. `system.json` declares the rich-text fields for `PC`. `wod.js` registers only `CONFIG.Actor.dataModels.PC = PCDataModel`; all other types therefore continue to use the legacy `template.json` definitions.

### 3.2 PC typed model

Relevant files:

- `module/actor/datamodel/pc-actor-datamodel.js` — `PCDataModel`.
- `module/actor/datamodel/base/actor_attributes.js` — eleven attribute records (20th- and 5th-edition alternatives coexist and visibility selects the active set).
- `module/actor/datamodel/base/actor_health.js` — damage counters and seven named wound levels.
- `module/actor/datamodel/base/actor_settings.js` — feature flags, splat/variant/era, maximums, and soak permissions/bonuses.
- `module/actor/datamodel/base/actor_traits.js` — aggregate health-level value/max.
- `module/actor/datamodel/_module.js` — model export used by `wod.js`.

Important PC schema branches:

- `settings`: creation/update flags, splat/game/variant/era, feature flags (`haswillpower`, `hasgifts`, `hasspheres`, etc.), attribute/ability/power maximums, and per-damage-type soak configuration.
- `bio`: basic identity fields, dynamic `splatfields`, and HTML fields.
- `attributes`: value, bonus, total, max, type, label, speciality, ordering, visibility, and favored state.
- `soak`: derived normal and chimerical pools.
- `health`: normal/chimerical damage counters plus wound-level configuration.
- `traits.health.totalhealthlevels`: derived current/max health boxes.
- `initiative`, `conditions`, `movement`, `gear`, and `favoriterolls`.

`PCDataModel.migrateData` backfills chimerical soak and damage objects. It does not define persistent `abilities` or `advantages`: `WoDActor._prepareCharacterData` creates those runtime projections from embedded items.

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

1. filters embedded items into abilities, advantages, spheres, realms, powers, shapes, and other groups;
2. applies configured trait maximums and 20th/5th attribute visibility;
3. builds `system.abilities[key] = ability.toObject()` and `system.advantages[key] = advantage.toObject()`;
4. derives presence flags (`haswillpower`, `hasvirtue`, and similar);
5. applies special resource rules such as 5th-edition Willpower, path bearing, virtue limits, blood-pool generation limits, and quintessence/paradox constraints;
6. creates list/group data consumed by sheets and rolls and may batch-update embedded items where persisted values are stale.

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
- `_handleAdvantagesCalculations` implements 5th-edition Willpower, virtue maximums, path bearing, permanent/temporary clamping, and the derived `roll` selection controlled by `advantageRolls` and item settings.

Advantages are therefore both resources and rollable traits. Their `settings.usepermanent`, `usetemporary`, `usebothrolls`, `useroll`, and `highertemporary` flags determine data validation and which rating becomes `system.roll`.

### 4.3 Splat/template application

The `Splat` item is the PC character-construction model. Its arrays describe what should be installed on a PC and its settings configure the actor. The major implementation points are:

- `module/items/template/splat-item-sheet.js` — edits Splat settings and content arrays.
- `module/scripts/drop-helpers.js` — handles dropping a Splat or individual item onto an actor and applies template data.
- `module/scripts/create-helpers.js` — creates abilities and game/era/variant defaults.
- `module/scripts/item-helpers.js` and `item-actions.js` — item relationships, actions, and cleanup.
- `module/actor/template/pc-actor-sheet.js::_onDropItem` — enforces the PC sheet's Splat/drop rules before delegating.

Dependencies: actor preparation expects specific embedded item ids/groups; power and weapon dialogs read legacy item fields; bonus calculation scans active/equipped embedded items and their `bonuslist` arrays.

## 5. Actor sheets

### 5.1 PC ActorSheetV2

`PCActorSheet` in `module/actor/template/pc-actor-sheet.js` extends `HandlebarsApplicationMixin(ActorSheetV2)`.

Its `PARTS` are navigation, bio, stats, powers, combat, gear, feature, effects, and settings. `_prepareContext` creates shared context; `_preparePartContext` delegates to part-specific context builders in the same file. Important prepared values include enriched HTML, lists of embedded items, grouped advantages/powers, `calculateHealth` output, permission/lock state, and select-list data.

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

The PC API bypasses dialogs for `rollAttribute`, `rollAbility`, and `rollAdvantage`, but still constructs the same `DiceRollContainer` and calls `DiceRoller`. Feature, weapon, and power API methods intentionally route back through `ActionHelper.RollDialog`.

### 7.2 Pool construction

`DiceRollContainer` in `module/scripts/roll-dice.js` is the shared request DTO. Important fields are actor, attribute/ability keys, display text, base dice, special dice, bonus, wound penalty, difficulty, action/origin, targets, speciality, Willpower use, system text, power type, and incoming/applicable damage.

Dialogs are responsible for:

1. resolving PC item projections versus legacy actor fields;
2. selecting attribute, ability, advantage, custom ability, sphere/realm, or weapon ratings;
3. applying `BonusHelper` pool and difficulty modifiers;
4. identifying speciality and optionally reducing difficulty;
5. adding wound penalties unless the action ignores them;
6. adding attack successes to damage where configured;
7. setting `origin` (`general`, `power`, `attack`, `damage`, `soak`, or `initiative`) so the evaluator can apply origin-specific rules.

Weapon attack is a two-stage chain: `DialogWeaponV2._rollAttack` builds and evaluates the attack; if it succeeds and damage is rollable it opens/continues in damage state with `extraSuccesses` (usually successes minus one). `_rollDamage` builds target-specific pools and calls the same evaluator.

## 8. Dice evaluation

All ordinary pools are evaluated by `DiceRoller` in `module/scripts/roll-dice.js`.

Evaluation sequence:

1. clamp difficulty to `CONFIG.worldofdarkness.lowestDifficulty`;
2. add automatic successes from active bonuses;
3. attempt to spend Willpower and apply its configured effect;
4. disable botching for damage/soak when their “ones” settings are off;
5. choose themed dice colors from actor type, Splat, variant sheet, or per-actor dice setting;
6. create a default target when none is supplied, otherwise evaluate each target pool;
7. compute `numberDices = target.numDices + woundpenalty`, clamped to zero;
8. evaluate a separate `Roll("1d10")` for each die and collect each face/color;
9. count faces at or above difficulty, apply 10/speciality extra successes, reroll exploding 10s by extending the loop, and subtract configured successes for ones where allowed;
10. classify result as success, fail, or botch, applying speciality botch protection;
11. add informational lines (difficulty, speciality, wound penalty, Willpower, automatic successes, soak remainder, and Demon evocation Torment outcome);
12. render and create the chat message, then return the last target's numeric success count.

Important implications:

- It does not evaluate one Foundry pool formula such as `10d10`; it evaluates one Foundry `Roll` per die. All success/botch/explosion logic is custom JavaScript.
- `rolls: allDices` is attached to the chat message so Foundry and modules such as Dice So Nice can still see roll objects.
- Multi-target results are displayed together, but the returned `success` variable is the final target's value.
- Favored-die behavior is inferred from actor attribute/ability flags during handling of ones.
- Demon Lore Torment compares successful die faces with permanent Torment after the normal roll.

`InitiativeRoll` is separate: it rolls one d10, adds derived initiative, tries to add/update the actor's token combatant, and emits the same chat template.

Dependencies: evaluation depends on settings cached in `CONFIG.worldofdarkness`, `BonusHelper`, actor conditions/data layout, Foundry `Roll`, the dice SVG helpers/icons, localization, and chat rendering.

## 9. Damage and health processing

### 9.1 Health representation and display

Normal damage is stored as counts in `system.health.damage.{bashing,lethal,aggravated}`. PC and Changeling-capable data also has `damage.chimerical`. Each named wound level stores base `value`, derived `total`, `penalty`, and label.

`WoDActor._handleWoundLevelCalculations`:

- sums normal and chimerical damage and uses the larger total;
- totals all configured wound-level boxes into `traits.health.totalhealthlevels.max`;
- derives remaining health value;
- walks `CONFIG.worldofdarkness.woundLevels` to set current `damage.woundlevel` and `damage.woundpenalty`.

`module/scripts/health.js::calculateHealth` is a presentation helper. It converts damage counts into an ordered array of `*` (aggravated), `x` (lethal), `/` (bashing), or empty boxes and attaches a `woundPenalty` property. It has special branches for chimerical and Wraith corpus tracks.

`calculateTotals` in `module/scripts/totals.js` derives health-level totals from `BonusHelper`, computes soak from Stamina/shape settings/bonuses/armor, and includes wound penalty in initiative unless pain is ignored.

### 9.2 Applying damage

`CombatHelper.GetApplicableDamageCapacity` and `ApplyDamageWithOverflow` in `module/scripts/combat-helpers.js` implement track mutation:

- fill empty boxes with the incoming type;
- excess bashing upgrades existing bashing to lethal;
- excess aggravated converts lethal, then bashing, to aggravated;
- excess lethal and damage beyond a fully aggravated track are not resolved as death/torpor by this layer.

The principal automated damage call chain is:

```text
DialogSoakRoll._soakRoll
  -> DiceRoller(soak container)
  -> unsoaked = incoming - successes, capped by applicable capacity
  -> _applyUnsoakedDamage
     -> PC normal: actor.api.modifyHealth
     -> PC chimerical or legacy: CombatHelper.ApplyDamageWithOverflow directly
  -> actor.update
  -> WoDActor preparation derives wound level/penalty
```

`PCActorAPI.modifyHealth` is also available programmatically for adding or healing PC damage. Health-box clicks in actor sheets update raw damage counters through actions in `action-helpers.js` and then rely on actor preparation for derived state.

Dependencies: health calculation depends on Splat-configured wound boxes, active health bonuses, chimerical flags, actor type, soak dialog input, and actor lifecycle recalculation.

## 10. Roll penalties

The canonical wound penalty is `actor.system.health.damage.woundpenalty`, derived by `_handleWoundLevelCalculations`.

General behavior:

- general, ability, attribute, advantage, item, power, shapechange, and weapon attack builders usually copy it into `DiceRollContainer.woundpenalty`;
- `CombatHelper.ignoresPain(actor)` suppresses it when `conditions.isignoringpain` or `conditions.isfrenzy` is true;
- `DiceRoller` applies it arithmetically to the target pool and clamps the result to zero;
- soak, frenzy, initiative's d10, paradox, and several special rolls explicitly use zero;
- damage rolls use it only when the `usePenaltyDamage` world setting is enabled;
- the chat card displays the localized wound level and numeric penalty when applied.

Other penalties/bonuses are not unified into a single modifier pipeline. Dialogs query specialized `BonusHelper` methods for attribute, ability, attack, soak, movement, health, initiative, fixed-value, and difficulty effects. Armor applies its configured `dexpenalty` while `calculateTotals` derives Dexterity. A derivative system should treat `BonusHelper` and dialog code together as the effective modifier engine.

## 11. Willpower and other resources

### 11.1 Willpower storage and derived roll value

- PC: embedded `Advantage` item with `system.id === "willpower"`; projected as `actor.system.advantages.willpower`, with actual fields below `.system`.
- Legacy: persistent `actor.system.advantages.willpower` object.

`WoDItem._handleAdvantagesCalculations` and `WoDActor` preparation derive `roll` from permanent/temporary values. `advantageRolls` selects permanent versus the lower available temporary/permanent pool; `usebothrolls` sums them. When both the attribute and Willpower modes are configured for 5th edition, permanent Willpower becomes Composure + Resolve (subject to max/clamping).

### 11.2 Spending Willpower in rolls

`DiceRoller` owns the transaction through private `_spendTemporaryWillpower`:

1. locate the PC Advantage item or legacy actor path;
2. require at least one temporary point;
3. immediately persist a decrement;
4. if `willpowerBonusDice` is enabled, add three dice and prevent botching; otherwise add one automatic success and guarantee at least one final success.

Dialogs only set `container.usewillpower`; they do not spend the resource. This means direct API and UI rolls share the same spending behavior.

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
| Core rules | `advantageRolls`, `specialityLevel`, `attributeSettings`, `fifthEditionWillpowerSetting`, `willpowerBonusDice` | Actor/item preparation, roll dialogs, `DiceRoller` |
| Dice | `theRollofOne`, `successesToDamageRolls`, `useOnesDamage`, `usePenaltyDamage`, `useOnesSoak`, `lowestDifficulty`, `specialityAddSuccess`, `specialityReduceDiff`, `specialityAllowBotch`, `tenAddSuccess`, `explodingDice` | Dialog pool building and `DiceRoller` evaluation |
| Era | `eraMortal`, `eraMage`, `eraVampire`, `eraWerewolf` | Actor creation and ability seeding |
| Combat | `autoAmmo` | Ranged weapon dialog |
| Game-specific | `demonCreateForms`, `demonEvocationTorment`, `demonSystemSettings`, `hunteredgeSettings`, `virtuesLimit`, `wererwolfrageSettings` | Creation, actor calculations, powers, dice result interpretation |
| Permissions | observer/limited view, actor/item image change, item administrator level | Sheet tab filtering and edit actions |
| Graphics | `useSplatFonts`, `useLinkPlatform` | Render hooks and sheet context |
| Migration/internal | `worldVersion`, `patch*`, `readmessage01` | Migration and release messaging |

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
       |--> Willpower item/actor update
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
2. **Do not treat transient PC projections as canonical storage.** The embedded `Ability`/`Advantage` items are canonical; `system.abilities` and `system.advantages` are rebuilt convenience indexes.
3. **Separate ids from display labels.** Existing code frequently falls back from slug to id to lowercased name and sometimes compares localization keys. A derivative should establish stable identifiers.
4. **Centralize modifiers if changing core rules.** Wound penalties are relatively centralized, but bonus dice, difficulty changes, fixed values, armor penalties, specialities, and form effects are distributed among `BonusHelper`, totals, and dialogs.
5. **Treat dialogs as rule code.** They do much more than collect input: they resolve traits, apply bonuses, enforce speciality rules, add attack successes, and choose resource behavior.
6. **Keep damage resolution distinct from display.** `CombatHelper` mutates damage counts; actor preparation derives wound state; `calculateHealth` creates display boxes. Changing health mechanics normally touches all three.
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
| Willpower/resources | `roll-dice.js`; `wod-item-base.js`; `wod-actor-base.js` | power/casting dialogs, `action-helpers.js`, settings |
| Handlebars | `module/templates.js`; `module/handlebars.js`; `templates/**` | `module/ui/icons.js`, sheet context builders |
| Hooks/init | `wod.js`; `module/hooks.js` | `settings-sidebar.js`, `migration.js`, tours |
| Settings | `module/settings.js`; relevant initialization in `wod.js` | settings dialog templates, `settings-sidebar.js` |
| Localization | `lang/*.json`; languages in `system.json`; maps in `module/config.js` | templates, sheets, dialogs, hooks |
| Chat messages | `module/scripts/roll-dice.js`; `message-helpers.js`; `templates/dialogs/roll-template.hbs` | `ActionHelper.SendChat`, legacy sheet send action, SVG helpers |
