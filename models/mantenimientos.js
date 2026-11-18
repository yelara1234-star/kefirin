const mongoose = require("mongoose");

let mantenimientos_table = new mongoose.Schema({
    ID_MANT : {
    type: Number,
    required: true,
    unique: true
    },
    ID_INC : {
    type: String,
    required: true
    },
    NU_tecnico : {
    type: String,
    required: true
    },
    fecha : {
    type: Date,
    required: true
    },
    tipo : {
    type: String,
    required: true
    },
    falla_reportada : {
    type: String,
    required: false
    },
    solucionado : {
    type: Boolean,
    required: true
    },
    motivo_no_solucionado : {
    type: String,
    required: false
    },
    fecha_cierre : {
    type: Date,
    required: false
    },
    observaciones : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Mantenimientos", mantenimientos_table);
