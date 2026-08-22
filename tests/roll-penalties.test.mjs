import test from "node:test";
import assert from "node:assert/strict";

import { rollUsesAttribute } from "../module/scripts/roll-penalties.js";

const actor = {
    system: {
        attributes: {
            strength: {value: 3},
            dexterity: {value: 2}
        }
    }
};

test("wound penalties apply when either pool component is an Attribute", () => {
    assert.equal(rollUsesAttribute({actor, attribute: "strength", ability: "athletics"}), true);
    assert.equal(rollUsesAttribute({actor, attribute: "power", ability: "dexterity"}), true);
});

test("wound penalties do not apply to pools without Attributes", () => {
    assert.equal(rollUsesAttribute({actor, attribute: "willpower", ability: "noselected"}), false);
    assert.equal(rollUsesAttribute({actor, attribute: "humanity", ability: "noselected"}), false);
    assert.equal(rollUsesAttribute({actor, attribute: "noselected", ability: "athletics"}), false);
});
