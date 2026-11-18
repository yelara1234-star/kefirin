const mongoose = require("mongoose");

let modelos_incubadora_table = new mongoose.Schema({
    ID_MODELO : {
    type: String,
    required: true,
    unique: true
    },
    nombre : {
    type: String,
    required: true
    },
    version_hardware : {
    type: String,
    required: true
    },
    capacidad : {
    type: Number,
    required: false
    },
    descripcion : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Modelos_incubadora", modelos_incubadora_table);
 