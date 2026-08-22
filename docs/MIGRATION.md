# Data migrations

## Unreleased — Mirrored PC Health and Willpower tracks

Maximum PC Health now derives from `2 + Strength + Stamina + health bonus`.
The formula change is derived and does not alter the persisted Health wound
array or bonus.

PC Willpower keeps its existing actor-owned light/heavy counters and adds:

```text
system.willpower.bonus
system.willpower.damage.aggravated
```

The typed PC data model supplies `0` when either field is absent, preserving all
existing light and heavy Willpower wounds. Willpower maximum now derives from
`2 + Composure + Resolve + Willpower Bonus`. The fixed exhaustion penalty is
replaced by the five-level Health distribution and penalty table.
No legacy Actor Willpower data is changed.

## 7.4.0 — Derived PC Health and wound track

Normal Health for `PC` Actors is now stored at:

```text
system.health.bonus
system.health.wounds[]
```

Each wound entry is `light`, `heavy`, or `aggravated`. Maximum Health, the
five Health Level sizes, remaining Health, active Health Level, and wound
penalty are derived from Strength, Stamina, the sheet bonus, and active
`health_buff` effects.

Migration converts the old aggregate counters as follows:

```text
bashing -> light
lethal -> heavy
aggravated -> aggravated
```

The manual bonus is initialized to the non-negative difference between the
old configured base track and the Health formula active at migration time. Per-level active item
bonuses are not included in that adjustment; on a PC their values are summed
directly into the new general Health bonus, so they are not counted twice.
The old seven level objects and normal bashing/lethal/aggravated counters are
removed from persisted PC data after conversion.

If a later attribute or bonus reduction makes the wound count exceed maximum
Health, wounds are retained as overflow instead of being silently deleted.
The specification does not yet define a death/terminal effect for overflow.

Legacy Actor types, Splat source compatibility fields, and PC chimerical
damage retain their prior storage and rules. Splat health-level configuration
is no longer applied to PC Actors or exposed on the Splat sheet.

## 7.3.0 — PC Willpower wound track

PC Willpower is now stored on the Actor at:

```text
system.willpower.damage.light
system.willpower.damage.heavy
```

It is no longer persisted as an embedded `Advantage` item. During the 7.3.0
world migration, an existing PC Willpower Advantage is converted as follows:

```text
maximum = 2 + Composure + Resolve
light wounds = maximum - min(old temporary Willpower, maximum)
heavy wounds = 0
aggravated wounds = 0
Willpower Bonus = 0
```

This preserves the old number of available temporary Willpower points. The
embedded Willpower Advantage is deleted after successful conversion. PCs with
no embedded Willpower Advantage start with an empty, fully available track.

Legacy Actor types retain their existing `system.advantages.willpower` data.
