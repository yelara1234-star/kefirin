const mongoose = require("mongoose");

let telemetria_table = new mongoose.Schema({
    ID_LECTURA : {
    type: Number,
    required: true,
    unique: true
    },
    ID_INC : {
    type: String,
    required: true
    },
    fecha_hora : {
    type: Date,
    required: true
    },
    temp_caliente : {
    type: Number,
    required: false
    },
    temp_fria : {
    type: Number,
    required: false
    },
    peso : {
    type: Number,
    required: false
    },
    voltaje_bateria : {
    type: Number,
    required: false
    },
    estado_calefaccion : {
    type: Boolean,
    required: false
    },
    estado_peltier : {
    type: Boolean,
    required: false
    },
    estado_ventilador_caliente : {
    type: Boolean,
    required: false
    },
    estado_ventilador_frio : {
    type: Boolean,
    required: false
    }
});
 
module.exports = mongoose.model("Telemetria", telemetria_table);
