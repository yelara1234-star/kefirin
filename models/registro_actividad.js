const mongoose = require("mongoose");

let registro_actividad_table = new mongoose.Schema({
    ID_ACTIVIDAD : {
    type: Number,
    required: true,
    unique: true
    },
    NU : {
    type: String,
    required: true
    },
    ID_INC : {
    type: String,
    required: false
    },
    fecha_hora : {
    type: Date,
    required: true
    },
    accion : {
    type: String,
    required: true
    },
    valor_anterior : {
    type: String,
    required: false
    },
    valor_nuevo : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Registro_actividad", registro_actividad_table);
