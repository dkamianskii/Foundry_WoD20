import BonusHelper from "./bonus-helpers.js";
import CombatHelper from "./combat-helpers.js";
import { getWillpowerState, spendWillpower } from "./willpower.js";
import { getActorHealthState, getEffectiveWoundPenalty } from "./health.js";
import { rollUsesAttribute } from "./roll-penalties.js";
import { INITIATIVE_DIFFICULTY, resolveInitiativeDice } from "./initiative.js";

let _diceColor;
let _specialDiceType = "";

function _GetDiceColors(actor) {
	_diceColor = "black_";

	if (actor == undefined) {
		_diceColor = "black_";
		return;
	}

	let diceType = actor?.type.toLowerCase();

	// For PC actors, use variantsheet or splat to determine dice type
	if (actor.type === "PC") {
		if (actor?.system?.settings?.splat && actor.system.settings.splat !== "") {
			diceType = actor.system.settings.splat.toLowerCase();
		}
		else if (actor?.system?.settings?.variantsheet && actor.system.settings.variantsheet !== "") {
			diceType = actor.system.settings.variantsheet.toLowerCase();
		}
	}

	if (actor?.system?.settings?.dicesetting != "") {
		diceType = actor.system.settings.dicesetting;
	}
	if ((actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.changeling) && (actor.system.settings.dicesetting == "")) {
		_diceColor = "blue_";
	}
	if ((actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.werewolf) && (actor.system.settings.dicesetting == "")) {
		_diceColor = "brown_";
	}
	if ((actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.mage) && (actor.system.settings.dicesetting == "")) {
		_diceColor = "purple_";
	}
	if ((actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.vampire) && (actor.system.settings.dicesetting == "")) {
		_diceColor = "red_";
	}
	if ((actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.wraith) && (actor.system.settings.dicesetting == "")) {
		_diceColor = "death_";
	}

	if (diceType == CONFIG.worldofdarkness.sheettype.mortal.toLowerCase()) {
		_diceColor = "blue_";
	}
	if ((diceType == CONFIG.worldofdarkness.sheettype.werewolf.toLowerCase()) || (diceType == "changing breed")) {
		_diceColor = "brown_";
	}
	if (diceType == CONFIG.worldofdarkness.sheettype.mage.toLowerCase()) {
		_diceColor = "purple_";
	}
	if (diceType == CONFIG.worldofdarkness.sheettype.vampire.toLowerCase()) {
		_diceColor = "red_";
	}
	if (diceType == CONFIG.worldofdarkness.sheettype.changeling.toLowerCase()) {
		_diceColor = "blue_";
		_specialDiceType = "black_";
	}
	if ((diceType == CONFIG.worldofdarkness.sheettype.hunter.toLowerCase()) || (diceType == CONFIG.worldofdarkness.sheettype.demon.toLowerCase())) {
		_diceColor = "orange_";
	}
	if ((diceType == CONFIG.worldofdarkness.sheettype.wraith.toLowerCase()) || (actor.system.settings.variantsheet == CONFIG.worldofdarkness.sheettype.wraith)) {
		_diceColor = "death_";
	}
	if (diceType == CONFIG.worldofdarkness.sheettype.mummy.toLowerCase()) {
		_diceColor = "yellow_";
	}
	if (diceType == "none") {
		_diceColor = "black_";
	}
}

/* klassen som man använder för att skicka in information in i RollDice */
export class DiceRollContainer {
    constructor(actor) {
		this.actor = actor; 	// rolling actor
		this.attribute = "noselected";
		this.ability = "noselected";
		this.dicetext = [];
		this.bonus = 0;
		this.resistance = 0;
		this.extraInfo = [];
		this.origin = "";

		this.numDices = 0;
		this.numSpecialDices = 0;
		this.woundpenalty = 0;
		this.willpowerpenalty = null;
		this.difficulty	= 6;
		this.action = "";
		this.targetlist = [];

		this.speciality = false;
		this.usewillpower = false;
		this.specialityText = "";
		this.systemText = "";
		this.powerType = "";
		this.incomingDamage = 0;
		this.maxApplicableDamage = null;
    }
}

/**
 * @returns {"off"|"core"|"playersguide"}
 */
export function GetEvocationTormentMode() {
	return game.settings.get("wod-advanced", "demonEvocationTorment") || "off";
}

/**
 * Whether this Lore roll should resolve high- vs normal-Torment effect.
 * Legacy uses settings.hastorment; PC uses haslores / demon splat / Torment Advantage.
 */
function _ShouldEvaluateEvocationTorment(actor, powerType) {
	if (powerType !== "wod.types.lorepower") {
		return false;
	}
	if (GetEvocationTormentMode() === "off") {
		return false;
	}
	if (!actor) {
		return false;
	}

	if (actor.system?.settings?.hastorment) {
		return true;
	}

	// Legacy Demon actor type
	if (actor.type === CONFIG.worldofdarkness.sheettype.demon) {
		return true;
	}

	if (actor.type === "PC") {
		if (actor.system?.settings?.haslores) {
			return true;
		}

		const splat = (actor.system?.settings?.splat || "").toLowerCase();
		const sheet = (actor.system?.settings?.variantsheet || "").toLowerCase();
		if ((splat === "demon") || (sheet === "demon")) {
			return true;
		}

		return !!actor.items.find(item =>
			item.type === "Advantage" && item.system?.id === "torment"
		);
	}

	return false;
}

/**
 * Permanent Torment rating — Advantage item on PC, system.advantages on legacy.
 */
function _GetPermanentTorment(actor) {
	if (!actor) {
		return 0;
	}

	if (actor.type === "PC") {
		const torment = actor.items.find(item =>
			item.type === "Advantage" && item.system?.id === "torment"
		);
		return parseInt(torment?.system?.permanent ?? 0) || 0;
	}

	const torment = actor.system.advantages?.torment;
	// Permanent Torment is the rating used for Lore comparisons (not temporary)
	return parseInt(torment?.permanent ?? 0) || 0;
}

/**
 * Demon: The Fallen — among successful Lore dice, compare faces to Permanent Torment.
 *
 * Modes:
 * - core (rulebook): any success ≤ Permanent Torment → high-Torment effect
 * - playersguide (errata): high-Torment only when more than half of successes are ≤ Permanent Torment
 */
function _EvaluateEvocationTorment(dices, difficulty, permanentTorment, mode) {
	const successFaces = (dices ?? [])
		.map(d => d.value)
		.filter(value => value >= difficulty);

	if (successFaces.length === 0) {
		return null;
	}

	const tormentSuccesses = successFaces.filter(value => value <= permanentTorment).length;
	const normalSuccesses = successFaces.length - tormentSuccesses;

	let outcome = "normal";

	if (mode === "core") {
		// Core book: a single success ≤ Torment flips the whole evocation
		outcome = tormentSuccesses > 0 ? "high" : "normal";
	}
	else {
		// Players Guide errata: more than half of successes ≤ Torment
		if (tormentSuccesses > normalSuccesses) {
			outcome = "high";
		}
		else if (normalSuccesses > tormentSuccesses) {
			outcome = "normal";
		}
		else {
			outcome = "tie";
		}
	}

	return {
		outcome,
		mode,
		tormentSuccesses,
		normalSuccesses,
		permanentTorment,
		difficulty
	};
}

/**
 * Spend one temporary Willpower point.
 * PC actors use the actor-owned wound track; legacy actors use temporary Willpower.
 * @param {Actor} actor
 * @returns {Promise<boolean>} true if a point was spent
 */
async function _spendTemporaryWillpower(actor) {
	if (!actor) {
		return false;
	}

	if (actor.type === "PC") {
		return spendWillpower(actor);
	}

	const current = parseInt(actor.system.advantages?.willpower?.temporary ?? 0);
	if (current <= 0) {
		return false;
	}

	await actor.update({
		"system.advantages.willpower.temporary": current - 1
	});
	return true;
}

// Function to roll dice
export async function DiceRoller(diceRoll) {
	const actor = diceRoll.actor;
	let difficulty = diceRoll.difficulty;
	let specialityText = diceRoll.specialityText;
	const systemText = diceRoll.systemText;
	let targetlist = diceRoll.targetlist;
	let usewillpower = diceRoll.usewillpower;

	let diceResult;

	// multi damage dices
	const allDiceResult = [];
	let rollInfo = "";

	// dices to Dice So Nice :)
	const allDices = [];

	let rolledDices;
	let success;
	let bonusSuccesses = 0;
	let rolledAnySuccesses = false;
	let isfavorited = false;
	let canBotch = true;
	let rollResult = "";
	let info = [];
	let systemtext = [];
	let healthPenalty = parseInt(diceRoll.woundpenalty) || 0;
	let healthWoundLevel = actor?.system?.health?.damage?.woundlevel ?? "";
	let willpowerPenalty = 0;


	difficulty = difficulty < CONFIG.worldofdarkness.lowestDifficulty ? CONFIG.worldofdarkness.lowestDifficulty : difficulty;
	difficulty = difficulty > CONFIG.worldofdarkness.highestDifficulty ? CONFIG.worldofdarkness.highestDifficulty : difficulty;

	if (actor != undefined) {
		if (await BonusHelper.CheckAttributeAutoBuff(actor, diceRoll.attribute)) {
			bonusSuccesses = await BonusHelper.GetAttributeAutoBuff(actor, diceRoll.attribute);
		}
	}

	if (usewillpower) {
		const spent = actor ? await _spendTemporaryWillpower(actor) : false;

		if (!spent) {
			usewillpower = false;
			if (actor) {
				ui.notifications.warn(game.i18n.format("wod.dice.nowillpower", {name: actor.name}));
			}
		}
		else if ((actor?.type !== "PC") && CONFIG.worldofdarkness.willpowerBonusDice) {
			canBotch = false;
			diceRoll.numDices += 3;
		}
		else {
			canBotch = false;
			rolledAnySuccesses = true;
			bonusSuccesses += 1;
		}
	}

	const willpowerState = actor?.type === "PC" ? getWillpowerState(actor) : null;
	const explicitWillpowerPenalty = Number.parseInt(diceRoll.willpowerpenalty, 10);
	if (Number.isFinite(explicitWillpowerPenalty)) {
		willpowerPenalty = explicitWillpowerPenalty;
	}
	else if (actor?.type === "PC") {
		willpowerPenalty = willpowerState.woundpenalty;
	}

	if (!rollUsesAttribute(diceRoll)) {
		healthPenalty = 0;
		willpowerPenalty = 0;
		healthWoundLevel = "";
	}

	if (actor?.type === "PC" && CombatHelper.ignoresPain(actor)) {
		if (healthPenalty < 0) {
			const health = getActorHealthState(actor);
			const effectiveHealth = getEffectiveWoundPenalty(health, true);
			healthPenalty = effectiveHealth.penalty;
			healthWoundLevel = effectiveHealth.woundlevel;
		}
		if (willpowerPenalty < 0) {
			const effectiveWillpower = getEffectiveWoundPenalty(willpowerState, true);
			willpowerPenalty = effectiveWillpower.penalty;
		}
	}

	if ((diceRoll.origin == "soak") && (!CONFIG.worldofdarkness.useOnesSoak)) {
		canBotch = false;
	}

	if ((diceRoll.origin == "damage") && (!CONFIG.worldofdarkness.useOnesDamage)) {
		canBotch = false;
	}

	// set correct dice colors
	_GetDiceColors(actor);

	if (targetlist.length == 0) {
		let target = {
			numDices: diceRoll.numDices
		}
		targetlist.push(target);
	}

	for (const target of targetlist) {
		success = bonusSuccesses;
		let rawSuccesses = 0;
		let rolledOnes = 0;
		rolledAnySuccesses = success > 0;
		rolledDices = 0;
		diceResult = [];
		diceResult.dices = [];
		diceResult.successes = success;
		diceResult.rolledAnySuccesses = rolledAnySuccesses;

		let numberDices = (parseInt(target.numDices) || 0)
			+ healthPenalty
			+ willpowerPenalty;
		const zeroPoolFailure = numberDices <= 0;
		numberDices = Math.max(0, numberDices);

		while (numberDices > rolledDices) {
			let chosenDiceColor = _diceColor;
			let roll = await new Roll("1d10");
			await roll.evaluate();
			allDices.push(roll);

			// Increment the number of dices that've been rolled
			rolledDices += 1;

			// Evaluate each roll term
			roll.terms[0].results.forEach((dice) => {

				if (dice.result == 10) {
					rawSuccesses += 1;
					if ((CONFIG.worldofdarkness.usespecialityAddSuccess) && (diceRoll.speciality)) {
						success += CONFIG.worldofdarkness.specialityAddSuccess;
					}
					else if (CONFIG.worldofdarkness.usetenAddSuccess) {
						success += CONFIG.worldofdarkness.tenAddSuccess;
					}
					else {
						success += 1;
					}
					if (CONFIG.worldofdarkness.useexplodingDice) {
						if ((CONFIG.worldofdarkness.explodingDice == "speciality") && (diceRoll.speciality)) {
							rolledDices -= 1;
						}
						if ((CONFIG.worldofdarkness.explodingDice == "nospeciality") && (!diceRoll.speciality)) {
							rolledDices -= 1;
						}
						if (CONFIG.worldofdarkness.explodingDice == "always") {
							rolledDices -= 1;
						}
					}

					rolledAnySuccesses = true;
				}
				else if (dice.result >= difficulty) {
					rawSuccesses += 1;
					rolledAnySuccesses = true;
					success += 1;
				}
				else if (dice.result == 1) {
					rolledOnes += 1;

					// Preserve the informational marker for favored Exalted rolls.
					if ((actor !== undefined) && ((actor.system.attributes[diceRoll.attribute]?.isfavorited) || (actor.system.attributes[diceRoll.ability]?.isfavorited) &&
							(actor.system.abilities[diceRoll.attribute]?.isfavorited) || (actor.system.abilities[diceRoll.ability]?.isfavorited))) {
						isfavorited = true;
					}
				}

				if ((diceRoll.numSpecialDices >= rolledDices) && (diceRoll.numSpecialDices > 0)) {
					chosenDiceColor = _specialDiceType;
				}

				let result = {
					value: parseInt(dice.result),
					color: chosenDiceColor
				}

				diceResult.dices.push(result);
			});
		}

		const baseResistance = Math.max(0, parseInt(diceRoll.resistance) || 0);
		const totalResistance = baseResistance + rolledOnes;
		const successesBeforeResistance = success;

		if (zeroPoolFailure) {
			success = 0;
			rolledAnySuccesses = false;
			rollResult = "fail";
		}
		else {
			success = Math.max(0, successesBeforeResistance - totalResistance);

			if ((actor?.type !== "PC") && (usewillpower && !CONFIG.worldofdarkness.willpowerBonusDice) && (success < 1)) {
				success = 1;
			}

			if ((rolledOnes > rawSuccesses) && (canBotch)) {
				rollResult = "botch";
				rolledAnySuccesses = false;
			}
			else if (success > 0) {
				rollResult = "success";
			}
			else {
				rollResult = "fail";
			}
		}

		// if setting of speciality not allow botch is in effect it is a fail instead
		if ((rollResult == "botch") && (!CONFIG.worldofdarkness.specialityAllowBotch) && (diceRoll.speciality)) {
			rollResult = "fail";
		}

		const marginOfFailure = Math.max(0, totalResistance - rawSuccesses);
		const additionalSuccesses = Math.max(0, success - 1);
		rolledAnySuccesses = rollResult === "success";

		diceResult.successes = `${game.i18n.localize("wod.dice.successes")}: ${successesBeforeResistance}`;
		diceResult.resistance = totalResistance;
		diceResult.marginOfFailure = marginOfFailure;
		diceResult.additionalSuccesses = additionalSuccesses;
		diceResult.rolledAnySuccesses = rolledAnySuccesses;
		diceResult.rollResult = rollResult;
		diceResult.zeroPoolFailure = zeroPoolFailure;

		allDiceResult.push(diceResult);
	}

	for (const property of diceRoll.dicetext) {
		if (rollInfo != "") {
			rollInfo += " + ";
		}
		rollInfo += property;
	}

	if ((diceRoll.bonus > 0) && (diceRoll.dicetext.length > 0)) {
		rollInfo += ` + ${diceRoll.bonus}`;
	}
	else if ((diceRoll.bonus > 0) || (diceRoll.bonus < 0)) {
		rollInfo += ` ${diceRoll.bonus}`;
	}

	// if attack then there will be a damage code in the information
	if (diceRoll.damageCode != undefined) {
		if (rollInfo != "") {
			rollInfo += " ";
		}
		rollInfo += diceRoll.damageCode;
	}

	// if any wound penalty show in message
	if (healthPenalty < 0 && actor?.system?.health && healthWoundLevel) {
		info.push(`${game.i18n.localize(healthWoundLevel)} (${healthPenalty})`);
	}
	if (willpowerPenalty < 0) {
		info.push(`${game.i18n.localize("wod.advantages.exhaustion")}: ${willpowerPenalty}`);
	}

	if (diceRoll.speciality) {

		if (specialityText == "") {
			specialityText = game.i18n.localize("wod.dialog.usingspeciality");
		}
	}
	else {
		specialityText = "";
	}

	const numericDifficulty = difficulty;
	difficulty = `${game.i18n.localize("wod.labels.difficulty")}: ${difficulty}`;

	for (const property of diceRoll.extraInfo) {
		info.push(property);
	}

	if (difficulty != "") {
		info.push(difficulty);
	}
	if (specialityText != "") {
		info.push(specialityText);
	}
	if (usewillpower) {
		let willpowerText = "";
		if ((actor?.type !== "PC") && CONFIG.worldofdarkness.willpowerBonusDice) {
			willpowerText = ` (+3 ${game.i18n.localize("wod.dice.bonusdices")})`;
		}
		info.push(game.i18n.localize("wod.dice.usingwillpower") + willpowerText);
	}
	if (!canBotch) {
		info.push(game.i18n.localize("wod.dice.nobotchpossible"));
	}
	if (systemText != "") {
		systemtext.push(systemText);
	}
	if (bonusSuccesses > 0) {
		let text = game.i18n.localize("wod.dice.addedautosucc");
		info.push(text.replace("{0}", bonusSuccesses));
	}
	if (isfavorited) {
		info.push(game.i18n.localize("wod.dice.favored"));
	}

	// Soak: show unsoaked damage when incoming damage was specified
	const incomingDamage = parseInt(diceRoll.incomingDamage) || 0;
	if ((diceRoll.origin === "soak") && (incomingDamage > 0)) {
		let unsoaked = Math.max(0, incomingDamage - success);
		if (diceRoll.maxApplicableDamage != null) {
			unsoaked = Math.min(unsoaked, Math.max(0, parseInt(diceRoll.maxApplicableDamage) || 0));
		}
		info.push(game.i18n.format("wod.dice.unsoakeddamage", {
			unsoaked: unsoaked,
			incoming: incomingDamage
		}));
	}

	// Lore powers: mention high-Torment effect in the roll card when it triggers
	if (_ShouldEvaluateEvocationTorment(actor, diceRoll.powerType)) {
		const permanentTorment = _GetPermanentTorment(actor);
		const evocationTorment = _EvaluateEvocationTorment(
			allDiceResult[0]?.dices,
			numericDifficulty,
			permanentTorment,
			GetEvocationTormentMode()
		);

		if (evocationTorment?.outcome === "high") {
			info.push(`<span class="danger">${game.i18n.localize("wod.dice.evocation.highchat")}</span>`);
		}
	}

	/* needs dividing - dice info , extra info and system texts */

    const templateData = {
        data: {
            actor: diceRoll.actor,
            type: diceRoll.origin,
            action: diceRoll.action,
            title: rollInfo,
			info: info,
			systemtext: systemtext,
			multipleresult: allDiceResult
        }
    };

    // Render the chat card template
    const template = `systems/wod-advanced/templates/dialogs/roll-template.hbs`;
    const html = await foundry.applications.handlebars.renderTemplate(template, templateData);

    const chatData = {
        rolls: allDices,
        content: html,
		speaker: ChatMessage.getSpeaker({ actor: actor }),
    };

    ChatMessage.applyMode(chatData);
    ChatMessage.create(chatData);

    return success;
}

export async function InitiativeRoll(diceRoll) {
	const actor = diceRoll.actor;

	let allDiceResult = [];
	let diceResult = [];
	diceResult.dices = [];
	let info = [];

	let rollInfo = "";

	let foundToken = false;
	let foundEncounter = true;
	let init = 0;

	const existingCombatant = diceRoll.combatant;
	let token = existingCombatant?.token?.object ?? await canvas.tokens.placeables.find(t => t.document.actor._id === actor._id);

	if (token || existingCombatant) foundToken = true;

	if (game.combat == null) {
		foundEncounter = false;
	}

	// set correct dice colors
	_GetDiceColors(actor);

	const dexterity = Math.max(0, parseInt(actor.system.attributes.dexterity.total) || 0);
	const wits = Math.max(0, parseInt(actor.system.attributes.wits.total) || 0);
	const initiativePool = dexterity + wits;
	let roll = new Roll(`${initiativePool}d10cs>=${INITIATIVE_DIFFICULTY}x=10df=1`);
	await roll.evaluate();
	const diceValues = roll.dice.flatMap(die => die.results.map(dice => parseInt(dice.result)));
	const initiativeResult = resolveInitiativeDice(diceValues);
	init = initiativeResult.initiative;

	for (const value of diceValues) {
		diceResult.dices.push({value, color: _diceColor});
	}

	diceResult.successes = initiativeResult.successes;
	diceResult.rollResult = initiativeResult.rollResult;
	diceResult.initiative = init;
	rollInfo = `${game.i18n.localize(actor.system.attributes.dexterity.label)} ${dexterity} + ${game.i18n.localize(actor.system.attributes.wits.label)} ${wits} = ${initiativePool}; ${game.i18n.localize("wod.labels.difficulty")}: ${INITIATIVE_DIFFICULTY}`;

	allDiceResult.push(diceResult);

	if ((foundToken) && (foundEncounter)) {
		let combatant = existingCombatant;

		if (!combatant && !CombatHelper._inTurn(token)) {
			await token.document.toggleCombatant();
			combatant = token.combatant;
		}
		else if (!combatant) {
			combatant = token.combatant;
		}

		if (combatant) {
			await combatant.parent.setInitiative(combatant.id, init);
		}
	}

	//(into)
	if (!foundEncounter) {
		info.push(game.i18n.localize("wod.dice.noencounterfound"));
	}
	else {
		if (!foundToken) {
			info.push(game.i18n.localize("wod.dice.notokenfound"));
		}
	}

	const templateData = {
        data: {
            actor: diceRoll.actor,
            type: diceRoll.origin,
            action: game.i18n.localize("wod.dice.rollinginitiative"),
            title: rollInfo,
						info: info,
						multipleresult: allDiceResult
        }
    };

    // Render the chat card template
    const template = `systems/wod-advanced/templates/dialogs/roll-template.hbs`;
    const html = await foundry.applications.handlebars.renderTemplate(template, templateData);

    const chatData = {
		rolls: [roll],
        content: html,
		speaker: ChatMessage.getSpeaker({ actor: actor }),
    };
    ChatMessage.applyMode(chatData);
    ChatMessage.create(chatData);

	return true;
}
