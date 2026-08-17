import { databio } from "../assets/data/sheet/bio.js";
import { dataability } from "../assets/data/sheet/ability.js";
import { databiotab } from "../assets/data/sheet/biotab.js";
import { datapowertab } from "../assets/data/sheet/powertab.js";

/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {

	// Define template paths to load
	const templatePaths = [
		// PC Actor Sheet Partials - .hbs files
		"systems/wod-advanced/templates/actor/parts/navigation.hbs",
			"systems/wod-advanced/templates/actor/parts/macro_icons.hbs",
			"systems/wod-advanced/templates/actor/parts/navigation_lock.hbs",
		"systems/wod-advanced/templates/actor/parts/bio.hbs",
			"systems/wod-advanced/templates/actor/parts/bio_splatfields.hbs",
			"systems/wod-advanced/templates/actor/parts/bio_splatboxes.hbs",
		"systems/wod-advanced/templates/actor/parts/stats.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_attributes.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_abilities.hbs",
			"systems/wod-advanced/templates/actor/parts/stat_value_dots.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_advantages.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_virtue.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_renown.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_quintessence.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_groupedadvantages.hbs",
		"systems/wod-advanced/templates/actor/parts/powers.hbs",
			"systems/wod-advanced/templates/actor/parts/power_listmainpower.hbs",
			"systems/wod-advanced/templates/actor/parts/power_listpower.hbs",
			"systems/wod-advanced/templates/actor/parts/power_listpowerdots.hbs",
			"systems/wod-advanced/templates/actor/parts/power_shapes.hbs",
			"systems/wod-advanced/templates/actor/parts/power_spheres.hbs",
			"systems/wod-advanced/templates/actor/parts/power_realms.hbs",
			"systems/wod-advanced/templates/actor/parts/power_apocalypticforms.hbs",
		"systems/wod-advanced/templates/actor/parts/combat.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_natural.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_melee.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_ranged.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_armor.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_conditions.hbs",
			"systems/wod-advanced/templates/actor/parts/combat_movement.hbs",
		"systems/wod-advanced/templates/actor/parts/gear.hbs",
		"systems/wod-advanced/templates/actor/parts/feature.hbs",
		"systems/wod-advanced/templates/actor/parts/feature_item.hbs",
		"systems/wod-advanced/templates/actor/parts/effects.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_health.hbs",
			"systems/wod-advanced/templates/actor/parts/stats_willpower.hbs",

		// PC Actor Sheet Partials - .html files
		//"systems/wod-advanced/templates/actor/parts/power_listpower.html",

		// PC and Legacy Actor Sheet Partials - .hbs files
		"systems/wod-advanced/templates/actor/parts/description.hbs",
		"systems/wod-advanced/templates/actor/parts/list_icons.hbs",



		// Legacy Actor Sheet Partials - .html files
		"systems/wod-advanced/templates/actor/parts/profile-img.html",
		"systems/wod-advanced/templates/actor/parts/navigation.html",
		"systems/wod-advanced/templates/actor/parts/bio.html",
		"systems/wod-advanced/templates/actor/parts/attributes.html",
		"systems/wod-advanced/templates/actor/parts/abilities.html",
		"systems/wod-advanced/templates/actor/parts/combat.html",
		"systems/wod-advanced/templates/actor/parts/power.html",
		"systems/wod-advanced/templates/actor/parts/conditions.html",			// TODO - Seperate file?
		"systems/wod-advanced/templates/actor/parts/movement.html",				// TODO - Seperate file?
		"systems/wod-advanced/templates/actor/parts/macro_icons.html",
		"systems/wod-advanced/templates/actor/parts/combat_natural.html",
		"systems/wod-advanced/templates/actor/parts/combat_melee.html",
		"systems/wod-advanced/templates/actor/parts/combat_ranged.html",
		"systems/wod-advanced/templates/actor/parts/combat_armor.html",
		"systems/wod-advanced/templates/actor/parts/stats.html",
		"systems/wod-advanced/templates/actor/parts/creature/stats.html",
		"systems/wod-advanced/templates/actor/parts/stats_virtue.html",
		"systems/wod-advanced/templates/actor/parts/hunter/stats_virtue.html",
		"systems/wod-advanced/templates/actor/parts/demon/forms.html",
		"systems/wod-advanced/templates/actor/parts/stats_health.html",
		"systems/wod-advanced/templates/actor/parts/stats_health_old.html",		// TODO - should be removed or reworked in future
		"systems/wod-advanced/templates/actor/parts/gear.html",
		"systems/wod-advanced/templates/actor/parts/notes.html",
		"systems/wod-advanced/templates/actor/parts/effect.html",
		"systems/wod-advanced/templates/actor/parts/settings.html",
		"systems/wod-advanced/templates/actor/parts/settings_attribute.html",
		"systems/wod-advanced/templates/actor/parts/settings_abilities.html",
		"systems/wod-advanced/templates/actor/parts/settings_combat.html",
		"systems/wod-advanced/templates/actor/parts/settings_power.html",
		"systems/wod-advanced/templates/actor/parts/settings_sheet.html",

		// Vampire
		"systems/wod-advanced/templates/actor/parts/vampire/bio_vampire_background.html",
		"systems/wod-advanced/templates/actor/parts/vampire/disciplines.html",
		"systems/wod-advanced/templates/actor/parts/mainpower_list.html",
		"systems/wod-advanced/templates/actor/parts/power_list.html",

		// Mage
		"systems/wod-advanced/templates/actor/parts/mage/bio_mage_background.html",
		"systems/wod-advanced/templates/actor/parts/mage/stats_arete.html",			// TODO - should use the new stat function
		"systems/wod-advanced/templates/actor/parts/mage/stats_quintessence.html",
		"systems/wod-advanced/templates/actor/parts/mage/magic.html",
		"systems/wod-advanced/templates/actor/parts/mage/resonance.html",
		"systems/wod-advanced/templates/actor/parts/mage/rotes.html",
		"systems/wod-advanced/templates/actor/parts/mage/spheres.html",
		"systems/wod-advanced/templates/actor/parts/mage/focus.html",

		// Werewolf
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_werewolf_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_ajaba_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_ananasi_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_bastet_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_corax_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_gurahl_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_kitsune_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_mokole_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_nagah_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_nuwisha_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_ratkin_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_rokea_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_apis_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_camazotz_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/bio_grondr_background.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/stats_nagah_renown.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/combat_active.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_ajaba.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_ananasi.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_bastet.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_corax.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_gurahl.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_kitsune.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_mokole.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_nagah.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_nuwisha.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_ratkin.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_rokea.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_apis.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_camazotz.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/shift_grondr.html",
		"systems/wod-advanced/templates/actor/parts/gifts.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/gift.html",
		"systems/wod-advanced/templates/actor/parts/werewolf/rites.html",

		// Changeling
		"systems/wod-advanced/templates/actor/parts/changeling/bio_changeling_background.html",
		"systems/wod-advanced/templates/actor/parts/changeling/dreaming.html",

		// Hunter
		"systems/wod-advanced/templates/actor/parts/hunter/bio_hunter_background.html",
		"systems/wod-advanced/templates/actor/parts/hunter/edges.html",

		// Demon
		"systems/wod-advanced/templates/actor/parts/demon/bio_demon_background.html",
		"systems/wod-advanced/templates/actor/parts/demon/lores.html",

		// Wraith
		"systems/wod-advanced/templates/actor/parts/wraith/bio_wraith_background.html",
		"systems/wod-advanced/templates/actor/parts/wraith/shadow.html",
		"systems/wod-advanced/templates/actor/parts/wraith/death.html",

		// Mummy
		"systems/wod-advanced/templates/actor/parts/mummy/bio_mummy_background.html",

		// Exalted
		"systems/wod-advanced/templates/actor/parts/exalted/bio_exalted_background.html",
		"systems/wod-advanced/templates/actor/parts/exalted/exalted_charms.html",

		// Orpheus
		"systems/wod-advanced/templates/actor/parts/variant/bio_orpheus_background.html",

		// Sorcerer
		"systems/wod-advanced/templates/actor/parts/variant/bio_sorcerer_background.html",
		"systems/wod-advanced/templates/actor/parts/variant/stats_quintessence.html",

		// Creature
		"systems/wod-advanced/templates/actor/parts/creature/charms.html",
		"systems/wod-advanced/templates/actor/parts/creature/power.html",

		// Item Sheet Partials - .hbs files
		"systems/wod-advanced/templates/items/parts/description.hbs",
		"systems/wod-advanced/templates/items/parts/splat-bio-fields.hbs",
		"systems/wod-advanced/templates/items/parts/splat-bio-tab.hbs",

		// Item Sheet Partials
		"systems/wod-advanced/templates/sheets/parts/power_rollable.html",
		"systems/wod-advanced/templates/sheets/parts/power_description.html",
		"systems/wod-advanced/templates/sheets/parts/item_bonus.html"
	];

	/* Load the template parts */
	return foundry.applications.handlebars.loadTemplates(templatePaths);
};

export function SetupAbilities()
{
    try {
		let importData = dataability;
		return importData;
    }
	catch(err) {
		err.message = `Failed Setup ability: ${err.message}`;
        console.error(err);
        return
    }
}

export function SetupBio()
{
    try {
		let importData = databio;
		return importData;
    }
	catch(err) {
		err.message = `Failed Setup bio: ${err.message}`;
        console.error(err);
        return
    }
}

// PC
export function SetupBioTab()
{
    try {
		let importData = databiotab;
		return importData;
    }
	catch(err) {
		err.message = `Failed Setup bio: ${err.message}`;
        console.error(err);
        return
    }
}

// PC
export function SetupPowerTab()
{
    try {
		let importData = datapowertab;
		return importData;
    }
	catch(err) {
		err.message = `Failed Setup power: ${err.message}`;
        console.error(err);
        return
    }
}
