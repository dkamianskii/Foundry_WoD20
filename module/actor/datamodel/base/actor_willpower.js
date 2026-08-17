export default class willpower extends foundry.abstract.DataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        const woundValue = {required: true, nullable: false, integer: true, initial: 0, min: 0};

        return {
            damage: new fields.SchemaField({
                light: new fields.NumberField({...woundValue}),
                heavy: new fields.NumberField({...woundValue})
            })
        };
    }
}
