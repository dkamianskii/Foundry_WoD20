# Data migrations

## 7.3.0 — PC Willpower wound track

PC Willpower is now stored on the Actor at:

```text
system.willpower.damage.light
system.willpower.damage.heavy
```

It is no longer persisted as an embedded `Advantage` item. During the 7.3.0
world migration, an existing PC Willpower Advantage is converted as follows:

```text
maximum = Composure + Resolve
light wounds = maximum - min(old temporary Willpower, maximum)
heavy wounds = 0
```

This preserves the old number of available temporary Willpower points. The
embedded Willpower Advantage is deleted after successful conversion. PCs with
no embedded Willpower Advantage start with an empty, fully available track.

Legacy Actor types retain their existing `system.advantages.willpower` data.
