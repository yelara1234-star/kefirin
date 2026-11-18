const mongoose = require("mongoose");

let registro_accesos_table = new mongoose.Schema({
    ID_ACCESO : {
    type: Number,
    required: true,
    unique: true
    },
    NU : {
    type: String,
    required: false
    },
    correo_intentado : {
    type: String,
    required: true
    },
    fecha_hora : {
    type: Date,
    required: true
    },
    resultado : {
    type: String,
    required: true
    },
    motivo_fallo : {
    type: String,
    required: false
    },
    direccion_ip : {
    type: String,
    required: true
    },
    ubicacion_aprox : {
    type: String,
    required: false
    },
    origen : {
    type: String,
    required: true
    },
    dispositivo : {
    type: String,
    required: false
    },
    navegador_o_app : {
    type: String,
    required: false
    },
    ID_SESION : {
    type: String,
    required: true
    },
    fecha_cierre : {
    type: Date,
    required: false
    },
    tipo_cierre : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Registro_accesos", registro_accesos_table);
