// =====================================================================
//  DATOS DE DEMO PARA UNA INCUBADORA QUE YA EXISTE
//
//  No crea usuarios, locales ni incubadoras: solo llena el historial
//  de una incubadora que ya tiene dueño. Es un escenario distinto al
//  de datos_prueba.js:
//
//   - 14 días de telemetría (una lectura cada 15 minutos)
//   - Hace ~9 días falla la calefacción y el técnico la arregla
//   - Varias aperturas de puerta
//   - La batería carga cada noche un poco menos
//   - En las últimas horas la calefacción vuelve a quedarse corta
//   - Alertas (6 cerradas por el técnico, 2 abiertas), eventos y
//     mantenimientos (uno resuelto y uno pendiente)
//
//  Uso (desde la carpeta del backend):
//     node datos_demo_cliente.js <ID_INC o número de serie> [--limpiar]
//
//  Ejemplos:
//     node datos_demo_cliente.js INC1794172832065476
//     node datos_demo_cliente.js KF-M01-F10-2611-7Q4X
//     node datos_demo_cliente.js KF-M01-F10-2611-7Q4X --limpiar
//
//  --limpiar borra antes el historial que ya tenga ESA incubadora
//  (solo esa), para no duplicar datos si lo corres varias veces.
// =====================================================================

const mongoose = require('mongoose');

// Pega aquí la MISMA cadena de conexión que usas en index.js
const connectionString = "mongodb+srv://yeisonlara01_db_user:AvMEWsPjR9U6Qk9r@cluster0.ofqarxb.mongodb.net/?appName=Cluster0/KEFIRIN";

const UsuarioModel = require('./models/usuarios');
const LocalModel = require('./models/locales');
const IncubadoraModel = require('./models/incubadoras');
const TelemetriaModel = require('./models/telemetria');
const AlertaModel = require('./models/alertas');
const EventoModel = require('./models/eventos');
const MantenimientoModel = require('./models/mantenimientos');


const args = process.argv.slice(2);
const BUSCAR = args.find(a => !a.startsWith('--'));
const LIMPIAR = args.includes('--limpiar');

if(!BUSCAR){
    console.log("Falta la incubadora. Uso: node datos_demo_cliente.js <ID_INC o número de serie> [--limpiar]");
    process.exit(1);
}

const DIAS = 14;
const PASO_MIN = 15;


// ---------- Utilidades ----------
const azar = (min, max) => min + Math.random() * (max - min);
const redondear = (valor, n) => Math.round(valor * 10 ** n) / 10 ** n;

let base = Date.now() * 1000;
const siguienteId = () => base++;

const ahora = new Date();
const haceDias = (dias) => new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);

// Está "t" entre hace "desde" días y hace "hasta" días
const entre = (t, desde, hasta) => t >= haceDias(desde).getTime() && t <= haceDias(hasta).getTime();


async function main(){
    await mongoose.connect(connectionString);
    console.log("Conectado a la base de datos");

    // ---------- 1. La incubadora (por ID_INC o por serial) ----------
    let incubadora = await IncubadoraModel.findOne({ "ID_INC" : BUSCAR })
        || await IncubadoraModel.findOne({ "numero_serie" : BUSCAR.toUpperCase() });

    if(!incubadora){
        console.log("No existe una incubadora con ID_INC o serial = " + BUSCAR);
        process.exit(1);
    }

    const ID_INC = incubadora.ID_INC;

    // Dueño, solo para mostrarlo al final
    let local = incubadora.ID_LOCAL ? await LocalModel.findOne({ "ID_LOCAL" : incubadora.ID_LOCAL }) : null;
    let dueno = local ? await UsuarioModel.findOne({ "NU" : local["ID_DUEÑO"] }) : null;

    if(!local){
        console.log("Aviso: esta incubadora no tiene local (nadie la ha reclamado), así que ningún cliente la va a ver.");
    }

    // ---------- 2. Técnico (el primero con rol R04, si no el admin) ----------
    let tecnico = await UsuarioModel.findOne({ "rol" : "R04" }) || await UsuarioModel.findOne({ "rol" : "R01" });
    let NU_TECNICO = tecnico ? tecnico.NU : "TECNICO_DEMO";

    if(LIMPIAR){
        await TelemetriaModel.deleteMany({ "ID_INC" : ID_INC });
        await AlertaModel.deleteMany({ "ID_INC" : ID_INC });
        await EventoModel.deleteMany({ "ID_INC" : ID_INC });
        await MantenimientoModel.deleteMany({ "ID_INC" : ID_INC });
        console.log("Historial anterior de " + ID_INC + " borrado");
    }

    // ---------- 3. Telemetría ----------
    //
    //  Hace 9.0 → 7.8 días: falla la calefacción, la temperatura cae
    //  Hace 7.8 días: el técnico la arregla
    //  Varias veces: puerta abierta → baja la temperatura un momento
    //  Toda la quincena: la batería se recarga cada vez menos
    //  Últimas 8 horas: la calefacción vuelve a quedarse corta
    //
    const puertas = [12.4, 10.6, 6.3, 4.5, 2.4, 1.3];  // días atrás

    let lecturas = [];
    let tempCaliente = 26;
    let tempFria = 4;
    let peso = 2000;
    let bateria = 12.6;

    for(let t = haceDias(DIAS).getTime(); t <= ahora.getTime(); t += PASO_MIN * 60 * 1000){
        let fecha = new Date(t);
        let hora = fecha.getHours() + fecha.getMinutes() / 60;
        let ambiente = 21 + 5 * Math.sin((hora - 9) / 24 * 2 * Math.PI);

        let fallaCalefaccion = entre(t, 9.0, 7.8);
        let calefaccionDebil = entre(t, 8 / 24, 0);

        // Lado caliente (objetivo 26 °C)
        let calefaccion = !fallaCalefaccion && tempCaliente < 25.5;
        if(fallaCalefaccion){
            tempCaliente += (ambiente - tempCaliente) * 0.06;
        }else if(calefaccion){
            tempCaliente += calefaccionDebil ? 0.04 : 0.45;
        }else{
            tempCaliente -= 0.15;
        }
        tempCaliente += (ambiente - 22) * 0.01 + azar(-0.06, 0.06);

        // Lado frío (objetivo 4 °C)
        let peltier = tempFria > 4.5;
        tempFria += (peltier ? -0.35 : 0.12) + (ambiente - 22) * 0.01 + azar(-0.05, 0.05);

        // Puerta abierta: baja la temperatura de golpe
        if(puertas.some(d => Math.abs(t - haceDias(d).getTime()) < PASO_MIN * 60 * 1000 / 2)){
            tempCaliente -= 2.2;
            tempFria += 2.5;
        }

        // Peso: se gasta kéfir durante el día y se recarga a las 6 a. m.
        if(hora >= 7 && hora <= 19) peso -= azar(5, 12);
        if(fecha.getHours() == 6 && fecha.getMinutes() < PASO_MIN) peso = 2000 + azar(-20, 20);
        peso = Math.max(peso, 150);

        // Batería: cada noche recarga un poco menos
        let dias_transcurridos = (t - haceDias(DIAS).getTime()) / (24 * 60 * 60 * 1000);
        let tope = 12.7 - dias_transcurridos * 0.06;
        if(hora >= 1 && hora < 5){
            bateria = Math.min(tope, bateria + 0.03);
        }else{
            bateria = Math.max(11.2, bateria - 0.006);
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

    // ---------- 4. Alertas ----------
    let alertas = [
        { dias : 12.4, codigo : "PUERTA_ABIERTA",    severidad : "baja",  cierre : 12.39 },
        { dias : 10.6, codigo : "PUERTA_ABIERTA",    severidad : "baja",  cierre : 10.59 },
        { dias : 8.9,  codigo : "TEMP_BAJA",         severidad : "alta",  cierre : 7.8 },
        { dias : 8.8,  codigo : "FALLA_CALEFACCION", severidad : "alta",  cierre : 7.8 },
        { dias : 6.3,  codigo : "PUERTA_ABIERTA",    severidad : "baja",  cierre : 6.29 },
        { dias : 4.5,  codigo : "PUERTA_ABIERTA",    severidad : "baja",  cierre : 4.49 },
        { dias : 1.6,  codigo : "BATERIA_BAJA",      severidad : "media" },
        { dias : 0.15, codigo : "TEMP_BAJA",         severidad : "alta" }
    ].map(a => ({
        ID_ALERTA : siguienteId(),
        ID_INC : ID_INC,
        fecha_hora : haceDias(a.dias),
        codigo : a.codigo,
        severidad : a.severidad,
        estado : a.cierre ? "cerrada" : "abierta",
        fecha_cierre : a.cierre ? haceDias(a.cierre) : undefined,
        cerrada_por : a.cierre ? NU_TECNICO : undefined
    }));

    await AlertaModel.insertMany(alertas);
    console.log("Alertas: " + alertas.length + " (" + alertas.filter(a => a.estado == "abierta").length + " abiertas)");

    // ---------- 5. Eventos ----------
    let eventos = [
        { dias : 14.0, tipo : "encendido",           detalle : "Incubadora encendida" + (local ? " en " + local.nombre : "") },
        { dias : 13.9, tipo : "inicio_fermentacion", detalle : "Lote 1 — 2 L de leche entera" },
        { dias : 12.9, tipo : "fin_fermentacion",    detalle : "Lote 1 terminado" },
        { dias : 12.4, tipo : "puerta_abierta",      detalle : "Puerta abierta 8 minutos" },
        { dias : 10.6, tipo : "puerta_abierta",      detalle : "Puerta abierta 5 minutos" },
        { dias : 10.5, tipo : "inicio_fermentacion", detalle : "Lote 2 — 2 L de leche entera" },
        { dias : 9.0,  tipo : "falla",               detalle : "La calefacción dejó de responder" },
        { dias : 7.8,  tipo : "reinicio",            detalle : "Reinicio después del mantenimiento" },
        { dias : 7.7,  tipo : "inicio_fermentacion", detalle : "Lote 3 — 2 L de leche deslactosada" },
        { dias : 6.3,  tipo : "puerta_abierta",      detalle : "Puerta abierta 12 minutos" },
        { dias : 5.0,  tipo : "actualizacion",       detalle : "Temperatura objetivo cambiada a 26 °C" },
        { dias : 4.5,  tipo : "puerta_abierta",      detalle : "Puerta abierta 4 minutos" },
        { dias : 3.0,  tipo : "fin_fermentacion",    detalle : "Lote 3 terminado" },
        { dias : 2.9,  tipo : "inicio_fermentacion", detalle : "Lote 4 — 2 L de leche entera" },
        { dias : 2.4,  tipo : "puerta_abierta",      detalle : "Puerta abierta 3 minutos" },
        { dias : 1.3,  tipo : "puerta_abierta",      detalle : "Puerta abierta 6 minutos" }
    ].map(e => ({
        ID_EVENTO : siguienteId(),
        ID_INC : ID_INC,
        fecha_hora : haceDias(e.dias),
        tipo_evento : e.tipo,
        detalle : e.detalle
    }));

    await EventoModel.insertMany(eventos);
    console.log("Eventos: " + eventos.length);

    // ---------- 6. Mantenimientos ----------
    let mantenimientos = [
        {
            ID_MANT : siguienteId(),
            ID_INC : ID_INC,
            NU_tecnico : NU_TECNICO,
            fecha : haceDias(8.2),
            tipo : "correctivo",
            falla_reportada : "La calefacción no enciende y la temperatura bajó a 19 °C",
            solucionado : true,
            fecha_cierre : haceDias(7.8),
            observaciones : "Se cambió el relé de la resistencia. Probada 2 horas sin fallas."
        },
        {
            ID_MANT : siguienteId(),
            ID_INC : ID_INC,
            NU_tecnico : NU_TECNICO,
            fecha : haceDias(1.0),
            tipo : "preventivo",
            falla_reportada : "Batería no carga por completo",
            solucionado : false,
            motivo_no_solucionado : "Pendiente visita para cambiar la batería",
            observaciones : "El cliente reporta que dura menos en las noches"
        }
    ];

    await MantenimientoModel.insertMany(mantenimientos);
    console.log("Mantenimientos: " + mantenimientos.length);

    // Última conexión = última lectura
    await IncubadoraModel.updateOne({ "ID_INC" : ID_INC }, { "ultima_conexion" : lecturas[lecturas.length - 1].fecha_hora });

    console.log("\n================ LISTO ================");
    console.log("Incubadora: " + incubadora.numero_serie + " (" + ID_INC + ")");
    if(local) console.log("Local:      " + local.nombre);
    if(dueno) console.log("Dueño:      " + dueno.nombre + " " + dueno.apellido + " (" + dueno.correo + ")");
    console.log("=======================================");

    await mongoose.disconnect();
}

main().catch(error => {
    console.log("Error: " + error);
    process.exit(1);
});