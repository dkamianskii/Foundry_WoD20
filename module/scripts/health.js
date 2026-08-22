export const HEALTH_LEVELS = Object.freeze([
    {id: "bruised", label: "wod.health.bruised", penalty: 0},
    {id: "hurt", label: "wod.health.hurt", penalty: -1},
    {id: "wounded", label: "wod.health.wounded", penalty: -2},
    {id: "mauled", label: "wod.health.mauled", penalty: -3},
    {id: "crippled", label: "wod.health.crippled", penalty: -5}
]);

export const WOUND_SEVERITIES = Object.freeze(["light", "heavy", "aggravated"]);

const SEVERITY_RANK = Object.freeze({light: 1, heavy: 2, aggravated: 3});
const WOUND_MARKERS = Object.freeze({light: "/", heavy: "X", aggravated: "Ж"});
const LEGACY_DAMAGE_SEVERITY = Object.freeze({bashing: "light", lethal: "heavy", aggravated: "aggravated"});

export function calculateMaxHealth(strength, stamina, healthBonus = 0) {
    return Math.max(0, 2 + integer(strength) + integer(stamina) + integer(healthBonus));
}

export function distributeHealthLevels(maxHealth) {
    const maximum = Math.max(0, integer(maxHealth));
    const base = Math.floor(maximum / HEALTH_LEVELS.length);
    const distribution = HEALTH_LEVELS.map(level => ({...level, count: base}));
    let remainder = maximum % HEALTH_LEVELS.length;

    for (let index = distribution.length - 1; index >= 0 && remainder > 0; index--, remainder--) {
        distribution[index].count += 1;
    }

    return distribution;
}

export function normalizeWounds(wounds) {
    return Array.from(wounds ?? [])
        .filter(severity => WOUND_SEVERITIES.includes(severity));
}

/** Apply wounds to a finite track and retain any unresolved overflow. */
export function applyWounds(wounds, severity, amount, maxHealth) {
    if (!WOUND_SEVERITIES.includes(severity)) throw new Error(`Unknown wound severity '${severity}'.`);

    const maximum = Math.max(0, integer(maxHealth));
    const normalized = normalizeWounds(wounds);
    const track = normalized.slice(0, maximum);
    const overflow = normalized.slice(maximum);
    let remaining = Math.max(0, integer(amount));

    while (remaining-- > 0) {
        const displaced = applyOneWound(track, severity, maximum);
        if (displaced) overflow.push(displaced);
    }

    return normalizeWounds([...track, ...overflow]);
}

export function removeWounds(wounds, severity, amount) {
    if (!WOUND_SEVERITIES.includes(severity)) throw new Error(`Unknown wound severity '${severity}'.`);

    const result = normalizeWounds(wounds);
    let remaining = Math.max(0, integer(amount));
    while (remaining-- > 0) {
        const index = result.lastIndexOf(severity);
        if (index < 0) break;
        result.splice(index, 1);
    }
    return result;
}

export function setHealthBox(wounds, index, severity, maxHealth) {
    const result = normalizeWounds(wounds);
    const box = Math.max(0, integer(index));

    if (severity !== null && !WOUND_SEVERITIES.includes(severity)) {
        throw new Error(`Unknown wound severity '${severity}'.`);
    }

    if (box < result.length) {
        if (severity === null) result.splice(box, 1);
        else result[box] = severity;
        return normalizeWounds(result);
    }

    if (severity !== null) return applyWounds(result, severity, 1, maxHealth);
    return result;
}

/** Apply the character-sheet left-click cycle without allowing gaps in the track. */
export function cycleHealthBox(wounds, clickedIndex, clickedSeverity, maxHealth) {
    const result = normalizeWounds(wounds);

    if (!clickedSeverity) return applyWounds(result, "light", 1, maxHealth);

    if (clickedSeverity === "light" || clickedSeverity === "heavy") {
        const firstMatchingIndex = result.indexOf(clickedSeverity);
        if (firstMatchingIndex < 0) return result;
        result[firstMatchingIndex] = clickedSeverity === "light" ? "heavy" : "aggravated";
        return result;
    }

    if (clickedSeverity === "aggravated") {
        const box = Math.max(0, integer(clickedIndex));
        const aggravatedIndex = result[box] === "aggravated" ? box : result.indexOf("aggravated");
        if (aggravatedIndex >= 0) result.splice(aggravatedIndex, 1);
    }

    return result;
}

export function legacyDamageToWounds(damage) {
    return normalizeWounds([
        ...repeat("aggravated", damage?.aggravated),
        ...repeat("heavy", damage?.lethal),
        ...repeat("light", damage?.bashing)
    ]);
}

export function migrateLegacyHealth(source) {
    const health = source?.health ?? {};
    const damage = health.damage ?? {};
    const levels = ["bruised", "hurt", "injured", "wounded", "mauled", "crippled", "incapacitated"];
    const hasLegacyHealth = ["bashing", "lethal", "aggravated"].some(type => damage[type] !== undefined)
        || levels.some(level => health[level] !== undefined);

    if (!hasLegacyHealth) return {bonus: Math.max(0, integer(health.bonus)), wounds: normalizeWounds(health.wounds)};

    const configuredMaximum = levels.reduce((total, level) => total + (integer(health[level]?.value)), 0);
    const legacyMaximum = configuredMaximum > 0
        ? configuredMaximum
        : integer(source?.traits?.health?.totalhealthlevels?.max);
    const formulaBase = 2
        + integer(source?.attributes?.strength?.value)
        + integer(source?.attributes?.stamina?.value);

    return {
        bonus: legacyMaximum > 0 ? Math.max(0, legacyMaximum - formulaBase) : 0,
        wounds: legacyDamageToWounds(damage)
    };
}

/**
 * Migrate Health fields only when the supplied source actually contains the
 * legacy PC representation. Foundry can pass partial update sources through
 * DataModel migration, so absent fields must never be filled here.
 */
export function migratePCHealthSource(source) {
    const health = source?.health;
    if (!health) return source;

    const damage = health.damage;
    const levels = ["bruised", "hurt", "injured", "wounded", "mauled", "crippled", "incapacitated"];
    const hasLegacyDamage = damage && ["bashing", "lethal", "aggravated"].some(type => damage[type] !== undefined);
    const hasLegacyLevels = levels.some(level => health[level] !== undefined);

    if (hasLegacyDamage || hasLegacyLevels) {
        const migratedHealth = migrateLegacyHealth(source);
        if (!Array.isArray(health.wounds)) health.wounds = migratedHealth.wounds;
        if (health.bonus === undefined) health.bonus = migratedHealth.bonus;

        if (damage?.chimerical === undefined) {
            damage.chimerical = {bashing: 0, lethal: 0, aggravated: 0};
        }
    }

    if (damage) {
        delete damage.bashing;
        delete damage.lethal;
        delete damage.aggravated;
    }
    for (const level of levels) delete health[level];

    return source;
}

export function getActiveHealthBonus(actor) {
    let bonus = 0;
    for (const item of actor?.items ?? []) {
        if (item?.type === "Bonus" && item.system?.isactive && item.system?.type === "health_buff") {
            bonus += integer(item.system.value);
        }
        for (const embedded of Array.isArray(item?.system?.bonuslist) ? item.system.bonuslist : []) {
            if (embedded?.isactive && embedded.type === "health_buff") bonus += integer(embedded.value);
        }
    }
    return bonus;
}

export function getHealthState(actor, {wounds, itemBonus} = {}) {
    const manualBonus = Math.max(0, integer(actor?.system?.health?.bonus));
    const activeBonus = itemBonus === undefined ? getActiveHealthBonus(actor) : integer(itemBonus);
    const strength = integer(actor?.system?.attributes?.strength?.value);
    const stamina = integer(actor?.system?.attributes?.stamina?.value);
    const max = calculateMaxHealth(strength, stamina, manualBonus + activeBonus);
    const allWounds = normalizeWounds(wounds ?? actor?.system?.health?.wounds);
    const trackWounds = allWounds.slice(0, max);
    const overflow = allWounds.slice(max);
    const boxes = [];
    let offset = 0;

    const levels = distributeHealthLevels(max).map(level => {
        const levelBoxes = [];
        for (let localIndex = 0; localIndex < level.count; localIndex++) {
            const index = offset + localIndex;
            const severity = trackWounds[index] ?? null;
            const legacyMarker = severity === "heavy" ? "x" : severity === "aggravated" ? "*" : severity ? "/" : "";
            const displayState = severity === "heavy" ? "x" : severity === "aggravated" ? "*" : severity ? "/" : "";
            const box = {index, severity, marker: severity ? WOUND_MARKERS[severity] : "", displayState, legacyMarker};
            boxes.push(box);
            levelBoxes.push(box);
        }
        offset += level.count;
        return {...level, boxes: levelBoxes};
    });

    let activeLevel = null;
    for (let index = trackWounds.length - 1; index >= 0; index--) {
        if (trackWounds[index] === "heavy" || trackWounds[index] === "aggravated") {
            activeLevel = levels.find(level => level.boxes.some(box => box.index === index)) ?? null;
            break;
        }
    }

    return {
        strength,
        stamina,
        manualBonus,
        itemBonus: activeBonus,
        totalBonus: manualBonus + activeBonus,
        max,
        current: Math.max(0, max - trackWounds.length),
        wounds: allWounds,
        trackWounds,
        overflow,
        boxes,
        levels,
        woundlevel: activeLevel?.label ?? "",
        woundpenalty: activeLevel?.penalty ?? 0
    };
}

/** Preserve the existing PC rule that the worse normal/chimerical track drives shared penalties. */
export function getActorHealthState(actor) {
    const normal = getHealthState(actor);
    if (!actor?.system?.settings?.usechimerical) return normal;

    const chimerical = getHealthState(actor, {
        wounds: legacyDamageToWounds(actor.system.health?.damage?.chimerical)
    });
    const chimericalIsWorse = chimerical.woundpenalty < normal.woundpenalty;

    return {
        ...normal,
        current: Math.min(normal.current, chimerical.current),
        woundlevel: chimericalIsWorse ? chimerical.woundlevel : normal.woundlevel,
        woundpenalty: chimericalIsWorse ? chimerical.woundpenalty : normal.woundpenalty
    };
}

/** Existing sheet entry point. PC tracks use the new state; legacy tracks keep their representation. */
export async function calculateHealth(actor, type) {
    if (actor?.type === "PC") {
        if (type === CONFIG.worldofdarkness.sheettype.changeling) {
            return getHealthState(actor, {wounds: legacyDamageToWounds(actor.system.health.damage.chimerical)});
        }
        return getHealthState(actor);
    }
    return calculateLegacyHealth(actor, type);
}

function applyOneWound(track, severity, maxHealth) {
    if (maxHealth <= 0) return severity;

    if (track.length < maxHealth) {
        track.push(severity);
        return null;
    }

    let index = track.findIndex(existing => SEVERITY_RANK[existing] < SEVERITY_RANK[severity]);
    if (index < 0) index = track.findIndex(existing => existing === severity);
    if (index < 0) return severity;

    let carry = severity;
    while (carry && index < maxHealth) {
        const existing = track[index];
        const carryRank = SEVERITY_RANK[carry];
        const existingRank = SEVERITY_RANK[existing];

        if (carryRank > existingRank) {
            track[index] = carry;
            carry = existing;
            index++;
            continue;
        }

        if (carryRank === existingRank) {
            if (carry === "aggravated") {
                index++;
                continue;
            }
            track[index] = carry === "light" ? "heavy" : "aggravated";
            carry = null;
            break;
        }

        index++;
    }

    return carry;
}

function repeat(value, amount) {
    return Array.from({length: Math.max(0, integer(amount))}, () => value);
}

function integer(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function calculateLegacyHealth(actor, type) {
    let damage;
    if (type === CONFIG.worldofdarkness.sheettype.changeling) damage = actor.system.health.damage.chimerical;
    else if (type === CONFIG.worldofdarkness.sheettype.wraith) damage = actor.system.health.damage.corpus;
    else damage = actor.system.health.damage;

    let bashing = integer(damage?.bashing);
    let lethal = integer(damage?.lethal);
    let aggravated = integer(damage?.aggravated);
    const healthLevels = [];

    if (type === CONFIG.worldofdarkness.sheettype.wraith) {
        for (let index = 0; index < integer(actor.system.advantages.corpus.permanent); index++) {
            healthLevels.push({label: "", status: nextLegacyMarker()});
        }
        healthLevels.woundPenalty = 0;
        return healthLevels;
    }

    let woundPenalty = 0;
    for (const id of Object.keys(CONFIG.worldofdarkness.woundLevels)) {
        const level = actor.system.health[id];
        for (let index = 0; index < integer(level?.total); index++) {
            const status = nextLegacyMarker();
            if (status) woundPenalty = integer(level.penalty);
            healthLevels.push({label: level.label, status});
        }
    }

    healthLevels.woundPenalty = woundPenalty;
    return healthLevels;

    function nextLegacyMarker() {
        if (aggravated > 0) {
            aggravated--;
            return "*";
        }
        if (lethal > 0) {
            lethal--;
            return "x";
        }
        if (bashing > 0) {
            bashing--;
            return "/";
        }
        return "";
    }
}

export function mapLegacyDamageType(damageType) {
    return LEGACY_DAMAGE_SEVERITY[damageType] ?? damageType;
}
