/** Legacy configurable health-level schema retained for Splat documents. */
export default class splatHealth extends foundry.abstract.DataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        const valueString = {required: true, nullable: false, initial: ""};
        const positiveInteger = {required: true, nullable: false, integer: true, initial: 0, min: 0};
        const healthValue = {required: true, nullable: false, integer: true, initial: 1, min: 0};
        const bonusInteger = {required: true, nullable: false, integer: true, initial: 0};

        return {
            damage: new fields.SchemaField({
                bashing: new fields.NumberField({...positiveInteger}),
                lethal: new fields.NumberField({...positiveInteger}),
                aggravated: new fields.NumberField({...positiveInteger}),
                woundlevel: new fields.StringField({...valueString}),
                woundpenalty: new fields.NumberField({...bonusInteger}),
                chimerical: new fields.SchemaField({
                    bashing: new fields.NumberField({...positiveInteger}),
                    lethal: new fields.NumberField({...positiveInteger}),
                    aggravated: new fields.NumberField({...positiveInteger})
                })
            }),
            bruised: level(fields, healthValue, 0, "wod.health.bruised"),
            hurt: level(fields, healthValue, -1, "wod.health.hurt"),
            injured: level(fields, healthValue, -1, "wod.health.injured"),
            wounded: level(fields, healthValue, -2, "wod.health.wounded"),
            mauled: level(fields, healthValue, -2, "wod.health.mauled"),
            crippled: level(fields, healthValue, -5, "wod.health.crippled"),
            incapacitated: level(fields, healthValue, -99, "wod.health.incapacitated")
        };
    }
}

function level(fields, healthValue, penalty, label) {
    return new fields.SchemaField({
        value: new fields.NumberField({...healthValue}),
        total: new fields.NumberField({...healthValue}),
        penalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: penalty}),
        label: new fields.StringField({required: true, nullable: false, initial: label})
    });
}
