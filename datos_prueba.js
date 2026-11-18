// =====================================================================
//  DATOS DE PRUEBA PARA LOS HISTÓRICOS
//
//  Llena 7 días de telemetría (una lectura cada 10 minutos), alertas,
//  eventos y mantenimientos para UNA incubadora.
//
//  Uso (desde la carpeta del backend):
//     node datos_prueba.js <ID_INC> [NU_tecnico] [--limpiar]
//
//  Ejemplos:
//     node datos_prueba.js INC001
//     node datos_prueba.js INC001 YELCXD12345WASD
//     node datos_prueba.js INC001 YELCXD12345WASD --limpiar
//
//  --limpiar borra antes los históricos que ya tenga ESA incubadora
//  (solo esa), para no duplicar datos si lo corres varias veces.
// =====================================================================

const mongoose = require('mongoose');

// Pega aquí la MISMA cadena de conexión que usas en index.js
const connectionString = "mongodb+srv://yeisonlara01_db_user:AvMEWsPjR9U6Qk9r@cluster0.ofqarxb.mongodb.net/?appName=Cluster0/KEFIRIN";

const IncubadoraModel = require('./models/incubadoras');
const TelemetriaModel = require('./models/telemetria');
const AlertaModel = require('./models/alertas');
const EventoModel = require('./models/eventos');
const MantenimientoModel = require('./models/mantenimientos');


const args = process.argv.slice(2);
const ID_INC = args.find(a => !a.startsWith('--'));
const NU_TECNICO = args.filter(a => !a.startsWith('--'))[1] || "TECNICO_PRUEBA";
const LIMPIAR = args.includes('--limpiar');

if(!ID_INC){
    console.log("Falta el ID de la incubadora. Uso: node datos_prueba.js <ID_INC> [NU_tecnico] [--limpiar]");
    process.exit(1);
}


// Número aleatorio entre min y max
const azar = (min, max) => min + Math.random() * (max - min);

// Redondear a n decimales
const redondear = (valor, n) => Math.round(valor * 10 ** n) / 10 ** n;


async function main(){
    await mongoose.connect(connectionString);
    console.log("Conectado a la base de datos");

    let incubadora = await IncubadoraModel.findOne({ "ID_INC" : ID_INC });
    if(!incubadora){
        console.log("No existe una incubadora con ID_INC = " + ID_INC);
        process.exit(1);
    }

    if(LIMPIAR){
        await TelemetriaModel.deleteMany({ "ID_INC" : ID_INC });
        await AlertaModel.deleteMany({ "ID_INC" : ID_INC });
        await EventoModel.deleteMany({ "ID_INC" : ID_INC });
        await MantenimientoModel.deleteMany({ "ID_INC" : ID_INC });
        console.log("Históricos anteriores de " + ID_INC + " borrados");
    }

    // IDs numéricos únicos a partir de la hora actual
    let base = Date.now() * 1000;
    let siguienteId = () => base++;

    const DIAS = 7;
    const PASO_MIN = 10;
    const ahora = new Date();
    const inicio = new Date(ahora.getTime() - DIAS * 24 * 60 * 60 * 1000);

    // ---------- TELEMETRÍA ----------
    let lecturas = [];
    let tempCaliente = 25;
    let tempFria = 6;
    let peso = 1050;
    let bateria = 12.6;

    for(let t = inicio.getTime(); t <= ahora.getTime(); t += PASO_MIN * 60 * 1000){
        let fecha = new Date(t);
        let hora = fecha.getHours() + fecha.getMinutes() / 60;

        // Ambiente: más frío de madrugada, más caliente en la tarde
        let ambiente = 20 + 4 * Math.sin((hora - 9) / 24 * 2 * Math.PI);

        // Lado caliente: la calefacción prende si baja de 24.5 °C
        let calefaccion = tempCaliente < 24.5;
        tempCaliente += (calefaccion ? 0.35 : -0.12) + (ambiente - 22) * 0.01 + azar(-0.05, 0.05);

        // Lado frío: el peltier prende si sube de 6.5 °C
        let peltier = tempFria > 6.5;
        tempFria += (peltier ? -0.3 : 0.1) + (ambiente - 22) * 0.008 + azar(-0.04, 0.04);

        // Peso: baja lento por la fermentación y se recarga cada 2 días
        peso -= azar(0.1, 0.4);
        if(fecha.getHours() == 8 && fecha.getMinutes() < PASO_MIN && fecha.getDate() % 2 == 0){
            peso = 1050 + azar(-10, 10);
        }

        // Batería: se descarga y se recarga de noche
        if(hora >= 0 && hora < 5){
            bateria = Math.min(12.7, bateria + 0.02);
        }else{
            bateria = Math.max(11.6, bateria - 0.004);
        }

        lecturas.push({
            ID_LECTURA : siguienteId(),
            ID_INC : ID_INC,
            fecha_hora : fecha,
            temp_caliente : redondear(tempCaliente, 2),
            temp_fria : redondear(tempFria, 2),
            peso : redondear(peso, 1),
            voltaje_bateria : redondear(bateria, 2),
            estado_calefaccion : calefaccion,
            estado_peltier : peltier,
            estado_ventilador_caliente : calefaccion,
            estado_ventilador_frio : peltier
        });
    }

    await TelemetriaModel.insertMany(lecturas);
    console.log("Telemetría: " + lecturas.length + " lecturas");

    // Fecha dentro del rango (dias_atras puede tener decimales)
    let haceDias = (dias_atras) => new Date(ahora.getTime() - dias_atras * 24 * 60 * 60 * 1000);

    // ---------- ALERTAS ----------
    let alertas = [
        { dias : 6.2, codigo : "TEMP_ALTA",       severidad : "alta",  estado : "cerrada", cierre : 6.1 },
        { dias : 4.8, codigo : "BATERIA_BAJA",    severidad : "media", estado : "cerrada", cierre : 4.5 },
        { dias : 3.1, codigo : "PUERTA_ABIERTA",  severidad : "baja",  estado : "cerrada", cierre : 3.09 },
        { dias : 1.4, codigo : "SENSOR_PESO",     severidad : "media", estado : "abierta" },
        { dias : 0.3, codigo : "TEMP_BAJA",       severidad : "alta",  estado : "abierta" }
    ].map(a => ({
        ID_ALERTA : siguienteId(),
        ID_INC : ID_INC,
        fecha_hora : haceDias(a.dias),
        codigo : a.codigo,
        severidad : a.severidad,
        estado : a.estado,
        fecha_cierre : a.cierre ? haceDias(a.cierre) : undefined
    }));

    await AlertaModel.insertMany(alertas);
    console.log("Alertas: " + alertas.length);

    // ---------- EVENTOS ----------
    let eventos = [
        { dias : 6.9, tipo : "encendido",            detalle : "La incubadora se encendió" },
        { dias : 6.8, tipo : "inicio_fermentacion",  detalle : "Lote 1 — 1 L de leche entera" },
        { dias : 5.8, tipo : "fin_fermentacion",     detalle : "Lote 1 terminado" },
        { dias : 4.9, tipo : "puerta_abierta",       detalle : "Puerta abierta 2 minutos" },
        { dias : 4.8, tipo : "inicio_fermentacion",  detalle : "Lote 2 — 1 L de leche deslactosada" },
        { dias : 3.8, tipo : "fin_fermentacion",     detalle : "Lote 2 terminado" },
        { dias : 3.1, tipo : "puerta_abierta",       detalle : "Puerta abierta 6 minutos" },
        { dias : 2.0, tipo : "actualizacion",        detalle : "Configuración de temperatura cambiada a 25 °C" },
        { dias : 0.9, tipo : "inicio_fermentacion",  detalle : "Lote 3 — 1 L de leche entera" }
    ].map(e => ({
        ID_EVENTO : siguienteId(),
        ID_INC : ID_INC,
        fecha_hora : haceDias(e.dias),
        tipo_evento : e.tipo,
        detalle : e.detalle
    }));

    await EventoModel.insertMany(eventos);
    console.log("Eventos: " + eventos.length);

    // ---------- MANTENIMIENTOS ----------
    let mantenimientos = [
        {
            ID_MANT : siguienteId(),
            ID_INC : ID_INC,
            NU_tecnico : NU_TECNICO,
            fecha : haceDias(5.5),
            tipo : "preventivo",
            falla_reportada : "",
            solucionado : true,
            fecha_cierre : haceDias(5.4),
            observaciones : "Limpieza de ventiladores y revisión de sensores"
        },
        {
            ID_MANT : siguienteId(),
            ID_INC : ID_INC,
            NU_tecnico : NU_TECNICO,
            fecha : haceDias(1.2),
            tipo : "correctivo",
            falla_reportada : "Lectura de peso inestable",
            solucionado : false,
            motivo_no_solucionado : "Falta repuesto de la celda de carga",
            observaciones : "Se pidió el repuesto"
        }
    ];

    await MantenimientoModel.insertMany(mantenimientos);
    console.log("Mantenimientos: " + mantenimientos.length);

    // Última conexión = última lectura
    await IncubadoraModel.updateOne({ "ID_INC" : ID_INC }, { "ultima_conexion" : lecturas[lecturas.length - 1].fecha_hora });

    console.log("Listo");
    await mongoose.disconnect();
}

main().catch(error => {
    console.log("Error: " + error);
    process.exit(1);
});