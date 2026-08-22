/**
 * Wound penalties apply only when at least one selected pool component is an
 * Actor Attribute. Container fields may also contain Ability or Advantage keys.
 */
export function rollUsesAttribute(diceRoll) {
    const attributes = diceRoll?.actor?.system?.attributes;
    if (!attributes) return false;

    return [diceRoll.attribute, diceRoll.ability]
        .some(key => typeof key === "string" && Object.hasOwn(attributes, key));
}
