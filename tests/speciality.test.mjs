import assert from "node:assert/strict";
import test from "node:test";

import {
    ABILITY_SPECIALITY_LEVEL,
    canAbilityTakeSpeciality,
    getAbilitySpecialityState,
    hasUsableAbilitySpeciality
} from "../module/scripts/speciality.js";

test("abilities become eligible for a speciality at two dots", () => {
    assert.equal(ABILITY_SPECIALITY_LEVEL, 2);
    assert.equal(canAbilityTakeSpeciality({ value: 1, speciality: "" }), false);
    assert.equal(canAbilityTakeSpeciality({ value: 2, speciality: "" }), true);
});

test("a usable ability speciality requires two dots and non-blank text", () => {
    assert.equal(hasUsableAbilitySpeciality({ value: 1, speciality: "Swords" }), false);
    assert.equal(hasUsableAbilitySpeciality({ value: 2, speciality: "" }), false);
    assert.equal(hasUsableAbilitySpeciality({ value: 2, speciality: "   " }), false);
    assert.equal(hasUsableAbilitySpeciality({ value: 2, speciality: " Swords " }), true);
    assert.equal(getAbilitySpecialityState({ value: 2, speciality: " Swords " }).text, "Swords");
});

test("typed Ability items use their system data", () => {
    const state = getAbilitySpecialityState({ system: { value: 3, speciality: "Pistols" } });
    assert.deepEqual(state, {
        value: 3,
        text: "Pistols",
        canTakeSpeciality: true,
        hasSpeciality: true
    });
});
