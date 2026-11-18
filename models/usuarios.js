const mongoose = require('mongoose');
 
let usuarios_table = new mongoose.Schema({
    NU : {
    type: String,
    required: true,
    unique: true
    },
    nombre : {
    type: String,
    required: true,
    },
    apellido : {
    type: String,
    required: true
    },
    correo : {
    type: String,
    required: true,
    unique: true 
    },
    clave : {
    type: String,
    required: true
    },
    telefono : {
    type: Number,
    required: true
    },
    fecha_ingreso : {
    type: Date,
    required: false
    },
    rol : {
    type: String,
    required: true
    },
    estado : {
    type: String,
    required: true
    },
    acepto_terminos :  {
    type: String,
    required: true
    },
    fecha_aceptacion_terminos : {
    type: Date,
    required: false
    }
});
 
module.exports = mongoose.model("Usuarios", usuarios_table);