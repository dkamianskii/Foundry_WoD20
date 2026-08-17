function toNonNegativeInteger(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function getSystemData(actorOrSystem) {
    return actorOrSystem?.system ?? actorOrSystem ?? {};
}

export function getWillpowerState(actorOrSystem) {
    const system = getSystemData(actorOrSystem);
    const maximum = toNonNegativeInteger(system.attributes?.composure?.value)
        + toNonNegativeInteger(system.attributes?.resolve?.value);

    let heavy = Math.min(toNonNegativeInteger(system.willpower?.damage?.heavy), maximum);
    let light = Math.min(toNonNegativeInteger(system.willpower?.damage?.light), maximum - heavy);
    const current = maximum - light - heavy;
    const full = maximum - heavy;

    return {
        maximum,
        current,
        full,
        light,
        heavy,
        exhausted: maximum > 0 && current === 0,
        track: [
            ...Array.from({length: heavy}, () => "x"),
            ...Array.from({length: light}, () => "/"),
            ...Array.from({length: current}, () => "")
        ]
    };
}

export function getWillpowerUpdate(actorOrSystem, oldState, clear = false) {
    const state = getWillpowerState(actorOrSystem);
    let {light, heavy} = state;

    if (clear) {
        if (oldState === "/" && light > 0) light -= 1;
        else if (oldState === "x" && heavy > 0) heavy -= 1;
        else return null;
    }
    else if (oldState === "") {
        if (state.current > 0) light += 1;
        else if (light > 0) {
            light -= 1;
            heavy += 1;
        }
        else return null;
    }
    else if (oldState === "/" && light > 0) {
        light -= 1;
        heavy += 1;
    }
    else if (oldState === "x" && heavy > 0) {
        heavy -= 1;
    }
    else {
        return null;
    }

    return {
        "system.willpower.damage.light": light,
        "system.willpower.damage.heavy": heavy
    };
}

export async function spendWillpower(actor) {
    if (!actor || actor.type !== "PC") return false;

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
