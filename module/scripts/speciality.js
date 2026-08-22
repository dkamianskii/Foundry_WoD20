export const ABILITY_SPECIALITY_LEVEL = 2;

function getAbilityData(ability) {
    return ability?.system ?? ability ?? {};
}

export function getAbilitySpecialityState(ability) {
    const data = getAbilityData(ability);
    const value = Math.max(0, parseInt(data.value) || 0);
    const text = typeof data.speciality === "string" ? data.speciality.trim() : "";
    const canTakeSpeciality = value >= ABILITY_SPECIALITY_LEVEL;

    return {
        value,
        text,
        canTakeSpeciality,
        hasSpeciality: canTakeSpeciality && text.length > 0
    };
}

export function canAbilityTakeSpeciality(ability) {
    return getAbilitySpecialityState(ability).canTakeSpeciality;
}

export function hasUsableAbilitySpeciality(ability) {
    return getAbilitySpecialityState(ability).hasSpeciality;
}
