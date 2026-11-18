const mongoose = require("mongoose");

let roles_table = new mongoose.Schema({
    ID_ROL : {
    type: String,
    required: true,
    unique: true
    },
    nombre : {
    type: String,
    required: true,
    unique: true
    },
    descripcion : {
    type: String,
    required: false
    }
});

module.exports = mongoose.model("Roles", roles_table);