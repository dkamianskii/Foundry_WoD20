import { distributeHealthLevels } from "./health.js";

function toNonNegativeInteger(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function getSystemData(actorOrSystem) {
    return actorOrSystem?.system ?? actorOrSystem ?? {};
}

/**
 * Normalize only Willpower fields that are actually present in a source payload.
 * DataModel migration also receives partial Actor updates, so omitted fields must
 * never be synthesized here or an unrelated update can overwrite stored wounds.
 */
export function migratePCWillpowerSource(source) {
    const willpower = source?.willpower;
    if (!willpower) return source;

    if (Object.hasOwn(willpower, "bonus")) {
        willpower.bonus = toNonNegativeInteger(willpower.bonus);
    }

    const damage = willpower.damage;
    if (!damage) return source;

    for (const severity of ["light", "heavy", "aggravated"]) {
        if (Object.hasOwn(damage, severity)) {
            damage[severity] = toNonNegativeInteger(damage[severity]);
        }
    }

    return source;
}

export function getWillpowerState(actorOrSystem) {
    const system = getSystemData(actorOrSystem);
    const manualBonus = toNonNegativeInteger(system.willpower?.bonus);
    const maximum = 2
        + toNonNegativeInteger(system.attributes?.composure?.value)
        + toNonNegativeInteger(system.attributes?.resolve?.value)
        + manualBonus;

    let aggravated = Math.min(toNonNegativeInteger(system.willpower?.damage?.aggravated), maximum);
    let heavy = Math.min(toNonNegativeInteger(system.willpower?.damage?.heavy), maximum - aggravated);
    let light = Math.min(toNonNegativeInteger(system.willpower?.damage?.light), maximum - aggravated - heavy);
    const current = maximum - light - heavy - aggravated;
    const full = maximum - aggravated;
    const wounds = [
        ...Array.from({length: aggravated}, () => "aggravated"),
        ...Array.from({length: heavy}, () => "heavy"),
        ...Array.from({length: light}, () => "light")
    ];
    let offset = 0;
    const levels = distributeHealthLevels(maximum).map(level => {
        const boxes = Array.from({length: level.count}, (_, localIndex) => {
            const index = offset + localIndex;
            const severity = wounds[index] ?? null;
            const displayState = severity === "aggravated" ? "*" : severity === "heavy" ? "x" : severity ? "/" : "";
            return {index, severity, displayState};
        });
        offset += level.count;
        return {...level, boxes};
    });

    const heavyLevel = findActiveLevel(levels, wounds, severity => severity === "heavy");
    const aggravatedLevel = findActiveLevel(levels, wounds, severity => severity === "aggravated");
    const activeLevel = findActiveLevel(levels, wounds, severity => severity === "heavy" || severity === "aggravated");

    return {
        maximum,
        manualBonus,
        current,
        full,
        light,
        heavy,
        aggravated,
        canSpend: current > 0,
        woundlevel: activeLevel?.label ?? "",
        woundpenalty: activeLevel?.penalty ?? 0,
        heavyWoundLevel: heavyLevel?.label ?? "",
        heavyWoundPenalty: heavyLevel?.penalty ?? 0,
        aggravatedWoundLevel: aggravatedLevel?.label ?? "",
        aggravatedWoundPenalty: aggravatedLevel?.penalty ?? 0,
        levels,
        track: levels.flatMap(level => level.boxes.map(box => box.displayState))
    };
}

function findActiveLevel(levels, wounds, matchesSeverity) {
    for (let index = wounds.length - 1; index >= 0; index--) {
        if (matchesSeverity(wounds[index])) {
            return levels.find(level => level.boxes.some(box => box.index === index)) ?? null;
        }
    }
    return null;
}

export function getWillpowerUpdate(actorOrSystem, oldState, clear = false) {
    const state = getWillpowerState(actorOrSystem);
    let {light, heavy, aggravated} = state;

    if (clear) {
        if ((oldState === "light" || oldState === "/") && light > 0) light -= 1;
        else if ((oldState === "heavy" || oldState === "x") && heavy > 0) heavy -= 1;
        else if ((oldState === "aggravated" || oldState === "*") && aggravated > 0) aggravated -= 1;
        else return null;
    }
    else if (oldState === "") {
        if (state.current > 0) light += 1;
        else return null;
    }
    else if ((oldState === "light" || oldState === "/") && light > 0) {
        light -= 1;
        heavy += 1;
    }
    else if ((oldState === "heavy" || oldState === "x") && heavy > 0) {
        heavy -= 1;
        aggravated += 1;
    }
    else if ((oldState === "aggravated" || oldState === "*") && aggravated > 0) {
        aggravated -= 1;
    }
    else {
        return null;
    }

    return {
        "system.willpower.damage.light": light,
        "system.willpower.damage.heavy": heavy,
        "system.willpower.damage.aggravated": aggravated
    };
}

export async function spendWillpower(actor) {
    if (!actor || actor.type !== "PC") return false;

    if (!getWillpowerState(actor).canSpend) return false;

    const update = getWillpowerUpdate(actor, "");
    if (!update) return false;

    await actor.update(update);
    return true;
}

export function createWillpowerAdvantageFacade(actor) {
    const state = getWillpowerState(actor);

    return {
        _id: "willpower",
        id: "willpower",
        name: game.i18n.localize("wod.advantages.willpower"),
        type: "Advantage",
        label: "wod.advantages.willpower",
        permanent: state.maximum,
        temporary: state.current,
        roll: state.current,
        max: state.maximum,
        system: {
            id: "willpower",
            slug: "willpower",
            label: "wod.advantages.willpower",
            group: "",
            permanent: state.maximum,
            temporary: state.current,
            roll: state.current,
            max: state.maximum,
            settings: {
                isvisible: true,
                useroll: true,
                usepermanent: false,
                usetemporary: true,
                usebothrolls: false,
                highertemporary: false
            }
        }
    };
}
