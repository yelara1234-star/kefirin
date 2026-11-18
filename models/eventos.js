const mongoose = require("mongoose");

let eventos_table = new mongoose.Schema({
    ID_EVENTO : {
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
    tipo_evento : {
    type: String,
    required: true
    },
    detalle : {
    type: String,
    required: false
    }
});
 
module.exports = mongoose.model("Eventos", eventos_table);
