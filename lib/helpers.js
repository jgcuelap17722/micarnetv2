const { Poppler } = require("node-poppler");
const pdf_parse = require("pdf-parse");
const pool = require("../database"); //referencia a ala base de datos
const axios = require("axios");
const pngjs = require("pngjs");
const sharp = require("sharp");
const jsQR = require("jsqr");
const fs = require("fs");

const helpers = {};

helpers.Consulta_Dni = async (pdni) => {
  console.log("Activando Auxiliar");
  try {
    let mi_token =
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImpnY3VlbGFwQGdtYWlsLmNvbSJ9.t6cDUspkRA3grHKMtlCq1PzTGl2nElvjFHcAIi7QBqc",
      api_url =
        "https://dniruc.apisperu.com/api/v1/dni/" +
        pdni +
        "?token=" +
        mi_token +
        "",
      /*             info_dni   = await fetch(api_url),
            respuesta    = await respuesta.json(); */
      info_dni = await axios(api_url);
    console.log("RESPUESTA_DNI", info_dni.data);
    if (info_dni.hasOwnProperty("message")) {
      console.error("MENSAGE DE ERROR --> ", info_dni);
      return "An error has occurred.";
    } else if (info_dni.data.nombres == "") {
      console.log("DNI INCORRECTO");
      return "An error has occurred.";
    } else {
      // let fullname    = '';
      // fullname    = fullname.concat(info_dni.nombres,' ',info_dni.apellidoPaterno,' ',info_dni.apellidoMaterno);
      // Convertir toda las Iniciales de texto en Mayusculas
      String.prototype.capitalize = function () {
        return this.replace(/(?:^|\s)\S/g, function (a) {
          return a.toUpperCase();
        });
      };

      // fullname    = (fullname.toLowerCase()).capitalize();
      const data = {
        nombres: info_dni.data.nombres.toUpperCase(),
        apellidoPaterno: info_dni.data.apellidoPaterno.toUpperCase(),
        apellidoMaterno: info_dni.data.apellidoMaterno.toUpperCase(),
      };
      return data;
    }
  } catch (err) {
    console.log("Algo salio mal con la consulta dni ", err);
    return "DESCONECCION";
  }
};

/**
 * @description Extrae Texto entre 2 indeces de array
 */
helpers.betweenText = (
  textoInicial,
  textoFinal,
  separador,
  text,
  typeData,
  cutLeft
) => {
  typeData = typeData || false;
  cutLeft = cutLeft || 0;
  const arrayText = text.split(separador);
  const desde = arrayText.indexOf(textoInicial);
  const hasta = arrayText.indexOf(textoFinal);
  const out = arrayText.slice(desde + 1, hasta); // array
  // console.log("betweenText__", out);
  if (typeData) return out; // array or string
  const arrayJoin = out.join(" ");
  const arrayToString = arrayJoin.substring(cutLeft); // optional cut
  return arrayToString;
};

helpers.getDataPdf = async function (pdfFile, obj) {
  obj = obj || 0;
  let readPdf = fs.readFileSync(pdfFile);
  console.log("readPdf____", readPdf);
  return new Promise((resolve, error) => {
    pdf_parse(readPdf)
      .then(async function (data) {
        const dataPdf = {};
        dataPdf.nombre = await helpers.betweenText(
          "Nombre / Name ",
          "Fecha de Nacimiento / Date of",
          "\n",
          data.text
        );
        dataPdf.fechaNacimiento = await helpers.betweenText(
          "birth  ",
          "Documento de Identidad /",
          "\n",
          data.text
        );
        dataPdf.dni = await helpers.betweenText(
          "Identification document ",
          "Nacionalidad / Nationality ",
          "\n",
          data.text,
          false,
          5
        );
        dataPdf.nacionalidad = await helpers.betweenText(
          "Nacionalidad / Nationality ",
          "Sexo / Sex  ",
          "\n",
          data.text
        );
        dataPdf.sexo = await helpers.betweenText(
          "Sexo / Sex  ",
          "Vacuna / Vaccine ",
          "\n",
          data.text
        );
        dataPdf.tipoVacuna = await helpers.betweenText(
          "Vacuna / Vaccine ",
          "Vacunado / Vaccinated",
          "\n",
          data.text
        );
        const vacunas = await helpers.betweenText(
          "Place",
          "Copyright © 2021. Desarrollado por la Oficina General de Tecnologías de la Información del Ministerio de Salud | Todos",
          "\n",
          data.text,
          true
        );
        // Separamos el array con los string de vacunas
        dataPdf.vacunas = await helpers.getVacunas(vacunas);
        dataPdf.vacunacion = true;
        dataPdf.telefono = obj.telefono;
        dataPdf.qrB64 = await helpers.extractQR64(pdfFile);
        // console.log("DATAPDF__", dataPdf);
        // ELIMINAR PDF CREADO
        resolve(dataPdf);
      })
      .catch((error) => {
        console.log("ERROR AL CONVERTIR PDF_", error);
      });
  });
};

/**
 * @author Jose Cuela
 * @description Extrae la imagen de Qr base64 de un PDF
 * @param {string} pdfFilePath - Archibo Pdf
 */
helpers.extractQR64 = async (pdfFilePath) => {
  const getDate = Date.now();
  const outputFile = `${process.cwd()}\\downloads\\${getDate}`;
  const poppler = new Poppler();

  const optionsPoppler = {
    //firstPageToConvert: 1,
    // lastPageToConvert: 1,
    pngFile: true,
    resolutionXYAxis: 300,
    singleFile: true,
    // cropBox: true,
    // cropHeight: 12,
    // cropWidth: 13,
    // cropXAxis: 300,
    // cropYAxis: 300,
  };

  // guardar el PDF como imagen
  await poppler.pdfToCairo(pdfFilePath, outputFile, optionsPoppler);

  // Leer el archibo png generado por el pdf
  const data = fs.readFileSync(`${outputFile}.png`);
  // console.log("Data__", data);

  // convertir imagen a binario
  const png = pngjs.PNG.sync.read(data);
  // console.log("png__", png);

  // Buscar el Qr en la imagen y retornar la ubicación y dimenciones
  const code = await jsQR(
    Uint8ClampedArray.from(png.data),
    png.width,
    png.height
  );

  // console.log("Cordenadas del QR", code.location);
  const dimentions = {
    left: Math.round(code.location.topLeftCorner.x),
    top: Math.round(code.location.topLeftCorner.y),
    width: Math.round(
      code.location.topRightCorner.x - code.location.topLeftCorner.x
    ),
    height: Math.round(
      code.location.bottomLeftCorner.y - code.location.topLeftCorner.y
    ),
  };
  return new Promise((resolve, reject) => {
    sharp(`${outputFile}.png`)
      .extract({
        left: dimentions.left,
        top: dimentions.top,
        width: dimentions.width,
        height: dimentions.height,
      })
      .toFile(`${outputFile}_qr.png`, async (err) => {
        if (err) console.log(err);
        const bitmapQR = fs.readFileSync(`${outputFile}_qr.png`);
        let qr64 = await Buffer.from(bitmapQR).toString("base64");
        await fs.unlinkSync(`${outputFile}_qr.png`);
        await fs.unlinkSync(`${outputFile}.png`);
        resolve(qr64);
      });
  });
};

helpers.getVacunas = (arrVacunas) => {
  const paso1 = arrVacunas.map(
    (el) =>
      `${el.slice(0, el.indexOf(")") + 1)}-v-${el.slice(el.indexOf(")") + 1)}`
  ); // separar Departamento
  const paso2 = paso1.map((el) => `${el.slice(0, 18)}-v-${el.slice(18)}`); // separar tipo vacuna
  const paso3 = paso2.map((el) => `${el.slice(0, 10)}-v-${el.slice(10)}`); // separar fecha
  const paso4 = paso3.map((el) => el.split("-v-"));
  const vacunasObj = paso4.map((el) => {
    return {
      fecha: el[0],
      dosis: el[1],
      vacuna: el[2],
      departamento: el[3],
    };
  });
  console.log("vacunasObj_", vacunasObj);
  return vacunasObj;
};

helpers.crearUrlClienteNoVacunado = (dni) => {
  return urlDefault = `publico/certificado/index?tk=v2-035be3b72fefe29b09f360880ee15ed5:349a0b59aacb772e32efa698b04c0a6a12fa7944d155f9fa907933bb${dni}`;
}

/**
 * 
 * @description Convertir 2013-08-03T02:00:00Z a 03/08/2013
 */
helpers.dateIsoToString = (dateIso) => {
  date = new Date(dateIso);
  year = date.getFullYear();
  month = date.getMonth()+1;
  dt = date.getDate();

  if (dt < 10) dt = `0${dt}`;
  if (month < 10) month = `0${month}`;

  const newDate = `${dt}/${month}/${year}`;
  console.log('Salida fecha convertida ', newDate);
  return newDate
}

module.exports = helpers;
