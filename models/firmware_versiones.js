const mongoose = require("mongoose");

let firmware_versiones_table = new mongoose.Schema({
    ID_FIRMWARE : {
    type: String,
    required: true,
    unique: true
    },
    version : {
    type: String,
    required: true
    },
    fecha_publicacion : {
    type: Date,
    required: true
    },
    notas : {
    type: String,
    required: false
    },
    obligatoria : {
    type: Boolean,
    required: true
    }
});

module.exports = mongoose.model("Firmware_versiones", firmware_versiones_table);
 