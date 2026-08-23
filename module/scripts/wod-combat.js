import { DiceRollContainer, InitiativeRoll } from "./roll-dice.js";

export class WoDCombat extends foundry.documents.Combat {
	async rollInitiative(ids, options = {}) {
		const combatantIds = Array.isArray(ids) ? ids : [ids];

		for (const id of combatantIds) {
			const combatant = this.combatants.get(id);
			if (!combatant?.actor) continue;

			const initiativeRoll = new DiceRollContainer(combatant.actor);
			initiativeRoll.origin = "initiative";
			initiativeRoll.combatant = combatant;
			await InitiativeRoll(initiativeRoll);
		}

		return this;
	}
}
