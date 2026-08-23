import test from "node:test";
import assert from "node:assert/strict";

import { resolveInitiativeDice } from "../module/scripts/initiative.js";

test("initiative counts results of 8 or higher and subtracts ones", () => {
	assert.deepEqual(resolveInitiativeDice([8, 9, 7, 1]), {
		rawSuccesses: 2,
		rolledOnes: 1,
		successes: 1,
		initiative: 1,
		rollResult: "success"
	});
});

test("initiative failure resolves to zero", () => {
	assert.equal(resolveInitiativeDice([2, 7, 1, 8]).initiative, 0);
	assert.equal(resolveInitiativeDice([2, 7, 1, 8]).rollResult, "fail");
});

test("initiative botch always resolves to minus one", () => {
	assert.equal(resolveInitiativeDice([1, 1, 8]).initiative, -1);
	assert.equal(resolveInitiativeDice([1, 1, 1]).initiative, -1);
	assert.equal(resolveInitiativeDice([1, 1, 1]).rollResult, "botch");
});

test("exploded tens are counted as ordinary successful dice", () => {
	const result = resolveInitiativeDice([10, 10, 8, 1]);
	assert.equal(result.rawSuccesses, 3);
	assert.equal(result.initiative, 2);
});
