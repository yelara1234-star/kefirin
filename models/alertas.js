const mongoose = require("mongoose");

let alertas_table = new mongoose.Schema({
    ID_ALERTA : {
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
    codigo : {
    type: String,
    required: true
    },
    severidad : {
    type: String,
    required: true
    },
    estado : {
    type: String,
    required: true
    },
    fecha_cierre : {
    type: Date,
    required: false
    },
    cerrada_por : {
     type: String,
     required: false
     }
});


module.exports = mongoose.model("Alertas", alertas_table);
