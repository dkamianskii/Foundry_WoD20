export default class health extends foundry.abstract.DataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        const nonNegativeInteger = {required: true, nullable: false, integer: true, initial: 0, min: 0};

        return {
            bonus: new fields.NumberField({...nonNegativeInteger}),
            wounds: new fields.ArrayField(
                new fields.StringField({
                    required: true,
                    nullable: false,
                    choices: ["light", "heavy", "aggravated"]
                })
            ),
            damage: new fields.SchemaField({
                woundlevel: new fields.StringField({required: true, nullable: false, initial: ""}),
                woundpenalty: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
                chimerical: new fields.SchemaField({
                    bashing: new fields.NumberField({...nonNegativeInteger}),
                    lethal: new fields.NumberField({...nonNegativeInteger}),
                    aggravated: new fields.NumberField({...nonNegativeInteger})
                })
            })
        };
    }
}
