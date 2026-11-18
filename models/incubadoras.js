const mongoose = require("mongoose");

let incubadoras_table = new mongoose.Schema({
    ID_INC : {
    type: String,
    required: true,
    unique: true
    },
    ID_LOCAL : {
    type: String,
    required: false
    },
    ID_MODELO : {
    type: String,
    required: true
    },
    numero_serie : {
    type: String,
    required: true,
    unique: true
    },
    fecha_instalacion : {
    type: Date,
    required: false
    },
    ID_FIRMWARE : {
    type: String,
    required: true
    },
    estado : {
    type: String,
    required: true
    },
    ultima_conexion : {
    type: Date,
    required: false
    }
});
 
module.exports = mongoose.model("Incubadoras", incubadoras_table);
 