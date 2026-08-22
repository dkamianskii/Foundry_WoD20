import test from "node:test";
import assert from "node:assert/strict";

import {
    getWillpowerState,
    getWillpowerUpdate,
    migratePCWillpowerSource,
    spendWillpower
} from "../module/scripts/willpower.js";
import { getEffectiveWoundPenalty } from "../module/scripts/health.js";

test("maximum Willpower uses 2 + Composure + Resolve + Willpower Bonus", () => {
    assert.equal(getWillpowerState(actorWith()).maximum, 7);
    assert.equal(getWillpowerState(actorWith({}, 2)).maximum, 9);
});

test("full Willpower ignores light and heavy wounds but not aggravated wounds", () => {
    const state = getWillpowerState(actorWith({light: 1, heavy: 3, aggravated: 1}));

    assert.equal(state.maximum, 7);
    assert.equal(state.current, 2);
    assert.equal(state.full, 6);
});

test("Willpower migration leaves Health-only partial updates independent", () => {
    const update = {health: {wounds: ["light"]}};

    migratePCWillpowerSource(update);

    assert.deepEqual(update, {health: {wounds: ["light"]}});
    assert.equal(Object.hasOwn(update, "willpower"), false);
});

test("Willpower migration does not synthesize omitted fields in partial updates", () => {
    const update = {willpower: {damage: {light: 2}}};

    migratePCWillpowerSource(update);

    assert.deepEqual(update, {willpower: {damage: {light: 2}}});
});

test("Willpower uses Health level distribution and heavy/aggravated penalties", () => {
    const actor = actorWith({light: 1, heavy: 3, aggravated: 0});
    const state = getWillpowerState(actor);

    assert.deepEqual(state.levels.map(level => [level.id, level.count]), [
        ["bruised", 1], ["hurt", 1], ["wounded", 1], ["mauled", 2], ["crippled", 2]
    ]);
    assert.equal(state.woundlevel, "wod.health.wounded");
    assert.equal(state.woundpenalty, -2);

    const aggravated = getWillpowerState(actorWith({light: 0, heavy: 0, aggravated: 4}));
    assert.equal(aggravated.woundlevel, "wod.health.mauled");
    assert.equal(aggravated.woundpenalty, -3);
});

test("heavy and aggravated Willpower penalties are derived independently for Ignore Pain", () => {
    const state = getWillpowerState(actorWith({light: 0, heavy: 3, aggravated: 1}));
    assert.equal(state.woundpenalty, -3);
    assert.equal(state.heavyWoundPenalty, -3);
    assert.equal(state.aggravatedWoundPenalty, 0);
    assert.equal(state.aggravatedWoundLevel, "wod.health.bruised");
    assert.equal(getEffectiveWoundPenalty(state, true).penalty, 0);
});

test("Willpower sheet cycling promotes light to heavy to aggravated", () => {
    assert.deepEqual(getWillpowerUpdate(actorWith({light: 1}), "light"), {
        "system.willpower.damage.light": 0,
        "system.willpower.damage.heavy": 1,
        "system.willpower.damage.aggravated": 0
    });
    assert.deepEqual(getWillpowerUpdate(actorWith({heavy: 1}), "heavy"), {
        "system.willpower.damage.light": 0,
        "system.willpower.damage.heavy": 0,
        "system.willpower.damage.aggravated": 1
    });
});

test("a full Willpower track cannot be spent even when all wounds are light", async () => {
    const actor = actorWith({light: 7});
    actor.update = async () => assert.fail("a full track must not be updated");

    assert.equal(getWillpowerState(actor).canSpend, false);
    assert.equal(await spendWillpower(actor), false);
});

test("spending available Willpower adds one light wound", async () => {
    const actor = actorWith({light: 1});
    actor.update = async update => {
        actor.system.willpower.damage.light = update["system.willpower.damage.light"];
        actor.system.willpower.damage.heavy = update["system.willpower.damage.heavy"];
        actor.system.willpower.damage.aggravated = update["system.willpower.damage.aggravated"];
    };

    assert.equal(await spendWillpower(actor), true);
    assert.equal(actor.system.willpower.damage.light, 2);
});

function actorWith(damage = {}, bonus = 0) {
    return {
        type: "PC",
        system: {
            attributes: {composure: {value: 2}, resolve: {value: 3}},
            willpower: {
                bonus,
                damage: {
                    light: damage.light ?? 0,
                    heavy: damage.heavy ?? 0,
                    aggravated: damage.aggravated ?? 0
                }
            }
        }
    };
}
