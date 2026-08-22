import test from "node:test";
import assert from "node:assert/strict";

import {
    getWillpowerState,
    getWillpowerUpdate,
    spendWillpower
} from "../module/scripts/willpower.js";

test("maximum Willpower uses 2 + Composure + Resolve", () => {
    assert.equal(getWillpowerState(actorWith()).maximum, 7);
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

function actorWith(damage = {}) {
    return {
        type: "PC",
        system: {
            attributes: {composure: {value: 2}, resolve: {value: 3}},
            willpower: {
                damage: {
                    light: damage.light ?? 0,
                    heavy: damage.heavy ?? 0,
                    aggravated: damage.aggravated ?? 0
                }
            }
        }
    };
}
