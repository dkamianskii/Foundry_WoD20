import test from "node:test";
import assert from "node:assert/strict";

import {
    applyWounds,
    calculateMaxHealth,
    distributeHealthLevels,
    getActorHealthState,
    getHealthState,
    migrateLegacyHealth
} from "../module/scripts/health.js";

test("maximum Health uses Strength, Stamina-as-Endurance, and bonus", () => {
    assert.equal(calculateMaxHealth(2, 3, 1), 9);
});

test("seven boxes distribute severe-first", () => {
    assert.deepEqual(
        distributeHealthLevels(7).map(level => [level.id, level.count]),
        [["bruised", 1], ["hurt", 1], ["wounded", 1], ["mauled", 2], ["crippled", 2]]
    );
});

test("seven light wounds plus two heavy wounds resolve to four heavy and three light", () => {
    const initial = Array.from({length: 7}, () => "light");
    assert.deepEqual(applyWounds(initial, "heavy", 2, 7), [
        "heavy", "heavy", "heavy", "heavy", "light", "light", "light"
    ]);
});

test("heavy overflow recursively upgrades to aggravated", () => {
    assert.deepEqual(applyWounds(["heavy", "heavy"], "heavy", 1, 2), ["aggravated", "heavy"]);
});

test("aggravated wounds cannot upgrade and remain as overflow", () => {
    assert.deepEqual(applyWounds(["aggravated"], "aggravated", 1, 1), ["aggravated", "aggravated"]);
});

test("only the actually displaced wound participates in a cascade", () => {
    const initial = ["heavy", "heavy", "heavy", "heavy", "heavy", "heavy", "light"];
    assert.deepEqual(applyWounds(initial, "heavy", 1, 7), [
        "heavy", "heavy", "heavy", "heavy", "heavy", "heavy", "heavy", "light"
    ]);
});

test("light wounds do not activate a wound penalty", () => {
    const state = getHealthState(actorWith(["light", "light", "light"]));
    assert.equal(state.woundpenalty, 0);
    assert.equal(state.woundlevel, "");
});

test("the most severe occupied heavy/aggravated level supplies the non-stacking penalty", () => {
    const state = getHealthState(actorWith(["heavy", "heavy", "heavy", "heavy"]));
    assert.equal(state.max, 7);
    assert.equal(state.woundlevel, "wod.health.mauled");
    assert.equal(state.woundpenalty, -3);
});

test("wound position is preserved while empty boxes remain", () => {
    const state = getHealthState(actorWith(["light", "light", "heavy"]));
    assert.deepEqual(state.trackWounds, ["light", "light", "heavy"]);
    assert.equal(state.woundlevel, "wod.health.wounded");
    assert.equal(state.woundpenalty, -2);
});

test("unresolved wounds beyond a reduced maximum are retained as overflow", () => {
    const actor = actorWith(["aggravated", "heavy", "light", "light", "light", "light"]);
    actor.system.attributes.strength.value = 0;
    actor.system.attributes.stamina.value = 0;
    const state = getHealthState(actor);
    assert.equal(state.max, 3);
    assert.equal(state.overflow.length, 3);
    assert.equal(state.wounds.length, 6);
});

test("manual and active item Health bonuses both increase maximum", () => {
    const actor = actorWith([]);
    actor.system.health.bonus = 1;
    actor.items.push({type: "Bonus", system: {type: "health_buff", isactive: true, value: 2}});
    const state = getHealthState(actor);
    assert.equal(state.manualBonus, 1);
    assert.equal(state.itemBonus, 2);
    assert.equal(state.max, 10);
});

test("legacy PC Health migration preserves configured capacity and wound severities", () => {
    const source = {
        attributes: {strength: {value: 2}, stamina: {value: 2}},
        health: {
            damage: {bashing: 2, lethal: 1, aggravated: 1},
            bruised: {value: 1}, hurt: {value: 1}, injured: {value: 1}, wounded: {value: 1},
            mauled: {value: 1}, crippled: {value: 1}, incapacitated: {value: 2}
        }
    };
    assert.deepEqual(migrateLegacyHealth(source), {
        bonus: 1,
        wounds: ["aggravated", "heavy", "light", "light"]
    });
});

test("a worse chimerical track still drives the shared PC penalty", () => {
    const actor = actorWith([]);
    actor.system.settings = {usechimerical: true};
    actor.system.health.damage = {chimerical: {bashing: 0, lethal: 4, aggravated: 0}};
    const state = getActorHealthState(actor);
    assert.equal(state.current, 3);
    assert.equal(state.woundlevel, "wod.health.mauled");
    assert.equal(state.woundpenalty, -3);
});

function actorWith(wounds) {
    return {
        type: "PC",
        items: [],
        system: {
            attributes: {strength: {value: 2}, stamina: {value: 2}},
            health: {bonus: 0, wounds}
        }
    };
}
