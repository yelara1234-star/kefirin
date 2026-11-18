require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT;
const mongoose = require('mongoose');
const connetionString = process.env.MONGO_URL;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('./configs/config');
const cors = require('cors');
const crypto = require('crypto');


/////////////////////////////////////////////////////////////

const UsuarioModel = require('./models/usuarios');
const RolModel = require('./models/roles');
const LocalModel = require('./models/locales');
const ModeloIncubadoraModel = require('./models/modelos_incubadora');
const FirmwareVersionModel = require('./models/firmware_versiones');
const IncubadoraModel = require('./models/incubadoras');
const TelemetriaModel = require('./models/telemetria');
const EventoModel = require('./models/eventos');
const AlertaModel = require('./models/alertas');
const ConfiguracionIncubadoraModel = require('./models/configuracion_incubadora');
const MantenimientoModel = require('./models/mantenimientos');
const RegistroAccesoModel = require('./models/registro_accesos');
const RegistroActividadModel = require('./models/registro_actividad');

/////////////////////////////////////////////////////////////

app.use(express.json());
app.use(cors());

app.set('llave', config.llave);
 
const rutasProtegidas = express.Router();
 
rutasProtegidas.use((req, res, next) =>{
    const token = req.headers['access-token'];
    if(token){
        jwt.verify(token, app.get('llave'), (err , decoded) =>{
            if(err){
                return res.json({mensaje : 'Token invalido'});
            }else{
                req.decoded = decoded;
                next();
            }
        });
    }else{
        res.send({
            mensaje : 'Token vacio'
        });
    }
});
 
const soloAdmin = (req, res, next) => {
    if(req.decoded && req.decoded.rol == "R01"){
        next();
    }else{
        res.send({ mensaje : "No tienes permiso" });
    }
};

///////////////////////////////////////////////////////////////////

// =====================================================================
//  HISTÓRICOS Y ALERTAS — código para pegar en index.js
//  Pégalo después de soloAdmin y antes de app.listen(...)
// =====================================================================


// ---------------------------------------------------------------------
// 1. ROLES DEL PERSONAL
//    Admin y técnicos pueden ver todas las incubadoras y cerrar alertas.
//    Agrega aquí el ID_ROL del técnico (el que creaste en la colección roles).
// ---------------------------------------------------------------------

const ROLES_PERSONAL = ["R01", "R04"];

const esPersonal = (decoded) => {
    return decoded && ROLES_PERSONAL.includes(decoded.rol);
};

// Middleware: solo admin y técnicos
const soloPersonal = (req, res, next) => {
    if(esPersonal(req.decoded)){
        next();
    }else{
        res.send({ mensaje : "No tienes permiso" });
    }
};


// =====================================================================
//  REGISTROS DE ACCESOS Y DE ACTIVIDAD
//  Los escribe el propio backend; no dependen de lo que mande el front.
//  Si guardar un registro falla, se avisa en consola pero la petición
//  del usuario sigue normal.
// =====================================================================

// IDs numéricos únicos (los dos modelos usan Number)
let contadorIds = 0;
const nuevoId = () => {
    contadorIds = (contadorIds + 1) % 1000;
    return Date.now() * 1000 + contadorIds;
};

// Datos de la conexión: IP, si es celular o computador, y el navegador
const datosConexion = (req) => {
    let agente = req.headers['user-agent'] || "";
    let navegador = "Otro";

    if(/Edg\//.test(agente)) navegador = "Edge";
    else if(/OPR\//.test(agente)) navegador = "Opera";
    else if(/Chrome\//.test(agente)) navegador = "Chrome";
    else if(/Firefox\//.test(agente)) navegador = "Firefox";
    else if(/Safari\//.test(agente)) navegador = "Safari";
    else if(/PostmanRuntime/.test(agente)) navegador = "Postman";

    return {
        direccion_ip : req.ip || (req.socket && req.socket.remoteAddress) || "desconocida",
        dispositivo : /Mobile|Android|iPhone|iPad/.test(agente) ? "celular" : "computador",
        navegador_o_app : navegador
    };
};

// Un intento de inicio de sesión (exitoso o fallido)
const registrarAcceso = async (req, datos) => {
    try{
        let acceso = new RegistroAccesoModel({
            ID_ACCESO : nuevoId(),
            NU : datos.NU,
            correo_intentado : datos.correo || "(vacío)",
            fecha_hora : new Date(),
            resultado : datos.resultado,
            motivo_fallo : datos.motivo_fallo,
            origen : "web",
            ID_SESION : datos.ID_SESION || "sin sesion",
            ...datosConexion(req)
        });
        await acceso.save();
    }catch(error){
        console.log("No se pudo guardar el registro de acceso: " + error);
    }
};

// Una acción que cambió datos: quién, qué, y de qué valor a qué valor
const registrarActividad = async (NU, accion, extra = {}) => {
    try{
        let actividad = new RegistroActividadModel({
            ID_ACTIVIDAD : nuevoId(),
            NU : NU,
            ID_INC : extra.ID_INC,
            fecha_hora : new Date(),
            accion : accion,
            valor_anterior : extra.anterior !== undefined ? String(extra.anterior) : undefined,
            valor_nuevo : extra.nuevo !== undefined ? String(extra.nuevo) : undefined
        });
        await actividad.save();
    }catch(error){
        console.log("No se pudo guardar el registro de actividad: " + error);
    }
};


// ---------------------------------------------------------------------
// 2. VERIFICAR QUE LA INCUBADORA SEA DEL USUARIO
//    El personal pasa directo. Un usuario normal solo si la incubadora
//    está en uno de sus locales.
// ---------------------------------------------------------------------

const accesoIncubadora = async (req, res, next) => {
    try{
        if(esPersonal(req.decoded)){
            return next();
        }

        let incubadora = await IncubadoraModel.findOne({ "ID_INC" : req.params.ID_INC });
        if(!incubadora || !incubadora.ID_LOCAL){
            return res.send({ mensaje : "No tienes permiso" });
        }

        let local = await LocalModel.findOne({ "ID_LOCAL" : incubadora.ID_LOCAL, "ID_DUEÑO" : req.decoded.NU });
        if(!local){
            return res.send({ mensaje : "No tienes permiso" });
        }

        next();
    }catch(error){
        console.log("Error verificando acceso: " + error);
        res.send({ mensaje : "No se pudo verificar el acceso" });
    }
};


// ---------------------------------------------------------------------
// 3. RANGO DE FECHAS desde ?desde=...&hasta=...
//    Si no llegan, se toman los últimos 7 días.
// ---------------------------------------------------------------------

const rangoFechas = (req) => {
    let hasta = req.query.hasta ? new Date(req.query.hasta) : new Date();
    let desde = req.query.desde ? new Date(req.query.desde) : new Date(hasta.getTime() - 7 * 24 * 60 * 60 * 1000);

    if(isNaN(desde) || isNaN(hasta)){
        return null;
    }
    return { $gte : desde, $lte : hasta };
};


// ---------------------------------------------------------------------
// 4. INCUBADORAS PARA EL SELECTOR DEL HISTÓRICO
//    Personal: todas las que tienen local. Usuario: solo las suyas.
//    A cada una le agrega el nombre del local y del dueño.
// ---------------------------------------------------------------------

app.get("/incubadoras_visibles", rutasProtegidas, async (req, res) => {
    console.log("Solicitó incubadoras_visibles");

    try{
        let locales;
        if(esPersonal(req.decoded)){
            locales = await LocalModel.find({});
        }else{
            locales = await LocalModel.find({ "ID_DUEÑO" : req.decoded.NU });
        }

        let ids_locales = locales.map(l => l.ID_LOCAL);
        let incubadoras = await IncubadoraModel.find({ "ID_LOCAL" : { $in : ids_locales } }).lean();

        let ids_duenos = locales.map(l => l["ID_DUEÑO"]);
        let duenos = await UsuarioModel.find({ "NU" : { $in : ids_duenos } }).select('NU nombre apellido');

        incubadoras.forEach(inc => {
            let local = locales.find(l => l.ID_LOCAL == inc.ID_LOCAL);
            let dueno = local ? duenos.find(d => d.NU == local["ID_DUEÑO"]) : null;
            inc.nombre_local = local ? local.nombre : "";
            inc.nombre_dueno = dueno ? dueno.nombre + " " + dueno.apellido : "";
        });

        res.send(incubadoras);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});


// ---------------------------------------------------------------------
// 5. HISTÓRICOS POR INCUBADORA
// ---------------------------------------------------------------------

app.get("/historico/telemetria/:ID_INC", rutasProtegidas, accesoIncubadora, async (req, res) => {
    console.log("Solicitó historico telemetria");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    try{
        let lecturas = await TelemetriaModel.find({ "ID_INC" : req.params.ID_INC, "fecha_hora" : rango })
            .sort({ fecha_hora : 1 })
            .limit(5000);
        res.send(lecturas);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

app.get("/historico/alertas/:ID_INC", rutasProtegidas, accesoIncubadora, async (req, res) => {
    console.log("Solicitó historico alertas");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    try{
        let alertas = await AlertaModel.find({ "ID_INC" : req.params.ID_INC, "fecha_hora" : rango })
            .sort({ fecha_hora : -1 })
            .limit(500);
        res.send(alertas);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

app.get("/historico/eventos/:ID_INC", rutasProtegidas, accesoIncubadora, async (req, res) => {
    console.log("Solicitó historico eventos");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    try{
        let eventos = await EventoModel.find({ "ID_INC" : req.params.ID_INC, "fecha_hora" : rango })
            .sort({ fecha_hora : -1 })
            .limit(500);
        res.send(eventos);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

// Ojo: en mantenimientos el campo de fecha se llama "fecha", no "fecha_hora"
app.get("/historico/mantenimientos/:ID_INC", rutasProtegidas, accesoIncubadora, async (req, res) => {
    console.log("Solicitó historico mantenimientos");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    try{
        let mantenimientos = await MantenimientoModel.find({ "ID_INC" : req.params.ID_INC, "fecha" : rango })
            .sort({ fecha : -1 })
            .limit(500)
            .lean();

        // Agregar el nombre del técnico
        let ids_tecnicos = mantenimientos.map(m => m.NU_tecnico);
        let tecnicos = await UsuarioModel.find({ "NU" : { $in : ids_tecnicos } }).select('NU nombre apellido');

        mantenimientos.forEach(m => {
            let t = tecnicos.find(x => x.NU == m.NU_tecnico);
            m.nombre_tecnico = t ? t.nombre + " " + t.apellido : m.NU_tecnico;
        });

        res.send(mantenimientos);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});


// ---------------------------------------------------------------------
// 6. ALERTAS ABIERTAS (solo personal)
//    Todas las alertas abiertas de todas las incubadoras, con su serial,
//    local y dueño, para la opción ALERTAS ABIERTAS del panel.
// ---------------------------------------------------------------------

app.get("/alertas_abiertas", rutasProtegidas, soloPersonal, async (req, res) => {
    console.log("Solicitó alertas_abiertas");

    try{
        let alertas = await AlertaModel.find({ "estado" : "abierta" }).sort({ fecha_hora : -1 }).limit(500).lean();

        let ids_inc = alertas.map(a => a.ID_INC);
        let incubadoras = await IncubadoraModel.find({ "ID_INC" : { $in : ids_inc } });

        let ids_locales = incubadoras.map(i => i.ID_LOCAL);
        let locales = await LocalModel.find({ "ID_LOCAL" : { $in : ids_locales } });

        alertas.forEach(a => {
            let inc = incubadoras.find(i => i.ID_INC == a.ID_INC);
            let local = inc ? locales.find(l => l.ID_LOCAL == inc.ID_LOCAL) : null;
            a.numero_serie = inc ? inc.numero_serie : a.ID_INC;
            a.nombre_local = local ? local.nombre : "";
        });

        res.send(alertas);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});


// ---------------------------------------------------------------------
// 7. CERRAR UNA ALERTA (solo personal)
//    Guarda la fecha de cierre y quién la cerró.
// ---------------------------------------------------------------------

app.put("/cerrar_alerta/:ID_ALERTA", rutasProtegidas, soloPersonal, async (req, res) => {
    console.log("Solicitó cerrar_alerta");

    try{
        let resultado = await AlertaModel.findOneAndUpdate(
            { "ID_ALERTA" : Number(req.params.ID_ALERTA), "estado" : "abierta" },
            { "estado" : "cerrada", "fecha_cierre" : new Date(), "cerrada_por" : req.decoded.NU },
            { new : true }
        );

        if(resultado){
            await registrarActividad(req.decoded.NU, "cerró alerta " + resultado.codigo, {
                ID_INC : resultado.ID_INC,
                anterior : "abierta",
                nuevo : "cerrada"
            });
            res.send({ mensaje : "Alerta cerrada" });
        }else{
            res.send({ mensaje : "La alerta no existe o ya estaba cerrada" });
        }
    }catch(error){
        console.log("Error cerrando alerta: " + error);
        res.send({ mensaje : "No se pudo cerrar la alerta" });
    }
});

/////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////

mongoose.connect(connetionString)
    .then(() => console.log("Conectado a la base de datos"));

//////////////////////////////////////////////////////////////

app.post("/registro_usuario", async (req, res) => {
    console.log("Solicitó login");

    let usuario = req.body;
    if(usuario){
        usuario.datetime = new Date().toISOString();
        usuario.rol = "R02"; // Todo registro nuevo entra como visitante
        usuario.clave = await bcrypt.hash(usuario.clave, 10); //que pase por encima 10 veces
        console.log(usuario);
        let registro = new UsuarioModel(usuario);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 

app.post("/modelos_incubadora", async (req, res) => {
    console.log("Solicitó modelos_incubadora");
 
    let modelo = req.body;
    if(modelo){
        modelo.datetime = new Date().toISOString();
        console.log(modelo);
        let registro = new ModeloIncubadoraModel(modelo);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 

app.post("/firmware_versiones", async (req, res) => {
    console.log("Solicitó firmware_versiones");
 
    let firmware = req.body;
    if(firmware){
        firmware.datetime = new Date().toISOString();
        console.log(firmware);
        let registro = new FirmwareVersionModel(firmware);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/telemetria", async (req, res) => {
    console.log("Solicitó telemetria");
 
    let lectura = req.body;
    if(lectura){
        lectura.datetime = new Date().toISOString();
        console.log(lectura);
        let registro = new TelemetriaModel(lectura);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/eventos", async (req, res) => {
    console.log("Solicitó eventos");
 
    let evento = req.body;
    if(evento){
        evento.datetime = new Date().toISOString();
        console.log(evento);
        let registro = new EventoModel(evento);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
////////////////////////////////////////////////////////////////////////////////  

app.post("/alertas", async (req, res) => {
    console.log("Solicitó alertas");
 
    let alerta = req.body;
    if(alerta){
        alerta.datetime = new Date().toISOString();
        console.log(alerta);
        let registro = new AlertaModel(alerta);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/configuracion_incubadora", async (req, res) => {
    console.log("Solicitó configuracion_incubadora");
 
    let configuracion = req.body;
    if(configuracion){
        configuracion.datetime = new Date().toISOString();
        console.log(configuracion);
        let registro = new ConfiguracionIncubadoraModel(configuracion);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/mantenimientos", async (req, res) => {
    console.log("Solicitó mantenimientos");
 
    let mantenimiento = req.body;
    if(mantenimiento){
        mantenimiento.datetime = new Date().toISOString();
        console.log(mantenimiento);
        let registro = new MantenimientoModel(mantenimiento);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/registro_accesos", async (req, res) => {
    console.log("Solicitó registro_accesos");
 
    let acceso = req.body;
    if(acceso){
        acceso.datetime = new Date().toISOString();
        console.log(acceso);
        let registro = new RegistroAccesoModel(acceso);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});
 
//////////////////////////////////////////////////////////////////////////////// 
 
app.post("/registro_actividad", async (req, res) => {
    console.log("Solicitó registro_actividad");
 
    let actividad = req.body;
    if(actividad){
        actividad.datetime = new Date().toISOString();
        console.log(actividad);
        let registro = new RegistroActividadModel(actividad);
        let payload = {
            registro : registro, 
            mensaje : ""
        }
            registro.save().then( item => {
                console.log("Registro guardado en mongo");
                payload.mensaje = "Registro guardado en mongo";
                res.send(payload);
                }).catch( error => {
            console.log("Error al guardar en mongo" + error);
            payload.mensaje = "Error al guardar en mongo" + error;
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});

/////////////////////////////////////////////////////////////////////////////////

// Crear un rol (solo admin). El ID_ROL lo genera el backend: R01, R02... → el siguiente libre
app.post("/roles", rutasProtegidas, soloAdmin, async (req, res) => {
    console.log("Solicitó crear rol");

    let nombre = (req.body.nombre || "").trim();
    let descripcion = (req.body.descripcion || "").trim();

    if(nombre == ""){
        return res.send({ mensaje : "Escribe el nombre del rol" });
    }

    try{
        // Nombre repetido (sin importar mayúsculas)
        let roles = await RolModel.find({});
        let repetido = roles.find(r => r.nombre.toLowerCase() == nombre.toLowerCase());
        if(repetido){
            return res.send({ mensaje : "Ya existe un rol con ese nombre (" + repetido.ID_ROL + ")" });
        }

        // Siguiente número libre
        let numeros = roles.map(r => parseInt(String(r.ID_ROL).replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
        let siguiente = numeros.length ? Math.max(...numeros) + 1 : 1;
        let ID_ROL = "R" + String(siguiente).padStart(2, "0");

        let rol = new RolModel({ ID_ROL : ID_ROL, nombre : nombre, descripcion : descripcion });
        await rol.save();

        await registrarActividad(req.decoded.NU, "creó rol", { nuevo : ID_ROL + " - " + nombre });

        res.send({ mensaje : "Rol creado", ID_ROL : ID_ROL });
    }catch(error){
        console.log("Error creando rol: " + error);
        res.send({ mensaje : "No se pudo crear el rol" });
    }
});
 
/////////////////////////////////////////////////////////////////////////////////

app.post("/login", async (req, res) => {
    console.log("Solicitó login");
 
    let usuario = req.body;
    console.log(usuario);
    if(usuario){
        let correo = usuario.correo;
        let clave = usuario.clave;
 
        let query = { "correo" : correo };
 
        UsuarioModel.findOne(query).then( async result => {
            let payload = {
                mensaje : ""
            }
            try{
                // Correo que no existe
                if(!result){
                    await registrarAcceso(req, { correo : correo, resultado : "fallido", motivo_fallo : "correo no registrado" });
                    payload.mensaje = "usuario o clave incorrectos";
                    return res.send(payload);
                }

                let clave_en_db = result.clave;
                if(await bcrypt.compare(clave, clave_en_db)){
                    // Cada inicio de sesión tiene su propio ID, que va dentro del token
                    let ID_SESION = crypto.randomUUID();

                    let datosToken = {
                        NU : result.NU,
                        nombre : result.nombre,
                        rol : result.rol,
                        ID_SESION : ID_SESION
                    };
                    const token = jwt.sign(datosToken, app.get('llave'), {
                        expiresIn : '10m'
                    });

                    await registrarAcceso(req, { NU : result.NU, correo : correo, resultado : "exitoso", ID_SESION : ID_SESION });

                    payload.check = true;
                    payload.mensaje = "login correcto";
                    payload.token = token;
                    res.send(payload);
                }else{
                    await registrarAcceso(req, { NU : result.NU, correo : correo, resultado : "fallido", motivo_fallo : "clave incorrecta" });
                    payload.mensaje = "usuario o clave incorrectos";
                    res.send(payload);
                }
            }catch(error){
                console.log("Error en login: " + error);
                payload.mensaje = "usuario o clave incorrectos";
                res.send(payload);
            }
        }).catch( error => {
            let payload = {
                mensaje : ""
            }
            console.log('error consulta');
            payload.mensaje = "ERROR CONSULTA: " + error.toString();
            res.send(payload);
        });
    }else{
        let payload = {
            mensaje : "Body vacio"
        }
        res.send(payload);
    }
});

/////////////////////////////////////////////////////////////////////////////////

// =====================================================================
//  CONSULTA DE REGISTROS (solo admin)
//  Filtros opcionales: ?NU=...&desde=...&hasta=...&resultado=exitoso|fallido
// =====================================================================

// Agrega "nombre_usuario" a cada registro según su NU
const agregarNombres = async (registros) => {
    let ids = [...new Set(registros.map(r => r.NU).filter(Boolean))];
    let usuarios = await UsuarioModel.find({ "NU" : { $in : ids } }).select('NU nombre apellido');

    registros.forEach(r => {
        let u = usuarios.find(x => x.NU == r.NU);
        r.nombre_usuario = u ? u.nombre + " " + u.apellido : (r.NU || "—");
    });
    return registros;
};

app.get("/registros/accesos", rutasProtegidas, soloAdmin, async (req, res) => {
    console.log("Solicitó registros de accesos");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    let query = { "fecha_hora" : rango };
    if(req.query.NU) query.NU = req.query.NU;
    if(req.query.resultado) query.resultado = req.query.resultado;

    try{
        let accesos = await RegistroAccesoModel.find(query).sort({ fecha_hora : -1 }).limit(500).lean();
        res.send(await agregarNombres(accesos));
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

app.get("/registros/actividad", rutasProtegidas, soloAdmin, async (req, res) => {
    console.log("Solicitó registros de actividad");

    let rango = rangoFechas(req);
    if(!rango){
        return res.send({ mensaje : "Fechas inválidas" });
    }

    let query = { "fecha_hora" : rango };
    if(req.query.NU) query.NU = req.query.NU;

    try{
        let actividad = await RegistroActividadModel.find(query).sort({ fecha_hora : -1 }).limit(500).lean();
        res.send(await agregarNombres(actividad));
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

/////////////////////////////////////////////////////////////////////////////////

// Cerrar sesión: marca la hora de salida en el registro de accesos
app.post("/cerrar_sesion", rutasProtegidas, async (req, res) => {
    console.log("Solicitó cerrar_sesion");

    try{
        if(req.decoded.ID_SESION){
            await RegistroAccesoModel.updateOne(
                { "ID_SESION" : req.decoded.ID_SESION, "fecha_cierre" : null },
                { "fecha_cierre" : new Date(), "tipo_cierre" : "manual" }
            );
        }
        res.send({ mensaje : "Sesión cerrada" });
    }catch(error){
        console.log("Error cerrando sesión: " + error);
        res.send({ mensaje : "Sesión cerrada" });
    }
});


//////////////////////////////////////////////////////////////

//////3333333//////   CONSULTAS   ///////3333333//////////////

////////////////// usuarios
app.get("/listausuarios",rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listausuarios");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
UsuarioModel.find(query).select('-clave').limit(100).sort( { fecha_ingreso : -1 } ).lean().then( async result => {
        console.log("consultaron");

        // Último ingreso exitoso de cada usuario
        let ultimos = await RegistroAccesoModel.aggregate([
            { $match : { "resultado" : "exitoso" } },
            { $group : { _id : "$NU", ultimo : { $max : "$fecha_hora" } } }
        ]);

        result.forEach(u => {
            let r = ultimos.find(x => x._id == u.NU);
            u.ultimo_ingreso = r ? r.ultimo : null;
        });

        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
////////////////////////////////////// roles
app.get("/listaroles", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listaroles");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    RolModel.find(query).limit(100).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
app.get("/listaroles/:ID_ROL", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listaroles por ID_ROL");
    console.log(req.params);
 
    let query = { "ID_ROL" : req.params.ID_ROL };
    let payload = {
        mensaje : ""
    }
 
    RolModel.findOne(query).then( result => {
        if(result){
            console.log("consultaron");
            res.send(result);
        }else{
            payload.mensaje = "No se encontró el registro";
            res.send(payload);
        }
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
////////////////// locales
app.get("/listalocales", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listalocales");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    LocalModel.find(query).limit(100).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
////////////////// modelos_incubadora
app.get("/listamodelos_incubadora", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listamodelos_incubadora");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    ModeloIncubadoraModel.find(query).limit(100).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
app.get("/listamodelos_incubadora/:ID_MODELO", rutasProtegidas, (req, res) => {
    console.log("Solicitó listamodelos_incubadora por ID_MODELO");
    console.log(req.params);
 
    let query = { "ID_MODELO" : req.params.ID_MODELO };
    let payload = {
        mensaje : ""
    }
 
    ModeloIncubadoraModel.findOne(query).then( result => {
        if(result){
            console.log("consultaron");
            res.send(result);
        }else{
            payload.mensaje = "No se encontró el registro";
            res.send(payload);
        }
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
////////////////// firmware_versiones
app.get("/listafirmware_versiones", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listafirmware_versiones");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    FirmwareVersionModel.find(query).limit(100).sort( { fecha_publicacion : -1 } ).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
app.get("/listafirmware_versiones/:ID_FIRMWARE", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listafirmware_versiones por ID_FIRMWARE");
    console.log(req.params);
 
    let query = { "ID_FIRMWARE" : req.params.ID_FIRMWARE };
    let payload = {
        mensaje : ""
    }
 
    FirmwareVersionModel.findOne(query).then( result => {
        if(result){
            console.log("consultaron");
            res.send(result);
        }else{
            payload.mensaje = "No se encontró el registro";
            res.send(payload);
        }
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
////////////////// incubadoras
app.get("/listaincubadoras", rutasProtegidas, soloAdmin, (req, res) => {
    console.log("Solicitó listaincubadoras");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    IncubadoraModel.find(query).limit(100).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
app.get("/listaincubadoras/:ID_INC", rutasProtegidas, (req, res) => {
    console.log("Solicitó listaincubadoras por ID_INC");
    console.log(req.params);
 
    let query = { "ID_INC" : req.params.ID_INC };
    let payload = {
        mensaje : ""
    }
 
    IncubadoraModel.findOne(query).then( result => {
        if(result){
            console.log("consultaron");
            res.send(result);
        }else{
            payload.mensaje = "No se encontró el registro";
            res.send(payload);
        }
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});

/////////////////////////////////// configuracion_incubadora
app.get("/listaconfiguracion_incubadora", rutasProtegidas, (req, res) => {
    console.log("Solicitó listaconfiguracion_incubadora");
 
    let query = { };
    let payload = {
        mensaje : ""
    }
 
    ConfiguracionIncubadoraModel.find(query).limit(100).sort( { fecha_modificacion : -1 } ).then( result => {
        console.log("consultaron");
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
app.get("/listaconfiguracion_incubadora/:ID_INC", rutasProtegidas, (req, res) => {
    console.log("Solicitó listaconfiguracion_incubadora por ID_INC");
    console.log(req.params);
 
    let query = { "ID_INC" : req.params.ID_INC };
    let payload = {
        mensaje : ""
    }
 
    ConfiguracionIncubadoraModel.findOne(query).then( result => {
        if(result){
            console.log("consultaron");
            res.send(result);
        }else{
            payload.mensaje = "No se encontró el registro";
            res.send(payload);
        }
    }).catch( error => {
        console.log('error consulta');
        payload.mensaje = "ERROR CONSULTA: " + error.toString();
        res.send(payload);
    });
});
 
//////////////////////////////////////////////////////////////

app.put("/actualizar_usuario", rutasProtegidas, async (req, res) => {
    console.log("Solicitó actualizar usuario");

    let query = { "NU" : req.decoded.NU };
    let payload = {
        mensaje : ""
    }

    // Solo estos campos se pueden modificar
    let cambios = {
        nombre : req.body.nombre,
        apellido : req.body.apellido,
        telefono : req.body.telefono
    }

    try{
        // Se guarda el valor viejo (.lean() → objeto normal) para compararlo
        let anterior = await UsuarioModel.findOneAndUpdate(query, cambios, { new : false, runValidators : true }).lean();

        if(!anterior){
            payload.mensaje = "No se encontró el usuario";
            return res.send(payload);
        }

        // Un registro por cada campo que de verdad cambió
        const nombres_campos = { nombre : "nombre", apellido : "apellido", telefono : "teléfono" };
        let hubo_cambios = false;
        for(let campo of Object.keys(cambios)){
            if(String(anterior[campo]) !== String(cambios[campo])){
                hubo_cambios = true;
                await registrarActividad(req.decoded.NU, "modificó " + nombres_campos[campo], {
                    anterior : anterior[campo],
                    nuevo : cambios[campo]
                });
            }
        }

        payload.mensaje = hubo_cambios ? "Datos actualizados" : "No hubo cambios";
        res.send(payload);
    }catch(error){
        console.log('error actualizando: ' + error);
        payload.mensaje = "No se pudieron guardar los cambios";
        res.send(payload);
    }
});

////////////////////////////////////////////////////

app.get("/mislocales", rutasProtegidas, (req, res) => {
    console.log("Solicitó mislocales");

    LocalModel.find({ "ID_DUEÑO" : req.decoded.NU }).then( result => {
        res.send(result);
    }).catch( error => {
        console.log('error consulta');
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    });
});

//////////////////////////////////////////////////////

app.post("/asignar_incubadora", rutasProtegidas, async (req, res) => {
    console.log("Solicitó asignar_incubadora");

    let NU = req.decoded.NU;
    let serial = (req.body.numero_serie || "").trim().toUpperCase();
    let ID_LOCAL = req.body.ID_LOCAL;
    let nuevo_local = req.body.nuevo_local;
    let payload = {
        mensaje : ""
    }

    // Formato: KF-M01-F10-2611-7Q4X
    const formato = /^KF-[A-Z0-9]+-[A-Z0-9]+-\d{4}-[A-Z0-9]{4}$/;
    if(!formato.test(serial)){
        payload.mensaje = "El número de serie no tiene un formato válido";
        return res.send(payload);
    }

    try{
        // 1. Debe existir (registrada por el admin) y no tener dueño
        let incubadora = await IncubadoraModel.findOne({ "numero_serie" : serial });
        if(!incubadora){
            payload.mensaje = "Ese número de serie no existe";
            return res.send(payload);
        }
        if(incubadora.ID_LOCAL){
            payload.mensaje = "Esa incubadora ya está registrada";
            return res.send(payload);
        }

        // 2. El local: uno nuevo, o uno existente que sea del usuario
        if(nuevo_local){
            ID_LOCAL = "LOC" + Date.now() + Math.floor(Math.random() * 1000);
            let local = new LocalModel({
                ID_LOCAL : ID_LOCAL,
                ID_DUEÑO : NU,
                nombre : nuevo_local.nombre,
                ubicacion_manual : nuevo_local.ubicacion_manual,
                ciudad : nuevo_local.ciudad,
                pais : nuevo_local.pais,
                zona_horaria : nuevo_local.zona_horaria
            });
            await local.save();
            await registrarActividad(NU, "creó local", { nuevo : nuevo_local.nombre + " (" + ID_LOCAL + ")" });
        }else{
            let local = await LocalModel.findOne({ "ID_LOCAL" : ID_LOCAL, "ID_DUEÑO" : NU });
            if(!local){
                payload.mensaje = "Ese local no te pertenece";
                return res.send(payload);
            }
        }

        // 3. Asignarla, solo si sigue sin dueño
        let resultado = await IncubadoraModel.findOneAndUpdate(
            { "numero_serie" : serial, "ID_LOCAL" : null },
            { "ID_LOCAL" : ID_LOCAL, "estado" : "activa", "fecha_instalacion" : new Date() },
            { new : true }
        );

        if(resultado){
            await registrarActividad(NU, "registró incubadora", {
                ID_INC : resultado.ID_INC,
                anterior : "sin asignar",
                nuevo : "local " + ID_LOCAL
            });
            payload.mensaje = "Incubadora registrada";
            payload.registro = resultado;
        }else{
            payload.mensaje = "Esa incubadora ya está registrada";
        }
        res.send(payload);
    }catch(error){
        console.log("Error asignando incubadora: " + error);
        payload.mensaje = "No se pudo registrar la incubadora";
        res.send(payload);
    }
});

/////////////////////////////////////////////////

app.get("/misincubadoras", rutasProtegidas, async (req, res) => {
    console.log("Solicitó misincubadoras");

    try{
        let locales = await LocalModel.find({ "ID_DUEÑO" : req.decoded.NU });
        let ids_locales = locales.map(local => local.ID_LOCAL);

        let incubadoras = await IncubadoraModel.find({ "ID_LOCAL" : { $in : ids_locales } }).lean();

        incubadoras.forEach(inc => {
            let local = locales.find(l => l.ID_LOCAL == inc.ID_LOCAL);
            inc.nombre_local = local ? local.nombre : "";
        });

        res.send(incubadoras);
    }catch(error){
        console.log("error consulta: " + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

///////////////////////////////////////////////////

app.get("/misdatos", rutasProtegidas, async (req, res) => {
    console.log("Solicitó misdatos");

    try{
        let result = await UsuarioModel.findOne({ "NU" : req.decoded.NU }).select('-clave').lean();
        if(!result){
            return res.send({ mensaje : "No se encontró el usuario" });
        }

        // Último ingreso ANTERIOR a la sesión actual
        let ingreso = await RegistroAccesoModel.findOne({
            "NU" : req.decoded.NU,
            "resultado" : "exitoso",
            "ID_SESION" : { $ne : req.decoded.ID_SESION }
        }).sort({ fecha_hora : -1 }).lean();

        // Último cambio que el usuario hizo a sus propios datos
        let modificacion = await RegistroActividadModel.findOne({
            "NU" : req.decoded.NU,
            "accion" : /^modificó /
        }).sort({ fecha_hora : -1 }).lean();

        result.ultimo_ingreso = ingreso ? {
            fecha_hora : ingreso.fecha_hora,
            dispositivo : ingreso.dispositivo,
            navegador_o_app : ingreso.navegador_o_app
        } : null;

        result.ultima_modificacion = modificacion ? {
            fecha_hora : modificacion.fecha_hora,
            campo : modificacion.accion.replace("modificó ", "")
        } : null;

        res.send(result);
    }catch(error){
        console.log('error consulta: ' + error);
        res.send({ mensaje : "ERROR CONSULTA: " + error.toString() });
    }
});

/////////////////////////////////////////////////////////

app.put("/cambiar_rol", rutasProtegidas, soloAdmin, async (req, res) => {
    console.log("Solicitó cambiar_rol");

    let NU = req.body.NU;
    let rol = req.body.rol;

    try{
        if(NU == req.decoded.NU){
            return res.send({ mensaje : "No puedes cambiar tu propio rol" });
        }

        let existe = await RolModel.findOne({ "ID_ROL" : rol });
        if(!existe){
            return res.send({ mensaje : "Ese rol no existe" });
        }

        // new: false → devuelve el usuario como estaba, para saber el rol anterior
        let result = await UsuarioModel.findOneAndUpdate({ "NU" : NU }, { "rol" : rol }, { new : false });
        if(result){
            if(result.rol !== rol){
                await registrarActividad(req.decoded.NU, "cambió el rol de " + NU, {
                    anterior : result.rol,
                    nuevo : rol
                });
            }
            res.send({ mensaje : "Rol actualizado" });
        }else{
            res.send({ mensaje : "No se encontró el usuario" });
        }
    }catch(error){
        console.log("Error cambiando rol: " + error);
        res.send({ mensaje : "No se pudo cambiar el rol" });
    }
});

/////////////////////////////////////////////////////////////

app.post("/fabricar_incubadora", rutasProtegidas, soloAdmin, async (req, res) => {
    console.log("Solicitó fabricar_incubadora");

    let ID_MODELO = req.body.ID_MODELO;
    let ID_FIRMWARE = req.body.ID_FIRMWARE;

    try{
        let modelo = await ModeloIncubadoraModel.findOne({ "ID_MODELO" : ID_MODELO });
        if(!modelo){
            return res.send({ mensaje : "Ese modelo no existe" });
        }

        let firmware = await FirmwareVersionModel.findOne({ "ID_FIRMWARE" : ID_FIRMWARE });
        if(!firmware){
            return res.send({ mensaje : "Ese firmware no existe" });
        }

        // Año y mes de fabricación: 2026 noviembre → 2611
        let fecha = new Date();
        let aamm = String(fecha.getFullYear()).slice(-2) + String(fecha.getMonth() + 1).padStart(2, '0');

        // Código aleatorio sin letras que se confunden (sin O, 0, I, 1)
        const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let serial = "";

        for(let intento = 0; intento < 10; intento++){
            let codigo = "";
            for(let i = 0; i < 4; i++){
                codigo += caracteres[crypto.randomInt(caracteres.length)];
            }

            let candidato = "KF-" + ID_MODELO + "-" + ID_FIRMWARE + "-" + aamm + "-" + codigo;
            let repetido = await IncubadoraModel.findOne({ "numero_serie" : candidato });
            if(!repetido){
                serial = candidato;
                break;
            }
        }

        if(!serial){
            return res.send({ mensaje : "No se pudo generar un serial único, intenta de nuevo" });
        }

        let incubadora = new IncubadoraModel({
            ID_INC : "INC" + Date.now() + Math.floor(Math.random() * 1000),
            numero_serie : serial,
            ID_MODELO : ID_MODELO,
            ID_FIRMWARE : ID_FIRMWARE,
            estado : "sin asignar"
        });
        await incubadora.save();

        await registrarActividad(req.decoded.NU, "fabricó incubadora", {
            ID_INC : incubadora.ID_INC,
            nuevo : serial
        });

        res.send({ mensaje : "Incubadora registrada", numero_serie : serial });
    }catch(error){
        console.log("Error fabricando incubadora: " + error);
        res.send({ mensaje : "No se pudo registrar la incubadora" });
    }
});

//////////////////////////////////////////////

//////////////////////////////

const server = app.listen(port, () => {
  console.log("Servidor escuchando por " + port);
});