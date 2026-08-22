export default class willpower extends foundry.abstract.DataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        const woundValue = {required: true, nullable: false, integer: true, initial: 0, min: 0};

        return {
            bonus: new fields.NumberField({...woundValue}),
            damage: new fields.SchemaField({
                light: new fields.NumberField({...woundValue}),
                heavy: new fields.NumberField({...woundValue}),
                aggravated: new fields.NumberField({...woundValue})
            })
        };
    }
}
