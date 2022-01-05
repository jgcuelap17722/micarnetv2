
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const pool = require("../database"); //referencia a ala base de datos
const SocketIO = require('socket.io');
const helpers = require('../lib/helpers');
const ss = require('socket.io-stream');
const fs = require('fs');
const cors = require('cors')
const app = express();
require('dotenv').config()

Consulta = (pQuery) => {
  return pool.query(pQuery);
};
app.use(cors());
app.use(morgan('dev'));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.use(express.json({limit: '50mb'}));
/* app.use(require('../routes/index')); */
app.use('/', require('../routes/index'));
app.use(express.static(path.join(__dirname, '../public')));
app.set('../views', path.join(__dirname, 'views'));
app.set("view engine", "pug");


//Configuracion
app.set('port', process.env.PORT || 2000);

const server = app.listen(app.get('port'), () => {
  console.log('server on port', app.get('port'));
});

const io = SocketIO(server);
io.on('connection', (sk_formRegister) => {
  sk_formRegister.on('solicitar_info_dni', async (pDni) => {
    if (!pDni.toString().length < 8) {
      let data = await helpers.Consulta_Dni(pDni);
      sk_formRegister.emit('recuperar_info_dni_online', data)
    }
  })
  sk_formRegister.on('obtenerVacunasYQR', async (data) => {
    const date = data.fechaNacimiento.split('/');
    const fechaNacimineto = `${date[2]}-${date[1]}-${date[0]}`;
    const queryGetVacunas = `CALL SP_GenerarBacunas(
      '${fechaNacimineto}',
      ${parseInt(data.dosis)},
      '${data.departamento}');`;

    const resQueryGetVacunas = await pool.query(queryGetVacunas);
    const vacunas = resQueryGetVacunas[0];
    console.log('Mis bacunas truchas ENTRADA', vacunas);
    vacunas.forEach(ele => {
      ele.fecha = helpers.dateIsoToString(ele.fecha);
    });
    console.log('Mis bacunas truchas SALIDA', vacunas);
    const qrB64 = helpers.crearUrlClienteNoVacunado(data.dni);
    const ouput = {vacunas, qrB64};
    sk_formRegister.emit('recibirVacunasYQR', ouput)
  })
  ss(sk_formRegister).on('file', async (stream, data) => {
    console.log('Subiendo_', data);
    let pathPDF = `${process.cwd()}\\downloads\\documents\\${Date.now()}_${data.name}`;
    
    let newPath = await new Promise(async (resolve, err) => {
      let streamOut = await stream.pipe(fs.createWriteStream(pathPDF));
      resolve(streamOut.path)
    })

    stream.on('end', async () => {
      const dataPdf = await new Promise(async(res, err) => {
        res(await helpers.getDataPdf(newPath, data));
      }) 
      // console.log('SALIDA CONSULTA', dataPdf);
      sk_formRegister.emit('enviar_info_de_pdfs', dataPdf)
    })
  });
})
io.on('connection', (sk_formDownload) => {
  sk_formDownload.on('Eliminar_archibo', async (nombreArchibo) => {
    const directory = `${process.cwd()}\\downloads\\carnets\\${nombreArchibo}`;
    fs.unlink(directory, (err) => {
      if (err) throw err;
      const directory = `${process.cwd()}\\downloads\\carnets\\`;
      fs.readdir(directory, (err, files) => {
        if (err) throw err;
        console.log(files);
        sk_formDownload.emit('Archibo_Eliminado', {data: files})
      });
    });
  })
})