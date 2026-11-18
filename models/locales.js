const mongoose = require("mongoose");

let locales_table = new mongoose.Schema({
    ID_LOCAL : {
    type: String,
    required: true,
    unique: true
    },
    ID_DUEÑO : {
    type: String,
    required: true
    },
    nombre : {
    type: String,
    required: true
    },
    ubicacion_manual : {
    type: String,
    required: true
    },
    ciudad : {
    type: String,
    required: false
    },
    pais : {
    type: String,
    required: false
    },
    zona_horaria : {
    type: String,
    required: true
    }
});
 
module.exports = mongoose.model("Locales", locales_table);
