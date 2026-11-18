const mongoose = require("mongoose");

let configuracion_incubadora_table = new mongoose.Schema({
    ID_INC : {
    type: String,
    required: true,
    unique: true
    },
    temperatura_objetivo : {
    type: Number,
    required: true
    },
    intervalo_agitacion : {
    type: Number,
    required: false
    },
    intervalo_reporte : {
    type: Number,
    required: true
    },
    fecha_modificacion : {
    type: Date,
    required: true
    },
    modificado_por : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Configuracion_incubadora", configuracion_incubadora_table);
