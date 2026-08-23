export const INITIATIVE_DIFFICULTY = 8;

export function resolveInitiativeDice(values) {
	const dice = Array.isArray(values) ? values : [];
	const rawSuccesses = dice.filter(value => Number(value) >= INITIATIVE_DIFFICULTY).length;
	const rolledOnes = dice.filter(value => Number(value) === 1).length;
	const netSuccesses = rawSuccesses - rolledOnes;

	return {
		rawSuccesses,
		rolledOnes,
		successes: Math.max(0, netSuccesses),
		initiative: netSuccesses < 0 ? -1 : netSuccesses,
		rollResult: netSuccesses < 0 ? "botch" : netSuccesses > 0 ? "success" : "fail"
	};
}
