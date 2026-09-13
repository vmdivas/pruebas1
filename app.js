const STORAGE_KEY = "equiposTI_v2";
const CONTADOR_KEY = "actaContador_v1";
const IMPRESORAS_STORAGE_KEY = "impresorasTI_v1";
const CODIGOS_STORAGE_KEY = "codigosImpresionTI_v1";
const TICKETS_GARANTIA_STORAGE_KEY = "ticketsGarantiaTI_v1";
const MANTENIMIENTO_EQUIPOS_STORAGE_KEY = "mantenimientoEquiposTI_v1";
const CONTADORES_IMPRESORAS_STORAGE_KEY = "contadoresImpresorasTI_v1";
const SALIDAS_TONER_STORAGE_KEY = "salidasTonerTI_v1";
const INGRESOS_TONER_STORAGE_KEY = "ingresosTonerTI_v1";
const PAGE_SIZE = 50;

const $ = (id) => document.getElementById(id);

const IMPRESORA_FIELD_IDS = [
  "impId", "impTipo", "impTipoEquipoImp", "impModelo", "impSerial", "impIp",
  "impGpr", "impCodigoPrinter", "impEmpresa", "impDepartamento", "impUbicacion", "impActivoFijo",
];
const IMPRESORA_CAMPO_POR_ID = {
  impId: "id", impTipo: "tipo", impTipoEquipoImp: "tipoEquipoImp", impModelo: "modelo",
  impSerial: "serial", impIp: "ip", impGpr: "gpr", impCodigoPrinter: "codigoPrinter",
  impEmpresa: "empresa", impDepartamento: "departamento", impUbicacion: "ubicacion", impActivoFijo: "activoFijo",
};

const CODIGO_FIELD_IDS = ["codId", "codIdUsuario", "codNombre", "codClave", "codAgregadoPor"];
const CODIGO_CAMPO_POR_ID = {
  codId: "id", codIdUsuario: "idUsuario", codNombre: "nombre", codClave: "clave",
  codAgregadoPor: "agregadoPor",
};

const TICKET_GARANTIA_FIELD_IDS = [
  "tgId", "tgProveedor", "tgEquipo", "tgNumeroTicket", "tgFechaReporte", "tgFechaResolucion",
  "tgEstado", "tgDescripcionFalla", "tgComentarios",
];
const TICKET_GARANTIA_CAMPO_POR_ID = {
  tgId: "id", tgProveedor: "proveedor", tgEquipo: "equipoRef", tgNumeroTicket: "numeroTicket",
  tgFechaReporte: "fechaReporte", tgFechaResolucion: "fechaResolucion", tgEstado: "estado",
  tgDescripcionFalla: "descripcionFalla", tgComentarios: "comentarios",
};

function diasRespuestaGarantia(ticket) {
  if (!ticket.fechaReporte || !ticket.fechaResolucion) return "";
  const inicio = new Date(ticket.fechaReporte);
  const fin = new Date(ticket.fechaResolucion);
  if (isNaN(inicio) || isNaN(fin)) return "";
  const dias = Math.round((fin - inicio) / (1000 * 60 * 60 * 24));
  return dias >= 0 ? dias : "";
}

const MANTENIMIENTO_EQUIPOS_FIELD_IDS = [
  "meId", "meEquipo", "meFechaIngreso", "meFechaSalida", "meProblema",
  "meTecnico", "meObservaciones",
];
const MANTENIMIENTO_EQUIPOS_CAMPO_POR_ID = {
  meId: "id", meEquipo: "equipoRef", meFechaIngreso: "fechaIngreso", meFechaSalida: "fechaSalida",
  meProblema: "problema", meTecnico: "tecnico",
  meObservaciones: "observaciones",
};

// Stock Tóner Bodega 2 — antes era "Contador de Impresoras" (lecturas de
// contador con historial); el usuario pidió reorientarlo a un inventario de
// stock de tóner por impresora (una fila por impresora, con el tóner que usa
// y cuánto hay en bodega), así que se conserva la colección Firestore
// "contadoresImpresoras" pero con campos nuevos.
const CONTADOR_IMPRESORA_FIELD_IDS = ["ciId", "ciToner", "ciSerial", "ciModelo", "ciColor", "ciStockActual"];
const CONTADOR_IMPRESORA_CAMPO_POR_ID = {
  ciId: "id", ciToner: "toner", ciSerial: "serial", ciModelo: "modelo",
  ciColor: "color", ciStockActual: "stockActual",
};

// Ubicaciones que el usuario pidió NO migrar desde el catálogo de Impresoras
// (comparación sin distinguir mayúsculas/minúsculas ni espacios extra).
// "Flor del Campo" se quitó de esta lista: esa impresora es de Inmobiliaria
// y sí debe llevar control de Stock Tóner, igual que las demás.
const UBICACIONES_EXCLUIDAS_STOCK_TONER = ["riolsa", "san fernando", "km 98"];

// Exclusión explícita por Serial — para casos donde el campo Ubicación/
// Departamento no trae ninguna de las palabras de arriba (no se puede
// detectar por texto) pero el usuario confirmó que esa impresora puntual no
// debe migrarse a Stock Tóner Bodega 2.
const SERIALES_EXCLUIDOS_STOCK_TONER = ["23D23076"];

function normalizarTextoComparar(v) {
  return (v || "").toString().trim().toLowerCase();
}

let impresorasData = [];
let codigosData = [];
let ticketsGarantiaData = [];
let mantenimientoEquiposData = [];
let contadoresImpresorasData = [];
let salidasTonerData = [];
let ingresosTonerData = [];
let equiposTIv2Data = [];

let TECNICO_ACTUAL = "";
window.establecerTecnicoActual = (nombre) => {
  TECNICO_ACTUAL = nombre || "";
};

// Restricción de solo interfaz para el bodeguero de Bodega 2: no toca las
// reglas de Firestore (sigue teniendo acceso de lectura/escritura a nivel
// de base de datos como cualquier usuario autenticado), solo oculta el menú
// para que no se pierda entre pantallas que no usa y entra directo a
// "Stock Tóner Bodega 2". Si más adelante se necesita bloquear también la
// base de datos, hay que agregar reglas de Firestore por rol (ver CLAUDE.md).
const EMAILS_BODEGA = ["bodega2@liztex.com"];

function esCorreoBodega(correo) {
  return EMAILS_BODEGA.includes((correo || "").trim().toLowerCase());
}

// Botones de la barra superior que son de Computadoras/Equipos (no del
// menú lateral, por eso quedaban fuera del filtro anterior) — no aplican
// para el bodeguero, solo "Salir" se queda.
const IDS_BOTONES_HEADER_SOLO_IT = ["btnGenerarActa", "btnNuevoIngreso", "btnDashboard", "btnNuevo", "contadorTotal"];

const VISTAS_PERMITIDAS_BODEGA = ["contadoresImpresoras", "ingresoToner"];

window.aplicarRestriccionesPorRol = (correo) => {
  const esBodega = esCorreoBodega(correo);
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.style.display = esBodega && !VISTAS_PERMITIDAS_BODEGA.includes(btn.dataset.vista) ? "none" : "";
  });
  IDS_BOTONES_HEADER_SOLO_IT.forEach((id) => {
    const el = $(id);
    if (el) el.style.display = esBodega ? "none" : "";
  });
  if (esBodega) cambiarVista("contadoresImpresoras");
};

const FIELD_IDS = [
  "id", "nombreRed", "ubicaciones", "entidad", "empresa", "nombreEmpleado",
  "usuarioDominio", "departamento", "unidadNegocio", "codigoEmpleado",
  "tipoUsuario", "comentarios",
  "status", "tipoEquipo", "fabricante", "modelo", "numeroSerial",
  "numeroInventario", "correo", "idGlpi", "uuid", "contratos", "dpi", "ip", "ipImpresora",
  "dominio",
  "procesador", "memoria", "tipoDisco", "firmwareInventario",
  "soVersion", "soNucleo", "soSerial", "subentidades", "proyecto",
  "monitor", "numeroInventarioMonitor", "tamanoDisco",
  "nombreDispositivo", "serialDispositivo",
  "puesto", "fechaIngresoEquipo", "codigoRam", "memoriaDescripcion",
];

let equipos = [];
let paginaActual = 1;

function cargarDatos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      equipos = JSON.parse(raw);
      fusionarContratosDesdeSeed();
      return;
    } catch {
      equipos = [];
    }
  }
  equipos = typeof SEED_DATA !== "undefined" && Array.isArray(SEED_DATA) ? SEED_DATA.slice() : [];
  guardarDatos();
}

function fusionarContratosDesdeSeed() {
  // Trae datos de "contratos" agregados a SEED_DATA después de que este navegador
  // ya había guardado su propia copia en localStorage, sin pisar nada que el
  // usuario haya capturado manualmente. También agrega equipos nuevos que se
  // hayan sumado a SEED_DATA (por ejemplo, altas importadas desde un contrato)
  // y que este navegador todavía no tenga.
  if (typeof SEED_DATA === "undefined" || !Array.isArray(SEED_DATA)) return;
  const seedPorId = new Map(SEED_DATA.map((s) => [s.id, s]));
  const idsActuales = new Set(equipos.map((e) => e.id));
  let cambio = false;

  equipos.forEach((e) => {
    if (nonEmpty(e.contratos)) return;
    const seed = seedPorId.get(e.id);
    if (seed && nonEmpty(seed.contratos)) {
      e.contratos = seed.contratos;
      cambio = true;
    }
  });

  const IDS_ALTAS_NUEVAS_SEED = ["pendiente-pcriolsa005", "pendiente-bascula1"];
  // Alta masiva del contrato Lenovo 8030028191 (30 laptops + 18 desktops,
  // Tecnoelec) — cada id nuevo se sincroniza a Firestore igual que los de
  // IDS_ALTAS_NUEVAS_SEED, sin tener que listar los 48 uno por uno.
  const esAltaContrato8030028191 = (id) => (id || "").startsWith("alta-8030028191-");
  SEED_DATA.forEach((seed) => {
    if (!idsActuales.has(seed.id)) {
      equipos.push({ ...seed });
      cambio = true;
      if (IDS_ALTAS_NUEVAS_SEED.includes(seed.id) || esAltaContrato8030028191(seed.id)) sincronizarEquipo(seed);
    }
  });

  if (limpiarPendientesDuplicados()) cambio = true;
  if (corregirFechaContrato8030028059()) cambio = true;
  if (corregirSerialesTipeados()) cambio = true;
  if (sincronizarComentariosCronograma()) cambio = true;
  if (eliminarDuplicadoP025194()) cambio = true;
  if (eliminarChatarraConfirmada()) cambio = true;
  if (quitarMarcaRevisionConfirmados()) cambio = true;
  if (corregirEmpresasMalCapturadas()) cambio = true;
  if (corregirTipoEquipoMalClasificado()) cambio = true;
  if (corregirComentariosUsoRiolsa()) cambio = true;
  if (corregirEmpleadoLAPLNV315()) cambio = true;
  if (corregirDpiLAPLNV304()) cambio = true;
  if (corregirEmpleadoLAPLNV292()) cambio = true;
  if (corregirCodigosEmpleadoAlta8030028191()) cambio = true;
  if (corregirFechaIngresoAlta8030028191()) cambio = true;
  if (corregirMemoriaRamLaptopsAlta8030028191()) cambio = true;
  if (corregirNumeroInventarioLaptopsAlta8030028191()) cambio = true;
  if (corregirInfoTecnicaLaptopsAlta8030028191()) cambio = true;

  if (cambio) guardarDatos();
}

function eliminarDuplicadoP025194() {
  // "P02-5194 bod2" se agregó por error como equipo nuevo del cronograma AD,
  // pero es el mismo equipo físico que ya existía como "P02-5194". Si un
  // navegador ya lo tenía guardado en localStorage antes de esta corrección,
  // SEED_DATA ya no lo trae, así que hay que quitarlo explícitamente.
  const antes = equipos.length;
  equipos = equipos.filter((e) => e.id !== "cronograma-4");
  const cambio = equipos.length !== antes;
  if (cambio) sincronizarEliminacion("cronograma-4");
  return cambio;
}

const IDS_CHATARRA_CONFIRMADA = [
  // Documentacion_Chatarra_300424.pdf
  "seed-30", "seed-394", "seed-432", "seed-755",
  // Listado_Equipos_Chatarra_200226.pdf
  "seed-8", "seed-21", "seed-26", "seed-32", "seed-34", "seed-433", "seed-434",
  "seed-441", "seed-443", "seed-445", "seed-452", "seed-453", "seed-454",
  "seed-455", "seed-458", "seed-459", "seed-497", "seed-500", "seed-511",
  "seed-512", "seed-734", "seed-752", "seed-758", "seed-773", "seed-797", "seed-799",
  // Registro_todo.pdf: equipos sin uso por fallas (bateria, pantalla, teclado, etc.)
  "seed-65", "seed-68", "seed-71", "seed-98", "seed-107", "seed-114", "seed-115",
  "seed-119", "seed-342", "seed-361",
  // Registro_todo1.pdf: "LAPTOS DE BODEGA" no funcionales
  "seed-99", "seed-108", "seed-112", "seed-345", "seed-346", "seed-357", "seed-367",
  "seed-376", "seed-380", "seed-383", "seed-386", "seed-439", "seed-771", "seed-795",
  // Status "Devolucion > Baja de Equipo" dentro de los equipos en revision
  "seed-1", "seed-5", "seed-12", "seed-13", "seed-60", "seed-347", "seed-365",
  "seed-399", "seed-400", "seed-403", "seed-504", "seed-505", "seed-517", "seed-772",
  // PENDIENTE- del contrato 8030028059: las 5 laptops ya se entregaron y
  // tienen su registro real con nombre/empleado, estos placeholders sobran
  "pendiente-pf6686wt", "pendiente-pf662c4r", "pendiente-pf65l51z",
  "pendiente-pf66acc4", "pendiente-pf661gjy",
];

function eliminarChatarraConfirmada() {
  // Confirmados contra los listados de chatarra proporcionados (coincidencia
  // exacta de serial o activo fijo). Al igual que con el duplicado P02-5194,
  // hay que quitarlos explícitamente de cualquier navegador que ya los
  // tuviera guardados, ya que SEED_DATA dejó de traerlos.
  const antes = equipos.length;
  equipos = equipos.filter((e) => !IDS_CHATARRA_CONFIRMADA.includes(e.id));
  const cambio = equipos.length !== antes;
  if (cambio) IDS_CHATARRA_CONFIRMADA.forEach((id) => sincronizarEliminacion(id));
  return cambio;
}

const IDS_CONFIRMADOS_ACTIVOS = [
  // laptop.pdf: equipos por sede que siguen activos, se les quita "en revision"
  "seed-18", "seed-27", "seed-49", "seed-50", "seed-118", "seed-354",
  "seed-379", "seed-405", "seed-461", "seed-766", "seed-774",
  // deskmark.pdf: desktops por sede confirmados activos
  "seed-402", "seed-456", "seed-739",
  // dsk.pdf: desktops de Riolsa/Mixco/San Rafael confirmados activos
  "seed-42", "seed-393", "seed-733", "seed-735", "seed-736", "seed-737",
  "seed-738", "seed-742", "seed-743", "seed-770", "seed-775",
  // LAPLNV283: confirmado activo, es una de las 5 laptops LAPLNV283-287
  // entregadas y ya sincronizadas desde la computadora de la oficina
  "seed-335",
];

function quitarMarcaRevisionConfirmados() {
  // Estos equipos aparecían marcados como "no aparece en el cronograma AD",
  // pero un registro de equipos activos por sede confirmó que sí siguen en
  // uso. Se les quita la marca sin tocar el resto del comentario, y se
  // actualiza la fecha para que la corrección se propague a otros
  // navegadores/Firestore.
  const MARCA_CRONOGRAMA_COMPLETA = "Pendiente validar: no aparece en el cronograma de migracion AD 2026; posible equipo sin dar de baja.";
  let cambio = false;
  equipos.forEach((e) => {
    if (!IDS_CONFIRMADOS_ACTIVOS.includes(e.id)) return;
    const actual = e.comentarios || "";
    if (!actual.includes(MARCA_CRONOGRAMA_COMPLETA)) return;
    e.comentarios = actual
      .replace(MARCA_CRONOGRAMA_COMPLETA, "")
      .replace(/^\s*\|\s*/, "")
      .replace(/\s*\|\s*$/, "")
      .trim();
    // No se toca ultimaModificacion ni se empuja a Firestore aqui: forzar una
    // fecha "reciente" podia hacer que una copia local vieja/incompleta le
    // ganara en la fusion a una edicion real mas nueva de otro navegador,
    // borrando esa informacion. Esta correccion solo arregla la vista local;
    // si el equipo ya tiene datos buenos en la nube, esos prevalecen.
    cambio = true;
  });
  return cambio;
}

const CORRECCIONES_EMPRESA = {
  "seed-201": "Breemer",
  "seed-494": "Tennat",
  "seed-599": "MALVERTH S.A",
  "seed-667": "Tennat",
  "seed-739": "RIOL S.A.",
};

function corregirEmpresasMalCapturadas() {
  // Estos 4 equipos tenian un departamento (Informatica, Textil > Engomadora,
  // Inmobiliaria > Administración Flores Del Lago) o un typo (Tenant) en el
  // campo empresa. Forzamos la correccion aunque el campo ya tenga un valor
  // guardado, igual que con los seriales tipeados. No se toca
  // ultimaModificacion ni se empuja a Firestore (ver nota en
  // quitarMarcaRevisionConfirmados): esto es solo un arreglo de la vista
  // local, para no arriesgar sobrescribir una edicion real mas nueva.
  let cambio = false;
  equipos.forEach((e) => {
    const nueva = CORRECCIONES_EMPRESA[e.id];
    if (!nueva || (e.empresa || "").trim() === nueva) return;
    e.empresa = nueva;
    cambio = true;
  });
  return cambio;
}

const CORRECCIONES_COMENTARIO_USO = {
  "seed-735": "Uso reportado (archivo de equipos activos RIOLSA): Mantenimiento de riegos.",
  "seed-770": "Uso reportado (archivo de equipos activos RIOLSA): Monitoreo de velocidades de cosechadoras.",
};

function corregirComentariosUsoRiolsa() {
  // PCRIOL016 y RIOLSA016 estan asignados a Saulo Rendon en GLPI, pero su
  // usuarioDominio/correo son cuentas funcionales compartidas (Mantenimiento
  // Riegos, monitoreovelocidades@riolcorp.com). El archivo de equipos activos
  // de RIOLSA los describe por su uso y no por una persona, asi que se deja
  // constancia en comentarios sin tocar nombreEmpleado (no hay certeza de
  // cual nombre es el correcto, y sobrescribirlo arriesgaria perder el dato
  // real). No se toca ultimaModificacion ni se empuja a Firestore, igual que
  // las demas correcciones locales de esta lista.
  let cambio = false;
  equipos.forEach((e) => {
    const nota = CORRECCIONES_COMENTARIO_USO[e.id];
    if (!nota || (e.comentarios || "").includes(nota)) return;
    e.comentarios = nota;
    cambio = true;
  });
  return cambio;
}

const CORRECCIONES_TIPO_EQUIPO = {
  "seed-598": "Mini PC",
  "seed-800": "Mini PC",
  "pendiente-mj0h51jj": "Mini PC",
};

function corregirTipoEquipoMalClasificado() {
  // PCLNV087 y UNIFILARDELCAMPO son ThinkCentre M70q/M75q Gen 2 (linea "Tiny"
  // de Lenovo, un Mini PC), y PENDIENTE-MJ0H51JJ es el mismo modelo segun su
  // comentario, pero los 3 estaban clasificados como Desktop. Forzamos la
  // correccion aunque el campo ya tenga un valor guardado. No se toca
  // ultimaModificacion ni se empuja a Firestore (ver nota en
  // quitarMarcaRevisionConfirmados): un registro como PENDIENTE-MJ0H51JJ
  // puede haberse completado con datos reales en otro navegador, y forzar
  // aqui una fecha "reciente" le haria ganar a esa edicion real y borrarla.
  let cambio = false;
  equipos.forEach((e) => {
    const nuevo = CORRECCIONES_TIPO_EQUIPO[e.id];
    if (!nuevo || (e.tipoEquipo || "").trim() === nuevo) return;
    e.tipoEquipo = nuevo;
    cambio = true;
  });
  return cambio;
}

function corregirSerialesTipeados() {
  // PCLNV125 y PCLNV228 se capturaron con el serial mal digitado, por lo que
  // nunca coincidieron con su contrato al importar. Forzamos la corrección
  // aunque el campo ya tenga un valor guardado.
  const CORRECCIONES = {
    PCLNV125: { viejo: "MJH051N0", nuevo: "MJ0H51N0" },
    PCLNV228: { viejo: "MZ01XHXH", nuevo: "MZ01XHX" },
  };
  let cambio = false;
  equipos.forEach((e) => {
    const c = CORRECCIONES[(e.nombreRed || "").trim()];
    if (c && (e.numeroSerial || "").trim() === c.viejo) {
      e.numeroSerial = c.nuevo;
      cambio = true;
    }
  });
  return cambio;
}

function limpiarPendientesDuplicados() {
  // Un "PENDIENTE-<serie>" que se agregó automáticamente puede resultar ser el
  // mismo equipo físico que un registro real que el usuario ya tenía capturado
  // con nombre propio (por ejemplo, un equipo dado de alta antes de importar
  // contratos). Si comparten número de serial, nos quedamos con el real.
  const seriesReales = new Set(
    equipos
      .filter((e) => nonEmpty(e.numeroSerial) && !(e.nombreRed || "").startsWith("PENDIENTE-"))
      .map((e) => e.numeroSerial.trim().toUpperCase())
  );
  const antes = equipos.length;
  equipos = equipos.filter((e) => {
    const esPendiente = (e.nombreRed || "").startsWith("PENDIENTE-");
    const serial = (e.numeroSerial || "").trim().toUpperCase();
    return !(esPendiente && serial && seriesReales.has(serial));
  });
  return equipos.length !== antes;
}

function corregirFechaContrato8030028059() {
  // El contrato 8030028059 se guardó una vez con una fecha de vencimiento
  // equivocada (30/10/2029) antes de corregirla a la real (01/01/2027).
  // Forzamos la corrección aunque el campo ya tenga un valor guardado.
  const VIEJO = "8030028059 (vence 30/10/2029)";
  const NUEVO = "8030028059 (vence 01/01/2027)";
  let cambio = false;
  equipos.forEach((e) => {
    if ((e.contratos || "").trim() === VIEJO) {
      e.contratos = NUEVO;
      cambio = true;
    }
  });
  return cambio;
}

// LAPLNV315 (alta del contrato Lenovo 8030028191) se publicó una vez con
// "Ofelia Bedoya" como empleado — no aparecía en el padrón de empleados, y el
// usuario confirmó que en realidad corresponde a Edwin Roberto Ayala Manrique
// (Director legal, CORP-Legal, Breemer). Como ese registro ya se sincronizó a
// Firestore con el dato viejo, no basta con corregir SEED_DATA: hay que
// forzar la corrección aquí y volver a sincronizarlo. Se aplica una sola vez
// (si ya se corrigió, o si alguien lo editó a mano después, no vuelve a tocarlo).
function corregirEmpleadoLAPLNV315() {
  const equipo = equipos.find((e) => e.id === "alta-8030028191-LAPLNV315");
  if (!equipo || equipo.nombreEmpleado !== "Ofelia Bedoya") return false;
  equipo.nombreEmpleado = "Edwin Roberto Ayala Manrique";
  equipo.puesto = "Director legal";
  equipo.departamento = "CORP-Legal";
  equipo.empresa = "Breemer";
  equipo.dpi = "2523738710101";
  equipo.comentarios = 'Corregido: el Excel de Lenovo traia "Ofelia Bedoya" (no encontrada en el padron); el usuario confirmo que corresponde a Edwin Roberto Ayala Manrique.';
  equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);
  sincronizarEquipo(equipo);
  return true;
}

// LAPLNV304 (Mario Walter Leiva, alta del contrato Lenovo 8030028191) no
// aparecía en el padrón de empleados al momento del alta — el usuario dio su
// DPI directamente. Igual que con LAPLNV315, ese registro ya se había
// sincronizado a Firestore sin DPI, así que hay que forzar la corrección y
// volver a sincronizarlo. Se aplica una sola vez.
function corregirDpiLAPLNV304() {
  const equipo = equipos.find((e) => e.id === "alta-8030028191-LAPLNV304");
  if (!equipo || equipo.dpi) return false;
  equipo.dpi = "3269522331015";
  equipo.comentarios = "DPI confirmado por el usuario (Mario Walter Leiva no aparecia en el padron de empleados al momento del alta).";
  equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);
  sincronizarEquipo(equipo);
  return true;
}

// LAPLNV292 (alta del contrato Lenovo 8030028191) quedó con "Jose Jimenez"
// sin DPI porque había 3 candidatos con ese nombre en el padrón y ninguno
// tenía el Puesto exacto del Excel de Lenovo ("Supervisor de Cuadrillas
// Guatemala"). El usuario confirmó con el código SAP (Nº pers. 10000551)
// que es Jose Adonias Jimenez Mejia. Mismo patrón: ya se había publicado y
// sincronizado sin DPI, así que se fuerza y se vuelve a sincronizar.
function corregirEmpleadoLAPLNV292() {
  const equipo = equipos.find((e) => e.id === "alta-8030028191-LAPLNV292");
  if (!equipo || equipo.dpi) return false;
  equipo.nombreEmpleado = "Jose Adonias Jimenez Mejia";
  equipo.puesto = "Supervisor de Lineas de Transmisión";
  equipo.departamento = "EN-Lineas de transmisión";
  equipo.empresa = "Terter";
  equipo.dpi = "2523779660101";
  equipo.codigoEmpleado = "10000551";
  equipo.comentarios = "Identificado por el usuario via codigo SAP (Nº pers. 10000551) contra el padron de empleados.";
  equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);
  sincronizarEquipo(equipo);
  return true;
}

// Código de empleado (código SAP / Nº pers.) de los 37 equipos del alta del
// contrato Lenovo 8030028191 que ya tenían DPI confirmado contra el padrón
// de empleados — se cruzó cada DPI contra la columna "Nº pers." del mismo
// padrón para completar este dato. Ya se habían publicado y sincronizado
// sin código, así que se fuerza y se vuelve a sincronizar (mismo patrón que
// las demás correcciones de esta alta). Se aplica una sola vez por equipo.
const CODIGOS_EMPLEADO_ALTA_8030028191 = { LAPLNV289: "10002788", LAPLNV290: "10005952", LAPLNV291: "10001243", LAPLNV293: "10000405", LAPLNV294: "10002234", LAPLNV295: "10000681", LAPLNV296: "10000390", LAPLNV298: "10006697", LAPLNV299: "10002210", LAPLNV301: "10001540", LAPLNV302: "10001199", LAPLNV303: "10005100", LAPLNV305: "10004547", LAPLNV306: "10002211", LAPLNV307: "10002286", LAPLNV309: "10000588", LAPLNV310: "10000042", LAPLNV311: "10006727", LAPLNV312: "10001046", LAPLNV313: "10005140", LAPLNV314: "10001966", LAPLNV315: "10004536", PCLNV230: "10004541", PCLNV231: "10004541", PCLNV232: "10004541", PCLNV233: "10002221", PCLNV234: "10000136", PCLNV235: "10000355", PCLNV236: "10005461", PCLNV237: "10002084", PCLNV238: "10006054", PCLNV239: "10002070", PCLNV240: "10001877", PCLNV241: "10005212", PCLNV242: "10001875", PCLNV243: "10002459", PCLNV244: "10000716", PCLNV245: "10002621" };

function corregirCodigosEmpleadoAlta8030028191() {
  let cambio = false;
  Object.entries(CODIGOS_EMPLEADO_ALTA_8030028191).forEach(([nombreRed, codigo]) => {
    const equipo = equipos.find((e) => e.id === `alta-8030028191-${nombreRed}`);
    if (!equipo || equipo.codigoEmpleado) return;
    equipo.codigoEmpleado = codigo;
    equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);
    sincronizarEquipo(equipo);
    cambio = true;
  });
  return cambio;
}

// Fecha de Ingreso (equipo) del alta del contrato Lenovo 8030028191: es la
// fecha en que Tecnoelec entregó físicamente los 48 equipos, 11/09/2026 —
// no se había capturado al momento del alta. Ya estaban publicados y
// sincronizados sin este dato, así que se fuerza y se vuelve a sincronizar.
function corregirFechaIngresoAlta8030028191() {
  let cambio = false;
  equipos.forEach((e) => {
    if (!(e.id || "").startsWith("alta-8030028191-") || e.fechaIngresoEquipo) return;
    e.fechaIngresoEquipo = "2026-09-11";
    e.ultimaModificacion = new Date().toISOString().slice(0, 16);
    sincronizarEquipo(e);
    cambio = true;
  });
  return cambio;
}

// Memoria RAM de las 30 laptops del alta del contrato Lenovo 8030028191:
// mismo módulo en las 30 (KINGSTON 16GB DDR5 5600MT/S SODIMM, código
// KCP556SS8-15), confirmado por el usuario contra la Tarjeta de
// Responsabilidad impresa. Solo cambia el dato del empleado por equipo, la
// RAM es igual en todas. Ya estaban publicadas sin este dato, se fuerza y
// se vuelve a sincronizar.
function corregirMemoriaRamLaptopsAlta8030028191() {
  let cambio = false;
  equipos.forEach((e) => {
    if (!(e.id || "").startsWith("alta-8030028191-") || e.tipoEquipo !== "Notebook" || e.memoriaDescripcion) return;
    e.memoriaDescripcion = "KINGSTON 16GB DDR5 5600MT/S SODIMM";
    e.codigoRam = "KCP556SS8-15";
    e.ultimaModificacion = new Date().toISOString().slice(0, 16);
    sincronizarEquipo(e);
    cambio = true;
  });
  return cambio;
}

// El usuario pidió vaciar "Número de inventario" en las 30 laptops del alta
// del contrato Lenovo 8030028191 (ahí se había puesto el # de Placa del
// Excel de Lenovo, que no es el activo fijo real). Solo se limpia si el
// valor sigue siendo exactamente ese # de Placa original — si el usuario ya
// lo cambió a mano por el activo fijo real, no se toca. Ya estaban
// publicadas con ese dato, se fuerza y se vuelve a sincronizar.
const PLACAS_ORIGINALES_LAPTOPS_ALTA_8030028191 = { LAPLNV289: "0018770", LAPLNV290: "0018771", LAPLNV291: "0018772", LAPLNV292: "0018773", LAPLNV293: "0018774", LAPLNV294: "0018775", LAPLNV295: "0018776", LAPLNV296: "0018777", LAPLNV297: "0018778", LAPLNV298: "0018779", LAPLNV299: "0018780", LAPLNV300: "0018781", LAPLNV301: "0018782", LAPLNV302: "0018783", LAPLNV303: "0018784", LAPLNV304: "0018785", LAPLNV305: "0018786", LAPLNV306: "0018787", LAPLNV307: "0018788", LAPLNV308: "0018789", LAPLNV309: "0018790", LAPLNV310: "0018791", LAPLNV311: "0018792", LAPLNV312: "0018793", LAPLNV313: "0018794", LAPLNV314: "0018795", LAPLNV315: "0018796", LAPLNV316: "0018797", LAPLNV317: "0018798", LAPLNV318: "0018799" };

function corregirNumeroInventarioLaptopsAlta8030028191() {
  let cambio = false;
  Object.entries(PLACAS_ORIGINALES_LAPTOPS_ALTA_8030028191).forEach(([nombreRed, placaOriginal]) => {
    const equipo = equipos.find((e) => e.id === `alta-8030028191-${nombreRed}`);
    if (!equipo || equipo.numeroInventario !== placaOriginal) return;
    equipo.numeroInventario = "";
    equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);
    sincronizarEquipo(equipo);
    cambio = true;
  });
  return cambio;
}

// Procesador/Memoria/Versión de SO iguales en las 30 laptops del alta del
// contrato Lenovo 8030028191 (mismo modelo, misma configuración de fábrica),
// confirmado por el usuario contra la ficha de una de ellas. Ya estaban
// publicadas sin este dato, se fuerza y se vuelve a sincronizar.
function corregirInfoTecnicaLaptopsAlta8030028191() {
  let cambio = false;
  equipos.forEach((e) => {
    if (!(e.id || "").startsWith("alta-8030028191-") || e.tipoEquipo !== "Notebook" || e.procesador) return;
    e.procesador = "INTEL CORE ULTRA 5 22";
    e.memoria = "32 Gb";
    e.soVersion = "64 bits - 25H2";
    e.ultimaModificacion = new Date().toISOString().slice(0, 16);
    sincronizarEquipo(e);
    cambio = true;
  });
  return cambio;
}

function sincronizarComentariosCronograma() {
  // La marca "Pendiente validar: no aparece en el cronograma..." se agregó a
  // SEED_DATA después de que muchos navegadores ya tenían su propia copia en
  // localStorage, así que nunca la recibieron. La sincronizamos anexándola
  // al comentario existente, sin pisar nada que el usuario haya escrito. No
  // se toca ultimaModificacion ni se empuja a Firestore: forzar una fecha
  // "reciente" podia hacer que una copia local vieja le gane en la fusion a
  // una edicion real mas nueva de ese mismo equipo (le paso a
  // PENDIENTE-MJ0H51JJ), borrando esa informacion.
  if (typeof SEED_DATA === "undefined" || !Array.isArray(SEED_DATA)) return false;
  const MARCA_CRONOGRAMA = "Pendiente validar: no aparece en el cronograma de migracion AD 2026; posible equipo sin dar de baja.";
  const idsConMarca = new Set(
    SEED_DATA.filter((s) => (s.comentarios || "").includes(MARCA_CRONOGRAMA)).map((s) => s.id)
  );
  let cambio = false;
  equipos.forEach((e) => {
    if (!idsConMarca.has(e.id)) return;
    const actual = (e.comentarios || "").trim();
    if (actual.includes(MARCA_CRONOGRAMA)) return;
    e.comentarios = actual ? `${actual} | ${MARCA_CRONOGRAMA}` : MARCA_CRONOGRAMA;
    cambio = true;
  });
  return cambio;
}

function guardarDatos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(equipos));
}

/* ---------- Sincronización en línea (Firestore, ver firestore-sync.js) ---------- */
/* Estas funciones las usa firestore-sync.js para leer/reemplazar el arreglo
   "equipos" desde un módulo aparte, y para reflejar en línea cada cambio que
   se hace aquí, sin depender de que ese servicio esté disponible. */

function obtenerEquiposActuales() {
  return equipos;
}

function establecerEquiposDesdeSync(remotos) {
  // No reemplazamos sin más: si esta computadora tiene equipos que Firestore
  // todavía no conoce (porque se capturaron antes de sincronizar, o mientras
  // estaba sin internet), los conservamos y los subimos, en vez de perderlos.
  const remotosPorId = new Map(remotos.map((e) => [e.id, e]));
  const combinados = [];
  const idsVistos = new Set();

  equipos.forEach((local) => {
    idsVistos.add(local.id);
    const remoto = remotosPorId.get(local.id);
    if (!remoto || (local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarEquipo(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsVistos.has(remoto.id)) combinados.push(remoto);
  });

  equipos = combinados;
  eliminarDuplicadoP025194();
  eliminarChatarraConfirmada();
  quitarMarcaRevisionConfirmados();
  corregirEmpresasMalCapturadas();
  corregirTipoEquipoMalClasificado();
  corregirComentariosUsoRiolsa();
  guardarDatos();
  poblarFiltrosYDatalists();
  render();
  refrescarVistasSecundarias();
}

function sincronizarEquipo(equipo) {
  if (window.FirestoreSync && typeof window.FirestoreSync.guardarEquipo === "function") {
    window.FirestoreSync.guardarEquipo(equipo);
  }
}

function sincronizarEliminacion(id) {
  if (window.FirestoreSync && typeof window.FirestoreSync.eliminarEquipo === "function") {
    window.FirestoreSync.eliminarEquipo(id);
  }
}

/* ---------- Catálogo de impresoras (editable, ver impresoras-sync.js) ---------- */

function cargarImpresoras() {
  const raw = localStorage.getItem(IMPRESORAS_STORAGE_KEY);
  if (raw) {
    try {
      impresorasData = JSON.parse(raw);
      return;
    } catch {
      impresorasData = [];
    }
  }
  // Primera vez que corre en este navegador: se siembra desde el catálogo
  // estático (impresoras.js) para no perder los datos que ya existían ahí.
  const semilla = typeof CATALOGO_IMPRESORAS !== "undefined" && Array.isArray(CATALOGO_IMPRESORAS) ? CATALOGO_IMPRESORAS : [];
  impresorasData = semilla.map((p, i) => ({ ...p, id: p.id || `semilla-${i}` }));
  guardarImpresoras();
}

function guardarImpresoras() {
  localStorage.setItem(IMPRESORAS_STORAGE_KEY, JSON.stringify(impresorasData));
}

function obtenerImpresorasActuales() {
  return impresorasData;
}

function establecerImpresorasDesdeSync(remotas) {
  const remotasPorId = new Map(remotas.map((p) => [p.id, p]));
  const combinadas = [];
  const idsVistos = new Set();

  impresorasData.forEach((local) => {
    idsVistos.add(local.id);
    const remota = remotasPorId.get(local.id);
    if (!remota || (local.ultimaModificacion || "") > (remota.ultimaModificacion || "")) {
      combinadas.push(local);
      sincronizarImpresora(local);
    } else {
      combinadas.push(remota);
    }
  });

  remotas.forEach((remota) => {
    if (!idsVistos.has(remota.id)) combinadas.push(remota);
  });

  impresorasData = combinadas;
  guardarImpresoras();
  poblarFiltrosYDatalists();
  refrescarVistasSecundarias();
}

function sincronizarImpresora(impresora) {
  if (window.FirestoreSyncImpresoras && typeof window.FirestoreSyncImpresoras.guardarImpresora === "function") {
    window.FirestoreSyncImpresoras.guardarImpresora(impresora);
  }
}

function sincronizarEliminacionImpresora(id) {
  if (window.FirestoreSyncImpresoras && typeof window.FirestoreSyncImpresoras.eliminarImpresora === "function") {
    window.FirestoreSyncImpresoras.eliminarImpresora(id);
  }
}

/* ---------- Contador de Impresoras (lecturas para pedir cartuchos/insumos, ver contadores-impresoras-sync.js) ---------- */

function cargarContadoresImpresoras() {
  try {
    contadoresImpresorasData = JSON.parse(localStorage.getItem(CONTADORES_IMPRESORAS_STORAGE_KEY)) || [];
  } catch (err) {
    contadoresImpresorasData = [];
  }
}

function guardarContadoresImpresoras() {
  localStorage.setItem(CONTADORES_IMPRESORAS_STORAGE_KEY, JSON.stringify(contadoresImpresorasData));
}

function obtenerContadoresImpresorasActuales() {
  return contadoresImpresorasData;
}

function establecerContadoresImpresorasDesdeSync(remotos) {
  const remotosPorId = new Map(remotos.map((r) => [r.id, r]));
  const combinados = [];
  const idsLocales = new Set();

  contadoresImpresorasData.forEach((local) => {
    idsLocales.add(local.id);
    const remoto = remotosPorId.get(local.id);
    // Si ya no está en lo remoto es porque se eliminó (acá o en otro
    // navegador) — antes esto se interpretaba como "lo local es más nuevo,
    // hay que volver a subirlo", lo cual RESUCITABA cualquier fila que se
    // borrara mientras otro navegador la tuviera cacheada. No hay que
    // reconciliar contra un id que ya no existe: simplemente se descarta.
    if (!remoto) return;
    if ((local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarContadorImpresora(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsLocales.has(remoto.id)) combinados.push(remoto);
  });

  // Ya no hay "fecha" en este modelo (dejó de ser un historial de lecturas) —
  // se ordena por Toner y luego Serial para que la lista sea legible.
  contadoresImpresorasData = combinados.sort(
    (a, b) => (a.toner || "").localeCompare(b.toner || "") || (a.serial || "").localeCompare(b.serial || "")
  );
  guardarContadoresImpresoras();
  refrescarVistasSecundarias();
}

function sincronizarContadorImpresora(registro) {
  if (window.FirestoreSyncContadoresImpresoras && typeof window.FirestoreSyncContadoresImpresoras.guardarContadorImpresora === "function") {
    window.FirestoreSyncContadoresImpresoras.guardarContadorImpresora(registro);
  }
}

function sincronizarEliminacionContadorImpresora(id) {
  if (window.FirestoreSyncContadoresImpresoras && typeof window.FirestoreSyncContadoresImpresoras.eliminarContadorImpresora === "function") {
    window.FirestoreSyncContadoresImpresoras.eliminarContadorImpresora(id);
  }
}

let contadorImpresoraActualId = null;

function abrirModalContadorImpresora(registro) {
  contadorImpresoraActualId = registro ? registro.id : null;
  CONTADOR_IMPRESORA_FIELD_IDS.forEach((fieldId) => {
    const campo = CONTADOR_IMPRESORA_CAMPO_POR_ID[fieldId];
    $(fieldId).value = (registro && registro[campo]) || "";
  });
  $("btnEliminarModalContadorImpresora").style.display = registro ? "" : "none";
  $("modalContadorImpresoraOverlay").style.display = "flex";
}

function cerrarModalContadorImpresora() {
  contadorImpresoraActualId = null;
  $("modalContadorImpresoraOverlay").style.display = "none";
}

function onSubmitContadorImpresora(e) {
  e.preventDefault();
  const nuevoRegistro = {};
  CONTADOR_IMPRESORA_FIELD_IDS.forEach((fieldId) => {
    const campo = CONTADOR_IMPRESORA_CAMPO_POR_ID[fieldId];
    nuevoRegistro[campo] = $(fieldId).value.trim();
  });

  if (!nuevoRegistro.toner) {
    alert("Indica el Toner");
    return;
  }
  if (!nuevoRegistro.serial) {
    alert("Indica el Serial de la impresora");
    return;
  }

  nuevoRegistro.ultimaModificacion = new Date().toISOString().slice(0, 16);

  let guardado;
  if (!contadorImpresoraActualId) {
    nuevoRegistro.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    contadoresImpresorasData.unshift(nuevoRegistro);
    guardado = nuevoRegistro;
  } else {
    const idx = contadoresImpresorasData.findIndex((r) => r.id === contadorImpresoraActualId);
    if (idx !== -1) contadoresImpresorasData[idx] = { ...contadoresImpresorasData[idx], ...nuevoRegistro };
    guardado = contadoresImpresorasData[idx];
  }
  guardarContadoresImpresoras();
  sincronizarContadorImpresora(guardado);
  refrescarVistasSecundarias();
  cerrarModalContadorImpresora();
}

function eliminarRegistroContadorImpresoraActual() {
  if (!contadorImpresoraActualId) return;
  if (!confirm("¿Eliminar este registro de stock de tóner?")) return;
  const idx = contadoresImpresorasData.findIndex((r) => r.id === contadorImpresoraActualId);
  if (idx !== -1) {
    const id = contadoresImpresorasData[idx].id;
    contadoresImpresorasData.splice(idx, 1);
    guardarContadoresImpresoras();
    sincronizarEliminacionContadorImpresora(id);
    refrescarVistasSecundarias();
    cerrarModalContadorImpresora();
  }
}

/* ---------- Salidas de Tóner (vales entregados al bodeguero, ver salidas-toner-sync.js) ---------- */
// Cada salida rebaja automáticamente el Stock Actual del Tóner exacto
// (incluye el color, si aplica) del que salió — así el bodeguero nunca
// tiene que restar a mano en el Resumen.

function cargarSalidasToner() {
  try {
    salidasTonerData = JSON.parse(localStorage.getItem(SALIDAS_TONER_STORAGE_KEY)) || [];
  } catch (err) {
    salidasTonerData = [];
  }
}

function guardarSalidasToner() {
  localStorage.setItem(SALIDAS_TONER_STORAGE_KEY, JSON.stringify(salidasTonerData));
}

function obtenerSalidasTonerActuales() {
  return salidasTonerData;
}

function establecerSalidasTonerDesdeSync(remotos) {
  const remotosPorId = new Map(remotos.map((r) => [r.id, r]));
  const combinados = [];
  const idsLocales = new Set();

  salidasTonerData.forEach((local) => {
    idsLocales.add(local.id);
    const remoto = remotosPorId.get(local.id);
    // Igual que con Stock Tóner: si ya no está en lo remoto es porque se
    // eliminó — no hay que resucitarlo tratándolo como "más nuevo".
    if (!remoto) return;
    if ((local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarSalidaToner(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsLocales.has(remoto.id)) combinados.push(remoto);
  });

  salidasTonerData = combinados.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  guardarSalidasToner();
  renderSalidasToner();
}

function sincronizarSalidaToner(registro) {
  if (window.FirestoreSyncSalidasToner && typeof window.FirestoreSyncSalidasToner.guardarSalidaToner === "function") {
    window.FirestoreSyncSalidasToner.guardarSalidaToner(registro);
  }
}

function sincronizarEliminacionSalidaToner(id) {
  if (window.FirestoreSyncSalidasToner && typeof window.FirestoreSyncSalidasToner.eliminarSalidaToner === "function") {
    window.FirestoreSyncSalidasToner.eliminarSalidaToner(id);
  }
}

// Suma (o resta, con delta negativo) al Stock Actual de un Tóner exacto
// (texto completo, incluye color) — se usa al registrar/editar/eliminar una
// Salida, para no tener que tocar el Resumen a mano.
function ajustarStockToner(tonerTexto, delta) {
  if (!delta) return;
  const clave = normalizarTextoComparar(tonerTexto);
  if (!clave) return;
  const filaConStock = contadoresImpresorasData.find((c) => normalizarTextoComparar(c.toner) === clave);
  const actual = filaConStock ? Number(filaConStock.stockActual) || 0 : 0;
  actualizarStockDeToner(clave, String(actual + delta));
}

// Al elegir/escribir el Serial: autocompleta Modelo/Ubicación desde el
// catálogo de Impresoras (informativo, de solo lectura) y llena el
// desplegable de Toner solo con las variantes que de verdad le sirven a esa
// impresora (una por color, o una sola si es B/N), mostrando su stock.
// `tonerPreseleccionado` se usa al elegir una sugerencia del buscador (ver
// renderSugerenciasSalidaToner) para dejar marcado exactamente el Toner/color
// que se buscó, en vez del primero de la lista.
function poblarCamposSalidaToner(prefijo, tonerPreseleccionado) {
  const serial = $(`${prefijo}Serial`).value.trim();
  const claveSerial = normalizarTextoComparar(serial);
  const impresora = impresorasData.find((p) => normalizarTextoComparar(p.serial) === claveSerial);
  $(`${prefijo}Modelo`).value = impresora ? impresora.modelo || "" : "";
  $(`${prefijo}Ubicacion`).value = impresora ? impresora.ubicacion || "" : "";

  const opciones = contadoresImpresorasData.filter((c) => normalizarTextoComparar(c.serial) === claveSerial);
  const select = $(`${prefijo}Toner`);
  const valorPrevio = tonerPreseleccionado ?? select.value;
  select.innerHTML = opciones.length
    ? opciones.map((c) => `<option value="${esc(c.toner)}">${esc(c.toner)} (stock: ${esc(c.stockActual || 0)})</option>`).join("")
    : `<option value="">Sin Toner registrado para este Serial</option>`;
  if (opciones.some((c) => c.toner === valorPrevio)) select.value = valorPrevio;
}

// Buscador único de Serial/Modelo/Toner para el formulario de Salidas —
// mismo patrón que el autocompletado de Monitor (ver renderSugerenciasMonitor):
// el bodeguero muchas veces solo sabe uno de los tres datos, así que se busca
// por cualquiera de ellos y al elegir una coincidencia se completa todo lo
// demás (Modelo, Ubicación y el Toner exacto que se buscó).
function renderSugerenciasSalidaToner(prefijo, filtro) {
  const lista = $(`${prefijo}SerialSugerencias`);
  if (!lista) return;
  const t = (filtro || "").trim().toLowerCase();
  const filtrados = t
    ? contadoresImpresorasData.filter((c) => [c.serial, c.modelo, c.toner].join(" ").toLowerCase().includes(t))
    : contadoresImpresorasData;
  const resultados = filtrados.slice(0, 30);

  lista.innerHTML = "";
  if (!resultados.length) {
    lista.innerHTML = `<div class="autocomplete-item" style="cursor:default;color:#9ca3af;">Sin coincidencias</div>`;
    lista.classList.add("open");
    return;
  }

  resultados.forEach((c) => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.innerHTML = `${esc(c.toner)}<small>Serial ${esc(c.serial)} · ${esc(c.modelo)} · Stock: ${esc(c.stockActual || 0)}</small>`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      $(`${prefijo}Serial`).value = c.serial;
      lista.classList.remove("open");
      poblarCamposSalidaToner(prefijo, c.toner);
    });
    lista.appendChild(item);
  });
  lista.classList.add("open");
}

function inicializarAutocompleteSalidaToner(prefijo) {
  const input = $(`${prefijo}Serial`);
  const lista = $(`${prefijo}SerialSugerencias`);
  if (!input || !lista) return;
  input.addEventListener("focus", () => renderSugerenciasSalidaToner(prefijo, input.value));
  input.addEventListener("input", () => {
    renderSugerenciasSalidaToner(prefijo, input.value);
    poblarCamposSalidaToner(prefijo);
  });
  input.addEventListener("blur", () => {
    setTimeout(() => lista.classList.remove("open"), 150);
  });
}

function renderSalidasToner() {
  const tbody = $("tbodySalidasToner");
  if (!tbody) return;
  tbody.innerHTML = salidasTonerData.length
    ? salidasTonerData
        .map(
          (s) => `
            <tr data-salida-id="${esc(s.id)}">
              <td>${esc(s.noVale)}</td>
              <td>${esc(s.serial)}</td>
              <td>${esc(s.modelo)}</td>
              <td>${esc(s.ubicacion)}</td>
              <td>${esc(s.toner)}</td>
              <td>${esc(s.cantidad)}</td>
              <td>${esc(s.fecha)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7" class="empty-state">Sin salidas registradas todavía.</td></tr>`;

  tbody.querySelectorAll("tr[data-salida-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirModalSalidaToner(tr.dataset.salidaId));
  });
}

function onSubmitNuevaSalidaToner(e) {
  e.preventDefault();
  const datos = {
    noVale: $("svNoVale").value.trim(),
    serial: $("svSerial").value.trim(),
    modelo: $("svModelo").value.trim(),
    ubicacion: $("svUbicacion").value.trim(),
    toner: $("svToner").value,
    cantidad: Number($("svCantidad").value) || 0,
    fecha: $("svFecha").value,
  };
  if (!datos.serial || !datos.toner) {
    alert("Indica el Serial y el Toner de la impresora");
    return;
  }
  if (!datos.cantidad || datos.cantidad <= 0) {
    alert("Indica una Cantidad mayor a 0");
    return;
  }

  datos.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  datos.ultimaModificacion = new Date().toISOString().slice(0, 16);
  salidasTonerData.unshift(datos);
  ajustarStockToner(datos.toner, -datos.cantidad);

  guardarSalidasToner();
  sincronizarSalidaToner(datos);
  renderSalidasToner();
  e.target.reset();
  $("svModelo").value = "";
  $("svUbicacion").value = "";
  $("svToner").innerHTML = "";
}

let salidaTonerActualId = null;

function abrirModalSalidaToner(id) {
  const registro = salidasTonerData.find((s) => s.id === id);
  if (!registro) return;
  salidaTonerActualId = id;
  $("esvId").value = registro.id;
  $("esvNoVale").value = registro.noVale || "";
  $("esvSerial").value = registro.serial || "";
  poblarCamposSalidaToner("esv");
  $("esvToner").value = registro.toner || "";
  $("esvCantidad").value = registro.cantidad || "";
  $("esvFecha").value = registro.fecha || "";
  $("modalSalidaTonerOverlay").style.display = "flex";
}

function cerrarModalSalidaToner() {
  salidaTonerActualId = null;
  $("modalSalidaTonerOverlay").style.display = "none";
}

function onSubmitEditarSalidaToner(e) {
  e.preventDefault();
  const idx = salidasTonerData.findIndex((s) => s.id === salidaTonerActualId);
  if (idx === -1) return;
  const anterior = salidasTonerData[idx];

  const datos = {
    id: anterior.id,
    noVale: $("esvNoVale").value.trim(),
    serial: $("esvSerial").value.trim(),
    modelo: $("esvModelo").value.trim(),
    ubicacion: $("esvUbicacion").value.trim(),
    toner: $("esvToner").value,
    cantidad: Number($("esvCantidad").value) || 0,
    fecha: $("esvFecha").value,
  };
  if (!datos.serial || !datos.toner) {
    alert("Indica el Serial y el Toner de la impresora");
    return;
  }
  if (!datos.cantidad || datos.cantidad <= 0) {
    alert("Indica una Cantidad mayor a 0");
    return;
  }
  datos.ultimaModificacion = new Date().toISOString().slice(0, 16);

  // Se devuelve al Stock lo que esta salida había rebajado antes de aplicar
  // los datos corregidos (aunque haya cambiado de Toner/color), para que el
  // ajuste nunca quede descuadrado.
  ajustarStockToner(anterior.toner, anterior.cantidad);
  ajustarStockToner(datos.toner, -datos.cantidad);

  salidasTonerData[idx] = datos;
  guardarSalidasToner();
  sincronizarSalidaToner(datos);
  renderSalidasToner();
  cerrarModalSalidaToner();
}

function eliminarSalidaTonerActual() {
  const idx = salidasTonerData.findIndex((s) => s.id === salidaTonerActualId);
  if (idx === -1) return;
  if (!confirm("¿Eliminar esta Salida de Tóner? Se devolverá la cantidad al Stock Actual.")) return;
  const registro = salidasTonerData[idx];
  ajustarStockToner(registro.toner, registro.cantidad);
  salidasTonerData.splice(idx, 1);
  guardarSalidasToner();
  sincronizarEliminacionSalidaToner(registro.id);
  renderSalidasToner();
  cerrarModalSalidaToner();
}

/* ---------- Ingreso de Tóner (entregas de Canella, ver ingresos-toner-sync.js) ---------- */
// Un Ingreso = un documento de Canella con Fecha + No. de Documento, que
// puede traer varios Toners distintos a la vez (ej. tintas y tóners
// variados) — por eso cada registro guarda un arreglo `lineas` en vez de un
// solo Toner/Cantidad como Salidas. Cada línea SUMA automáticamente al
// Stock Actual de ese Toner exacto (mismo `ajustarStockToner` de Salidas,
// con delta positivo). Solo se puede editar (nunca eliminar) un Ingreso ya
// guardado, a pedido explícito del usuario.

function cargarIngresosToner() {
  try {
    ingresosTonerData = JSON.parse(localStorage.getItem(INGRESOS_TONER_STORAGE_KEY)) || [];
  } catch (err) {
    ingresosTonerData = [];
  }
}

function guardarIngresosToner() {
  localStorage.setItem(INGRESOS_TONER_STORAGE_KEY, JSON.stringify(ingresosTonerData));
}

function obtenerIngresosTonerActuales() {
  return ingresosTonerData;
}

function establecerIngresosTonerDesdeSync(remotos) {
  const remotosPorId = new Map(remotos.map((r) => [r.id, r]));
  const combinados = [];
  const idsLocales = new Set();

  ingresosTonerData.forEach((local) => {
    idsLocales.add(local.id);
    const remoto = remotosPorId.get(local.id);
    if (!remoto) return;
    if ((local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarIngresoToner(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsLocales.has(remoto.id)) combinados.push(remoto);
  });

  ingresosTonerData = combinados.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  guardarIngresosToner();
  renderIngresosToner();
}

function sincronizarIngresoToner(registro) {
  if (window.FirestoreSyncIngresosToner && typeof window.FirestoreSyncIngresosToner.guardarIngresoToner === "function") {
    window.FirestoreSyncIngresosToner.guardarIngresoToner(registro);
  }
}

// Arma la lista de Toners exactos (incluye color) que existen hoy en el
// catálogo, uno por cada texto distinto (no por base, a diferencia del
// Resumen) — porque Canella entrega cartuchos de color específicos, no un
// total genérico por # de Toner.
function listaTonersUnicosParaIngreso() {
  const vistos = new Set();
  const lista = [];
  contadoresImpresorasData.forEach((c) => {
    const clave = normalizarTextoComparar(c.toner);
    if (!clave || vistos.has(clave)) return;
    vistos.add(clave);
    lista.push({ toner: c.toner, stockActual: c.stockActual || 0 });
  });
  return lista.sort((a, b) => a.toner.localeCompare(b.toner));
}

function renderFormularioIngresoToner() {
  const tbody = $("tbodyFormIngresoToner");
  if (!tbody) return;
  const lista = listaTonersUnicosParaIngreso();
  tbody.innerHTML = lista.length
    ? lista
        .map(
          (t) => `
            <tr>
              <td>${esc(t.toner)}</td>
              <td class="stock-actual">${esc(t.stockActual || 0)}</td>
              <td><input type="number" class="cant-recibida-toner" min="0" data-toner="${esc(t.toner)}" placeholder="0"></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="3" class="empty-state">Sin Toners registrados todavía.</td></tr>`;
  tbody.querySelectorAll(".cant-recibida-toner").forEach((input) => {
    input.addEventListener("input", actualizarResumenIngresoToner);
  });
  actualizarResumenIngresoToner();
}

function lineasIngresoTonerCapturadas(tbodyId) {
  return [...document.querySelectorAll(`#${tbodyId} .cant-recibida-toner`)]
    .map((input) => ({ toner: input.dataset.toner, cantidad: Number(input.value) || 0 }))
    .filter((l) => l.cantidad > 0);
}

function actualizarResumenIngresoToner() {
  const span = $("resumenIngresoToner");
  if (!span) return;
  const lineas = lineasIngresoTonerCapturadas("tbodyFormIngresoToner");
  if (!lineas.length) {
    span.textContent = "Sin cantidades capturadas todavía.";
    return;
  }
  const total = lineas.reduce((sum, l) => sum + l.cantidad, 0);
  span.textContent = `${lineas.length} Toner${lineas.length === 1 ? "" : "s"} con cantidad capturada · ${total} unidades a ingresar`;
}

function renderIngresosToner() {
  const tbody = $("tbodyIngresosToner");
  if (!tbody) return;
  tbody.innerHTML = ingresosTonerData.length
    ? ingresosTonerData
        .map((registro) => {
          const lineas = registro.lineas || [];
          const total = lineas.reduce((sum, l) => sum + (Number(l.cantidad) || 0), 0);
          return `
            <tr data-ingreso-id="${esc(registro.id)}">
              <td>${esc(registro.documento)}</td>
              <td>${esc(registro.fecha)}</td>
              <td>${esc(lineas.map((l) => l.toner).join(", "))}</td>
              <td>${esc(total)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" class="empty-state">Sin ingresos registrados todavía.</td></tr>`;

  tbody.querySelectorAll("tr[data-ingreso-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirModalIngresoToner(tr.dataset.ingresoId));
  });
}

function onSubmitIngresoToner(e) {
  e.preventDefault();
  const fecha = $("itFecha").value;
  const documento = $("itDocumento").value.trim();
  if (!fecha || !documento) {
    alert("Indica la Fecha de Ingreso y el No. de Documento");
    return;
  }
  const lineas = lineasIngresoTonerCapturadas("tbodyFormIngresoToner");
  if (!lineas.length) {
    alert("Indica la Cantidad Recibida de al menos un Toner");
    return;
  }

  const registro = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    fecha,
    documento,
    lineas,
    ultimaModificacion: new Date().toISOString().slice(0, 16),
  };
  lineas.forEach((l) => ajustarStockToner(l.toner, l.cantidad));

  ingresosTonerData.unshift(registro);
  guardarIngresosToner();
  sincronizarIngresoToner(registro);
  renderIngresosToner();

  e.target.reset();
  $("itFecha").value = fecha;
  renderFormularioIngresoToner();
}

let ingresoTonerActualId = null;

function abrirModalIngresoToner(id) {
  const registro = ingresosTonerData.find((r) => r.id === id);
  if (!registro) return;
  ingresoTonerActualId = id;
  $("eitId").value = registro.id;
  $("eitFecha").value = registro.fecha || "";
  $("eitDocumento").value = registro.documento || "";
  const tbody = $("tbodyEditarIngresoToner");
  tbody.innerHTML = (registro.lineas || [])
    .map(
      (l) => `
        <tr>
          <td>${esc(l.toner)}</td>
          <td><input type="number" class="cant-recibida-toner" min="0" data-toner="${esc(l.toner)}" value="${esc(l.cantidad)}"></td>
        </tr>
      `
    )
    .join("");
  $("modalIngresoTonerOverlay").style.display = "flex";
}

function cerrarModalIngresoToner() {
  ingresoTonerActualId = null;
  $("modalIngresoTonerOverlay").style.display = "none";
}

function onSubmitEditarIngresoToner(e) {
  e.preventDefault();
  const idx = ingresosTonerData.findIndex((r) => r.id === ingresoTonerActualId);
  if (idx === -1) return;
  const anterior = ingresosTonerData[idx];

  const fecha = $("eitFecha").value;
  const documento = $("eitDocumento").value.trim();
  if (!fecha || !documento) {
    alert("Indica la Fecha de Ingreso y el No. de Documento");
    return;
  }
  const lineas = lineasIngresoTonerCapturadas("tbodyEditarIngresoToner");
  if (!lineas.length) {
    alert("Indica la Cantidad Recibida de al menos un Toner");
    return;
  }

  // Revierte lo que este Ingreso había sumado antes de aplicar los datos
  // corregidos, igual que Salidas al editar, para que el Stock nunca quede
  // descuadrado.
  (anterior.lineas || []).forEach((l) => ajustarStockToner(l.toner, -(Number(l.cantidad) || 0)));
  lineas.forEach((l) => ajustarStockToner(l.toner, l.cantidad));

  const registro = {
    ...anterior,
    fecha,
    documento,
    lineas,
    ultimaModificacion: new Date().toISOString().slice(0, 16),
  };
  ingresosTonerData[idx] = registro;
  guardarIngresosToner();
  sincronizarIngresoToner(registro);
  renderIngresosToner();
  renderFormularioIngresoToner();
  cerrarModalIngresoToner();
}

// Reporte de auditoría: Stock Actual (todos los Tóner) + Salidas del rango
// de fechas elegido, en un PDF descargable listo para enviar/imprimir.
function datosStockTonerParaReporte() {
  const grupos = {};
  contadoresImpresorasData.forEach((c) => {
    const { base, color } = tonerBaseYColor(c.toner);
    const clave = normalizarTextoComparar(base);
    if (!clave) return;
    if (!grupos[clave]) grupos[clave] = { base, esColor: false, stockPorColor: {}, stockPlano: "" };
    const g = grupos[clave];
    if (color) {
      g.esColor = true;
      if (g.stockPorColor[color] === undefined) g.stockPorColor[color] = c.stockActual || 0;
    } else if (g.stockPlano === "") {
      g.stockPlano = c.stockActual || 0;
    }
  });
  return Object.values(grupos).sort((a, b) => a.base.localeCompare(b.base));
}

function descargarReporteStockToner() {
  const desde = $("repTonerDesde").value;
  const hasta = $("repTonerHasta").value;
  const salidasFiltradas = salidasTonerData
    .filter((s) => (!desde || (s.fecha || "") >= desde) && (!hasta || (s.fecha || "") <= hasta))
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const ingresosFiltrados = ingresosTonerData
    .filter((r) => (!desde || (r.fecha || "") >= desde) && (!hasta || (r.fecha || "") <= hasta))
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  const filasStock = datosStockTonerParaReporte()
    .map(
      (g) => `
        <tr>
          <td>${esc(g.base)}</td>
          <td>${g.esColor ? COLORES_CMYK.map((c) => `${COLOR_LETRA_TONER[c]}: ${esc(g.stockPorColor[c] ?? "-")}`).join(" &middot; ") : esc(g.stockPlano)}</td>
        </tr>
      `
    )
    .join("");

  const filasSalidas = salidasFiltradas
    .map(
      (s) => `
        <tr>
          <td>${esc(s.noVale)}</td>
          <td>${esc(s.serial)}</td>
          <td>${esc(s.modelo)}</td>
          <td>${esc(s.ubicacion)}</td>
          <td>${esc(s.toner)}</td>
          <td>${esc(s.cantidad)}</td>
          <td>${esc(s.fecha)}</td>
        </tr>
      `
    )
    .join("");

  const filasIngresos = ingresosFiltrados
    .map(
      (r) => `
        <tr>
          <td>${esc(r.documento)}</td>
          <td>${esc((r.lineas || []).map((l) => `${l.toner} (${l.cantidad})`).join(", "))}</td>
          <td>${esc((r.lineas || []).reduce((sum, l) => sum + (Number(l.cantidad) || 0), 0))}</td>
          <td>${esc(r.fecha)}</td>
        </tr>
      `
    )
    .join("");

  const rangoTexto = desde || hasta ? `del ${desde || "inicio"} al ${hasta || "hoy"}` : "Todo el historial";

  const contenedor = document.createElement("div");
  contenedor.style.cssText = "position: fixed; left: -9999px; top: 0; width: 1100px; padding: 20px; background: #fff; font-family: Arial, sans-serif;";
  contenedor.innerHTML = `
    <h2 style="margin: 0 0 4px; color: #1c3d6e;">Reporte de Stock Tóner Bodega 2</h2>
    <p style="margin: 0 0 18px; color: #555; font-size: 13px;">Generado el ${new Date().toLocaleString()} — ${esc(rangoTexto)}</p>
    <h3 style="margin: 0 0 8px; color: #1c3d6e;">Stock Actual</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;" border="1" cellpadding="6">
      <thead><tr style="background: #eaf0fb;"><th>Toner</th><th>Stock</th></tr></thead>
      <tbody>${filasStock || `<tr><td colspan="2">Sin datos</td></tr>`}</tbody>
    </table>
    <h3 style="margin: 0 0 8px; color: #1c3d6e;">Ingresos (Canella)</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;" border="1" cellpadding="6">
      <thead><tr style="background: #eaf0fb;"><th>Documento</th><th>Toners recibidos</th><th>Total</th><th>Fecha</th></tr></thead>
      <tbody>${filasIngresos || `<tr><td colspan="4">Sin ingresos en este rango</td></tr>`}</tbody>
    </table>
    <h3 style="margin: 0 0 8px; color: #1c3d6e;">Salidas</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;" border="1" cellpadding="6">
      <thead><tr style="background: #eaf0fb;"><th>No. Vale</th><th>Serial</th><th>Modelo</th><th>Ubicación</th><th>Toner</th><th>Cant.</th><th>Fecha</th></tr></thead>
      <tbody>${filasSalidas || `<tr><td colspan="7">Sin salidas en este rango</td></tr>`}</tbody>
    </table>
  `;
  document.body.appendChild(contenedor);

  const opt = {
    margin: 10,
    filename: `reporte-stock-toner-${new Date().toISOString().split("T")[0]}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: "landscape", unit: "mm", format: "a4" },
  };
  html2pdf()
    .set(opt)
    .from(contenedor)
    .save()
    .then(() => contenedor.remove())
    .catch(() => contenedor.remove());
}

// Una impresora se excluye si su Tipo (o Tipo de equipo) contiene "plotter",
// o si su Ubicación **o su Departamento** contienen (no exige igualdad
// exacta) alguna de las ubicaciones que el usuario pidió excluir — son dos
// campos separados en el catálogo y el lugar (ej. "San Fernando") puede
// haberse capturado en cualquiera de los dos según el caso, así que hay que
// revisar ambos para no dejar pasar impresoras que sí deben excluirse.
const SERIALES_EXCLUIDOS_STOCK_TONER_NORMALIZADOS = SERIALES_EXCLUIDOS_STOCK_TONER.map(normalizarTextoComparar);

function impresoraDebeExcluirseDeStockToner(p) {
  if (SERIALES_EXCLUIDOS_STOCK_TONER_NORMALIZADOS.includes(normalizarTextoComparar(p.serial))) return true;
  const tipo = normalizarTextoComparar(p.tipo);
  const tipoEquipo = normalizarTextoComparar(p.tipoEquipoImp);
  if (tipo.includes("plotter") || tipoEquipo.includes("plotter")) return true;
  const ubicacion = normalizarTextoComparar(p.ubicacion);
  const departamento = normalizarTextoComparar(p.departamento);
  return UBICACIONES_EXCLUIDAS_STOCK_TONER.some((u) => ubicacion.includes(u) || departamento.includes(u));
}

// Migra el catálogo de Impresoras (una fila por impresora, con su Toner y
// Serial ya capturados) a Stock Tóner Bodega 2 — a pedido del usuario,
// excluyendo Plotters y las ubicaciones que indicó (Riolsa, San Fernando,
// Flor del Campo, Km 98). Correrla más de una vez es seguro: actualiza
// Toner/Modelo/Color de lo que ya existía (matcheado por Serial) sin tocar
// el Stock Actual ya capturado a mano, solo crea lo que falte, y además
// LIMPIA cualquier registro que ya se hubiera migrado por error y que ahora
// (con el criterio de exclusión mejorado) sí debería excluirse.
// Una impresora "Colores" físicamente usa 4 cartuchos independientes (uno
// por color), cada uno con su propio stock — por eso genera 4 filas (una
// por color) en vez de una sola fila genérica "Colores", igual a como el
// usuario ya lo lleva en su Excel real (ej. "TONER T10 - CYAN", "TONER T10
// - MAGENTA"...). Las B/N siguen siendo 1 sola fila (1 solo cartucho).
const COLORES_CMYK = ["Negro", "Cyan", "Magenta", "Amarillo"];
const COLOR_LETRA_TONER = { Negro: "N", Cyan: "C", Magenta: "M", Amarillo: "Y" };

function variantesDeTonerParaImpresora(p) {
  const toner = (p.gpr || "").trim();
  const esColor = normalizarTextoComparar(p.tipo).includes("color");
  if (!esColor) return [{ toner, color: (p.tipo || "").trim() || "B/N" }];
  return COLORES_CMYK.map((color) => ({ toner: `${toner} - ${color.toUpperCase()}`, color }));
}

// Varias impresoras (distinto Serial) pueden ser compatibles con el mismo #
// de Tóner físico — para no duplicar/inflar el conteo, todo lo que agrupa o
// resume por Tóner (Resumen, modal de detalle) usa el # BASE, quitando el
// sufijo " - COLOR" que agrega variantesDeTonerParaImpresora. Así "16 -
// AMARILLO" y "16 - NEGRO" caen en el mismo grupo "16", y cada impresora
// (aunque tenga 4 filas, una por color) solo cuenta una vez.
function tonerBaseYColor(toner) {
  const t = (toner || "").trim();
  const tUpper = t.toUpperCase();
  for (const color of COLORES_CMYK) {
    const sufijo = ` - ${color.toUpperCase()}`;
    if (tUpper.endsWith(sufijo)) {
      return { base: t.slice(0, t.length - sufijo.length).trim(), color };
    }
  }
  return { base: t, color: null };
}

function migrarStockTonerDesdeImpresoras() {
  if (!confirm("¿Migrar el catálogo de Impresoras a Stock Tóner Bodega 2?\n\nSe excluyen: Plotters, Riolsa, San Fernando, Flor del Campo y Km 98.\nLas impresoras a color generan 4 filas (Negro/Cyan/Magenta/Amarillo).")) return;

  const porSerialImpresora = new Map(
    impresorasData.map((p) => [normalizarTextoComparar(p.serial), p]).filter(([clave]) => clave)
  );
  // Clave = Serial + Color (no solo Serial), porque ahora una misma
  // impresora a color puede tener hasta 4 filas — sin el Color en la clave
  // se pisarían entre sí.
  const existentesPorClave = new Map(
    contadoresImpresorasData.map((r) => [`${normalizarTextoComparar(r.serial)}|${normalizarTextoComparar(r.color)}`, r])
  );
  const ahora = new Date().toISOString().slice(0, 16);
  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;
  let eliminados = 0;
  const tocados = [];
  const idsAEliminar = [];

  impresorasData.forEach((p) => {
    if (impresoraDebeExcluirseDeStockToner(p)) {
      omitidos++;
      return;
    }
    const serial = (p.serial || "").trim();
    if (!(p.gpr || "").trim() || !serial) {
      omitidos++;
      return;
    }

    variantesDeTonerParaImpresora(p).forEach(({ toner, color }) => {
      const clave = `${normalizarTextoComparar(serial)}|${normalizarTextoComparar(color)}`;
      const existente = existentesPorClave.get(clave);
      if (existente) {
        existente.toner = toner;
        existente.modelo = (p.modelo || "").trim();
        existente.color = color;
        existente.ultimaModificacion = ahora;
        tocados.push(existente);
        actualizados++;
      } else {
        const nuevo = {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random() + tocados.length),
          toner,
          serial,
          modelo: (p.modelo || "").trim(),
          color,
          stockActual: "",
          ultimaModificacion: ahora,
        };
        contadoresImpresorasData.push(nuevo);
        existentesPorClave.set(clave, nuevo);
        tocados.push(nuevo);
        creados++;
      }
    });
  });

  contadoresImpresorasData = contadoresImpresorasData.filter((r) => {
    const serialFila = normalizarTextoComparar(r.serial);
    // Exclusión por Serial directo sobre la fila — no depende de encontrar la
    // impresora en el catálogo actual (antes, si esa búsqueda fallaba, la
    // fila nunca se revisaba y una exclusión explícita por Serial no surtía
    // efecto).
    if (SERIALES_EXCLUIDOS_STOCK_TONER_NORMALIZADOS.includes(serialFila)) {
      idsAEliminar.push(r.id);
      eliminados++;
      return false;
    }
    // Fila vieja del esquema anterior (una sola fila genérica "Colores" por
    // impresora a color) — ya quedó reemplazada por las 4 filas por color.
    if (normalizarTextoComparar(r.color) === "colores") {
      idsAEliminar.push(r.id);
      eliminados++;
      return false;
    }
    const impresora = porSerialImpresora.get(serialFila);
    if (impresora && impresoraDebeExcluirseDeStockToner(impresora)) {
      idsAEliminar.push(r.id);
      eliminados++;
      return false;
    }
    return true;
  });

  guardarContadoresImpresoras();
  tocados.forEach((r) => sincronizarContadorImpresora(r));
  idsAEliminar.forEach((id) => sincronizarEliminacionContadorImpresora(id));
  refrescarVistasSecundarias();
  alert(`Migración completa: ${creados} nueva(s), ${actualizados} actualizada(s), ${eliminados} eliminada(s) por exclusión, ${omitidos} omitida(s) (Plotter/ubicación excluida o sin Toner/Serial).`);
}

// "Cantidad Impresoras" no se captura a mano — se cuenta cuántas filas
// comparten el mismo Toner (normalizado), para que nunca se desactualice.
function obtenerContadoresImpresoras() {
  const conteoPorToner = {};
  contadoresImpresorasData.forEach((c) => {
    const clave = normalizarTextoComparar(c.toner);
    if (!clave) return;
    conteoPorToner[clave] = (conteoPorToner[clave] || 0) + 1;
  });
  return contadoresImpresorasData.map((c) => ({
    registro: c,
    celdas: `
      <td>${esc(c.toner)}</td>
      <td>${esc(c.serial)}</td>
      <td>${esc(c.modelo)}</td>
      <td>${esc(c.color)}</td>
      <td>${esc(conteoPorToner[normalizarTextoComparar(c.toner)] || 1)}</td>
      <td>${esc(c.stockActual)}</td>
    `,
  }));
}

const vistaContadoresImpresoras = crearVistaLista({
  prefix: "contadoresImpresoras",
  columnas: 6,
  obtenerFilas: obtenerContadoresImpresoras,
  filtrar: (r, t) => {
    const texto = [r.registro.toner, r.registro.serial, r.registro.modelo, r.registro.color].join(" ").toLowerCase();
    return t.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
  },
  alClicFila: (r) => abrirModalContadorImpresora(r.registro),
});

// Stock por Tóner (antes "Resumen por Tóner"): un Tóner BASE por fila (sin
// repetir por color), con la Cantidad de Impresoras contada por Serial
// único — así, aunque una impresora a color tenga 4 filas internas (una por
// color), solo cuenta una vez, y la suma de "Cantidad Impresoras" siempre
// cuadra con las impresoras reales. Es de SOLO LECTURA a propósito (para el
// bodeguero): ni la tabla ni el modal de detalle (al hacer clic en la fila)
// permiten cambiar el Stock — solo ver cuánto hay y qué impresoras
// corresponden a cada Tóner. El Stock Actual se sigue pudiendo editar desde
// "Detalle completo" (por impresora); `actualizarStockDeToner` sigue
// existiendo porque lo usa `ajustarStockToner` (Salidas de Tóner) para
// rebajar automático, solo que ya no hay ningún input en esta vista que lo
// dispare directamente.
function renderResumenToner() {
  const grupos = {};
  contadoresImpresorasData.forEach((c) => {
    const { base, color } = tonerBaseYColor(c.toner);
    const clave = normalizarTextoComparar(base);
    if (!clave) return;
    if (!grupos[clave]) {
      grupos[clave] = { base, seriales: new Set(), esColor: false, stockPorColor: {}, stockPlano: "" };
    }
    const g = grupos[clave];
    if (c.serial) g.seriales.add(normalizarTextoComparar(c.serial));
    if (color) {
      g.esColor = true;
      if (g.stockPorColor[color] === undefined && c.stockActual !== undefined && c.stockActual !== "") {
        g.stockPorColor[color] = c.stockActual;
      }
    } else if (g.stockPlano === "" && c.stockActual !== undefined && c.stockActual !== "") {
      g.stockPlano = c.stockActual;
    }
  });

  const filas = Object.keys(grupos)
    .map((clave) => ({ clave, ...grupos[clave], cantidad: grupos[clave].seriales.size }))
    .sort((a, b) => a.base.localeCompare(b.base));

  const tbody = $("tbodyResumenToner");
  if (!tbody) return;
  tbody.innerHTML = filas.length
    ? filas
        .map((f) => {
          const celdaStock = f.esColor
            ? `<span class="stock-mini-toner">${COLORES_CMYK.map(
                (color) => `<span class="punto punto-${COLOR_LETRA_TONER[color]}">${esc(f.stockPorColor[color] ?? "-")}</span>`
              ).join("")}</span>`
            : esc(f.stockPlano || "0");
          return `
            <tr data-toner-clave="${esc(f.clave)}">
              <td>${esc(f.base)}</td>
              <td>${esc(f.cantidad)}</td>
              <td>${celdaStock}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="3" class="empty-state">Sin datos todavía.</td></tr>`;

  tbody.querySelectorAll("tr[data-toner-clave]").forEach((tr) => {
    tr.addEventListener("click", () => abrirModalImpresorasPorToner(tr.dataset.tonerClave));
  });
}

// Aplica el mismo Stock Actual a TODAS las filas que compartan ese Tóner
// (matcheado por el mismo valor normalizado que usa el resumen/la Cantidad
// de Impresoras), y sincroniza cada una a Firestore.
function actualizarStockDeToner(tonerClave, stockActual) {
  const ahora = new Date().toISOString().slice(0, 16);
  const tocados = [];
  contadoresImpresorasData.forEach((c) => {
    if (normalizarTextoComparar(c.toner) !== tonerClave) return;
    c.stockActual = stockActual;
    c.ultimaModificacion = ahora;
    tocados.push(c);
  });
  guardarContadoresImpresoras();
  tocados.forEach((r) => sincronizarContadorImpresora(r));
  refrescarVistasSecundarias();
}

// tonerBaseClave viene de renderResumenToner: ya es el # de Tóner BASE
// (sin sufijo de color). Aquí se separan las impresoras compatibles
// (únicas por Serial, sin importar si tienen 1 o 4 filas internas) de los
// 4 casilleros de color, para no repetir la misma impresora 4 veces.
function abrirModalImpresorasPorToner(tonerBaseClave) {
  const filas = contadoresImpresorasData.filter((c) => normalizarTextoComparar(tonerBaseYColor(c.toner).base) === tonerBaseClave);
  const nombreBase = filas.length ? tonerBaseYColor(filas[0].toner).base : tonerBaseClave;

  const impresorasUnicas = [];
  const serialesVistos = new Set();
  filas.forEach((f) => {
    const claveSerial = normalizarTextoComparar(f.serial);
    if (serialesVistos.has(claveSerial)) return;
    serialesVistos.add(claveSerial);
    impresorasUnicas.push(f);
  });

  $("modalImpresorasPorTonerTitulo").textContent = `Impresoras con Tóner "${nombreBase}" (${impresorasUnicas.length})`;

  const esColor = filas.some((f) => tonerBaseYColor(f.toner).color);
  const contenedorColores = $("coloresTonerModal");
  const thead = $("theadImpresorasPorToner");
  const tbody = $("tbodyImpresorasPorToner");

  if (esColor) {
    contenedorColores.style.display = "grid";
    contenedorColores.style.gridTemplateColumns = "";
    contenedorColores.innerHTML = COLORES_CMYK.map((color) => {
      const letra = COLOR_LETRA_TONER[color];
      const filaColor = filas.find((f) => tonerBaseYColor(f.toner).color === color);
      const stock = filaColor ? filaColor.stockActual : "";
      return `
        <div class="color-casilla-toner">
          <span class="letra letra-${letra}">${letra}</span>
          <span class="nombre">${color}</span>
          <span class="etiqueta-stock">Stock</span>
          <span class="valor-stock-toner">${esc(stock || "0")}</span>
        </div>
      `;
    }).join("");

    thead.innerHTML = `<tr><th>Serial</th><th>Modelo</th></tr>`;
    tbody.innerHTML = impresorasUnicas.length
      ? impresorasUnicas.map((f) => `<tr><td>${esc(f.serial)}</td><td>${esc(f.modelo)}</td></tr>`).join("")
      : `<tr><td colspan="2" class="empty-state">Sin impresoras para este Tóner.</td></tr>`;
  } else {
    // Un Tóner B/N también puede ser compatible con varias impresoras (ej.
    // GPR39 con 6 impresoras) — igual que con los de color, el Stock es UNO
    // solo compartido, no por impresora: se captura en una sola casilla
    // arriba (no una por fila), para no dar a entender que cada impresora
    // tiene su propio stock separado.
    contenedorColores.style.display = "grid";
    contenedorColores.style.gridTemplateColumns = "max-content";
    const stock = filas.length ? filas[0].stockActual : "";
    contenedorColores.innerHTML = `
      <div class="color-casilla-toner">
        <span class="nombre">${esc(nombreBase)}</span>
        <span class="etiqueta-stock">Stock</span>
        <span class="valor-stock-toner">${esc(stock || "0")}</span>
      </div>
    `;

    thead.innerHTML = `<tr><th>Serial</th><th>Modelo</th></tr>`;
    tbody.innerHTML = impresorasUnicas.length
      ? impresorasUnicas.map((f) => `<tr><td>${esc(f.serial)}</td><td>${esc(f.modelo)}</td></tr>`).join("")
      : `<tr><td colspan="2" class="empty-state">Sin impresoras para este Tóner.</td></tr>`;
  }

  $("modalImpresorasPorTonerOverlay").style.display = "flex";
}

function cerrarModalImpresorasPorToner() {
  $("modalImpresorasPorTonerOverlay").style.display = "none";
}

/* ---------- Códigos de usuario para impresión/escaneo/copia (ver codigos-impresion-sync.js) ---------- */
/* El ID de usuario y la clave NO son únicos por diseño (el mismo nombre puede
   tener varios registros con distinto ID/clave en el Excel de origen), así
   que se usa un "id" interno aparte para identificar cada registro. */

function cargarCodigos() {
  const raw = localStorage.getItem(CODIGOS_STORAGE_KEY);
  if (raw) {
    try {
      codigosData = JSON.parse(raw);
      return;
    } catch {
      codigosData = [];
    }
  }
  const semilla = typeof CATALOGO_CODIGOS_IMPRESION !== "undefined" && Array.isArray(CATALOGO_CODIGOS_IMPRESION) ? CATALOGO_CODIGOS_IMPRESION : [];
  codigosData = semilla.map((c, i) => ({ ...c, id: c.id || `semilla-${i}` }));
  guardarCodigos();
}

function guardarCodigos() {
  localStorage.setItem(CODIGOS_STORAGE_KEY, JSON.stringify(codigosData));
}

function obtenerCodigosActuales() {
  return codigosData;
}

function establecerCodigosDesdeSync(remotos) {
  const remotosPorId = new Map(remotos.map((c) => [c.id, c]));
  const combinados = [];
  const idsVistos = new Set();

  codigosData.forEach((local) => {
    idsVistos.add(local.id);
    const remoto = remotosPorId.get(local.id);
    if (!remoto || (local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarCodigo(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsVistos.has(remoto.id)) combinados.push(remoto);
  });

  codigosData = combinados;
  guardarCodigos();
  refrescarVistasSecundarias();
}

function sincronizarCodigo(codigo) {
  if (window.FirestoreSyncCodigos && typeof window.FirestoreSyncCodigos.guardarCodigo === "function") {
    window.FirestoreSyncCodigos.guardarCodigo(codigo);
  }
}

function sincronizarEliminacionCodigo(id) {
  if (window.FirestoreSyncCodigos && typeof window.FirestoreSyncCodigos.eliminarCodigo === "function") {
    window.FirestoreSyncCodigos.eliminarCodigo(id);
  }
}

/* ---------- Tickets de Garantía (reportes a GBM / Canella) ---------- */

function cargarTicketsGarantia() {
  const raw = localStorage.getItem(TICKETS_GARANTIA_STORAGE_KEY);
  try {
    ticketsGarantiaData = raw ? JSON.parse(raw) : [];
  } catch {
    ticketsGarantiaData = [];
  }
}

function guardarTicketsGarantia() {
  localStorage.setItem(TICKETS_GARANTIA_STORAGE_KEY, JSON.stringify(ticketsGarantiaData));
}

function obtenerTicketsGarantiaActuales() {
  return ticketsGarantiaData;
}

// Datos de solo lectura recolectados por el Agente de Inventario TI (PowerShell).
// No hay edicion desde la app, asi que no hace falta fusionar con nada local:
// se reemplaza directo con lo que llega de Firestore.
function establecerEquiposTIv2DesdeSync(remotos) {
  equiposTIv2Data = remotos || [];
  if (typeof vistaEquiposTIv2 !== "undefined") vistaEquiposTIv2.render();
}

function establecerTicketsGarantiaDesdeSync(remotos) {
  const remotosPorId = new Map(remotos.map((t) => [t.id, t]));
  const combinados = [];
  const idsVistos = new Set();

  ticketsGarantiaData.forEach((local) => {
    idsVistos.add(local.id);
    const remoto = remotosPorId.get(local.id);
    if (!remoto || (local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarTicketGarantia(local);
    } else {
      combinados.push(remoto);
    }
  });

  remotos.forEach((remoto) => {
    if (!idsVistos.has(remoto.id)) combinados.push(remoto);
  });

  ticketsGarantiaData = combinados;
  guardarTicketsGarantia();
  poblarFiltrosYDatalists();
  refrescarVistasSecundarias();
}

function sincronizarTicketGarantia(ticket) {
  if (window.FirestoreSyncTicketsGarantia && typeof window.FirestoreSyncTicketsGarantia.guardarTicketGarantia === "function") {
    window.FirestoreSyncTicketsGarantia.guardarTicketGarantia(ticket);
  }
}

function sincronizarEliminacionTicketGarantia(id) {
  if (window.FirestoreSyncTicketsGarantia && typeof window.FirestoreSyncTicketsGarantia.eliminarTicketGarantia === "function") {
    window.FirestoreSyncTicketsGarantia.eliminarTicketGarantia(id);
  }
}

/* ---------- Mantenimiento de Equipos ---------- */

function cargarMantenimientoEquipos() {
  mantenimientoEquiposData = JSON.parse(localStorage.getItem(MANTENIMIENTO_EQUIPOS_STORAGE_KEY)) || [];
}

function guardarMantenimientoEquipos() {
  localStorage.setItem(MANTENIMIENTO_EQUIPOS_STORAGE_KEY, JSON.stringify(mantenimientoEquiposData));
  sincronizarRegistroMantenimiento();
}

function establecerMantenimientoEquiposDesdeSync(registrosRemotos) {
  const remotosPorId = new Map(registrosRemotos.map((r) => [r.id, r]));
  const combinados = [];
  const idsVistos = new Set();

  mantenimientoEquiposData.forEach((local) => {
    idsVistos.add(local.id);
    const remoto = remotosPorId.get(local.id);
    if (!remoto || (local.ultimaModificacion || "") > (remoto.ultimaModificacion || "")) {
      combinados.push(local);
      sincronizarRegistroMantenimiento();
    } else {
      combinados.push(remoto);
    }
  });

  registrosRemotos.forEach((remoto) => {
    if (!idsVistos.has(remoto.id)) combinados.push(remoto);
  });

  mantenimientoEquiposData = combinados.sort((a, b) => (b.fechaIngreso || "").localeCompare(a.fechaIngreso || ""));
  guardarMantenimientoEquipos();
  if (vistaMantenimientoEquipos) vistaMantenimientoEquipos.render();
}

function sincronizarRegistroMantenimiento() {
  if (typeof window.FirestoreSyncMantenimientoEquipos !== "undefined" && mantenimientoEquiposActualId) {
    const registro = mantenimientoEquiposData.find((r) => r.id === mantenimientoEquiposActualId);
    if (registro) window.FirestoreSyncMantenimientoEquipos.guardarRegistroMantenimiento(registro);
  }
}

function sincronizarEliminacionRegistroMantenimiento(id) {
  if (typeof window.FirestoreSyncMantenimientoEquipos !== "undefined") {
    window.FirestoreSyncMantenimientoEquipos.eliminarRegistroMantenimiento(id);
  }
}

function obtenerRegistrosMantenimientoActuales() {
  return mantenimientoEquiposData;
}

let mantenimientoEquiposActualId = null;

function actualizarUsuarioEquipoMantenimiento() {
  const equipoRef = $("meEquipo").value;
  if (!equipoRef) return;
  if (!Array.isArray(equipos) || equipos.length === 0) {
    return;
  }
  const equipo = equipos.find((e) => e.nombreRed === equipoRef);
  if (equipo) {
    $("meUsuario").value = equipo.nombreEmpleado || "";
    $("meHwProcesador").textContent = equipo.procesador || "-";
    $("meHwRam").textContent = equipo.memoria || "-";
    $("meHwDisco").textContent = equipo.tipoDisco || "-";
    $("meHwTipo").textContent = equipo.tipoEquipo || "-";

    // Los equipos Lenovo en renta (con contrato activo, mismo criterio que el
    // filtro "equipos propios") solo pueden recibir mantenimiento de tecnicos
    // de GBM segun el contrato de arrendamiento. Se fuerza siempre (incluso en
    // registros existentes, para corregir capturas previas a esta regla); para
    // equipos propios solo se autocompleta en registros nuevos, respetando el
    // tecnico ya guardado en los existentes.
    const esLenovoEnRenta = (equipo.fabricante || "").trim().toUpperCase() === "LENOVO" && nonEmpty(equipo.contratos);
    if (esLenovoEnRenta) {
      $("meTecnico").value = "Técnico GBM";
    } else if (!mantenimientoEquiposActualId) {
      $("meTecnico").value = TECNICO_ACTUAL || "";
    }
  }
}

function abrirModalMantenimientoEquipos(registro) {
  mantenimientoEquiposActualId = registro ? registro.id : null;
  MANTENIMIENTO_EQUIPOS_FIELD_IDS.forEach((fieldId) => {
    const campo = MANTENIMIENTO_EQUIPOS_CAMPO_POR_ID[fieldId];
    $(fieldId).value = (registro && registro[campo]) || "";
  });

  document.querySelectorAll('input[name="solucion"]').forEach((cb) => (cb.checked = false));
  if (registro && registro.solucion) {
    const soluciones = registro.solucion.split(", ");
    document.querySelectorAll('input[name="solucion"]').forEach((cb) => {
      if (soluciones.includes(cb.value)) cb.checked = true;
    });
  }

  if (!registro) {
    $("meTecnico").value = TECNICO_ACTUAL || "";
    $("meHwProcesador").textContent = "-";
    $("meHwRam").textContent = "-";
    $("meHwDisco").textContent = "-";
    $("meHwTipo").textContent = "-";
  } else {
    actualizarUsuarioEquipoMantenimiento();
  }

  $("modalMantenimientoEquiposOverlay").style.display = "flex";
}

function cerrarModalMantenimientoEquipos() {
  mantenimientoEquiposActualId = null;
  MANTENIMIENTO_EQUIPOS_FIELD_IDS.forEach((fieldId) => ($(fieldId).value = ""));
  $("modalMantenimientoEquiposOverlay").style.display = "none";
}

function onSubmitMantenimientoEquipos(e) {
  e.preventDefault();
  const nuevoRegistro = {};
  MANTENIMIENTO_EQUIPOS_FIELD_IDS.forEach((fieldId) => {
    const campo = MANTENIMIENTO_EQUIPOS_CAMPO_POR_ID[fieldId];
    nuevoRegistro[campo] = $(fieldId).value;
  });

  const solucionesSeleccionadas = Array.from(document.querySelectorAll('input[name="solucion"]:checked'))
    .map((cb) => cb.value)
    .join(", ");
  nuevoRegistro.solucion = solucionesSeleccionadas;

  if (!nuevoRegistro.equipoRef) {
    alert("Selecciona un equipo");
    return;
  }
  if (!solucionesSeleccionadas) {
    alert("Selecciona al menos una solución aplicada");
    return;
  }

  if (!mantenimientoEquiposActualId) {
    nuevoRegistro.id = crypto.randomUUID();
    mantenimientoEquiposData.push(nuevoRegistro);
  } else {
    const idx = mantenimientoEquiposData.findIndex((r) => r.id === mantenimientoEquiposActualId);
    if (idx !== -1) mantenimientoEquiposData[idx] = { ...mantenimientoEquiposData[idx], ...nuevoRegistro };
  }
  guardarMantenimientoEquipos();
  refrescarVistasSecundarias();
  cerrarModalMantenimientoEquipos();
}

function eliminarRegistroMantenimientoActual() {
  if (!mantenimientoEquiposActualId) return;
  if (!confirm("¿Eliminar este registro?")) return;
  const idx = mantenimientoEquiposData.findIndex((r) => r.id === mantenimientoEquiposActualId);
  if (idx !== -1) {
    const id = mantenimientoEquiposData[idx].id;
    mantenimientoEquiposData.splice(idx, 1);
    guardarMantenimientoEquipos();
    sincronizarEliminacionRegistroMantenimiento(id);
    refrescarVistasSecundarias();
    cerrarModalMantenimientoEquipos();
  }
}

/* ---------- Modal de ticket de garantía (nuevo / editar) ---------- */

function actualizarCampoEquipoTicketGarantia() {
  const esCanella = $("tgProveedor").value === "Canella";
  $("tgEquipo").setAttribute("list", esCanella ? "dl-impresorasSerialCatalogo" : "dl-nombreRedEquipo");
  $("tgEquipo").placeholder = esCanella ? "Serial de la impresora..." : "Nombre en Red del equipo...";
}

function abrirModalTicketGarantia(ticket) {
  $("formTicketGarantia").reset();
  if (ticket) {
    $("modalTicketGarantiaTitulo").textContent = `Editar ticket — ${ticket.numeroTicket || ""}`;
    TICKET_GARANTIA_FIELD_IDS.forEach((idCampo) => {
      const campo = TICKET_GARANTIA_CAMPO_POR_ID[idCampo];
      if (ticket[campo] !== undefined) $(idCampo).value = ticket[campo];
    });
    $("btnEliminarModalTicketGarantia").style.display = "";
  } else {
    $("modalTicketGarantiaTitulo").textContent = "Nuevo ticket de garantía";
    $("tgId").value = "";
    $("tgProveedor").value = "GBM";
    $("tgEstado").value = "Abierto";
    $("tgFechaReporte").value = new Date().toISOString().slice(0, 10);
    $("btnEliminarModalTicketGarantia").style.display = "none";
  }
  actualizarCampoEquipoTicketGarantia();
  $("modalTicketGarantiaOverlay").classList.add("open");
}

function cerrarModalTicketGarantia() {
  $("modalTicketGarantiaOverlay").classList.remove("open");
}

function onSubmitTicketGarantia(e) {
  e.preventDefault();
  const data = {};
  TICKET_GARANTIA_FIELD_IDS.forEach((idCampo) => {
    data[TICKET_GARANTIA_CAMPO_POR_ID[idCampo]] = $(idCampo).value.trim();
  });
  data.ultimaModificacion = new Date().toISOString().slice(0, 16);

  let guardado;
  if (data.id) {
    const idx = ticketsGarantiaData.findIndex((t) => t.id === data.id);
    if (idx !== -1) ticketsGarantiaData[idx] = { ...ticketsGarantiaData[idx], ...data };
    guardado = ticketsGarantiaData[idx];
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    data.reportadoPor = TECNICO_ACTUAL;
    ticketsGarantiaData.push(data);
    guardado = data;
  }
  guardarTicketsGarantia();
  sincronizarTicketGarantia(guardado);
  cerrarModalTicketGarantia();
  refrescarVistasSecundarias();
}

function eliminarTicketGarantiaActual() {
  const id = $("tgId").value;
  if (!id) return;
  if (!confirm("¿Eliminar este ticket de garantía de forma permanente?")) return;
  ticketsGarantiaData = ticketsGarantiaData.filter((t) => t.id !== id);
  guardarTicketsGarantia();
  sincronizarEliminacionTicketGarantia(id);
  cerrarModalTicketGarantia();
  refrescarVistasSecundarias();
}

/* ---------- Exportar / Importar datos entre computadoras ---------- */
/* Los datos viven en el localStorage de cada navegador, así que lo que se
   captura en una computadora no aparece en otra automáticamente. Estas
   funciones permiten mover manualmente esa información entre equipos. */

function exportarDatosJSON() {
  const blob = new Blob([JSON.stringify(equipos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `Inventario_TI_backup_${fecha}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importarDatosJSON(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    let importados;
    try {
      importados = JSON.parse(lector.result);
    } catch (err) {
      alert("El archivo no es un JSON válido de este sistema.");
      return;
    }
    if (!Array.isArray(importados)) {
      alert("El archivo no tiene el formato esperado (debe ser el exportado desde este mismo programa).");
      return;
    }

    const porId = new Map(equipos.map((e) => [e.id, e]));
    let nuevos = 0;
    let actualizados = 0;
    importados.forEach((imp) => {
      if (!imp || !imp.id) return;
      const local = porId.get(imp.id);
      if (!local) {
        equipos.push(imp);
        porId.set(imp.id, imp);
        nuevos++;
        sincronizarEquipo(imp);
      } else if ((imp.ultimaModificacion || "") > (local.ultimaModificacion || "")) {
        Object.assign(local, imp);
        actualizados++;
        sincronizarEquipo(local);
      }
    });

    guardarDatos();
    poblarFiltrosYDatalists();
    render();
    refrescarVistasSecundarias();
    alert(`Importación completa: ${nuevos} equipo(s) nuevo(s), ${actualizados} actualizado(s).`);
  };
  lector.readAsText(archivo);
}

function poblarSelect(select, valores, placeholder) {
  const actual = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  valores.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  select.value = actual;
}

function buscarMonitorCatalogo(serial) {
  const s = (serial || "").trim();
  if (!s) return null;
  const catalogo = typeof CATALOGO_MONITORES !== "undefined" && Array.isArray(CATALOGO_MONITORES) ? CATALOGO_MONITORES : [];
  return catalogo.find((m) => m.serial === s) || null;
}

function descripcionMonitorEquipo(equipo) {
  const valor = (equipo.monitor || "").trim();
  if (!valor) return "";
  const m = buscarMonitorCatalogo(valor);
  // Si no calza con el catalogo, es texto libre capturado antes de vincular al
  // catalogo (o un serial que ya no esta en el archivo de contratos) - se
  // muestra tal cual para no perder el dato.
  return m ? `${m.descripcion || m.modelo} (S/N ${m.serial})` : valor;
}

function actualizarAyudaMonitor() {
  const ayuda = $("monitorAyuda");
  const valor = $("monitor").value.trim();
  if (!valor) {
    ayuda.textContent = "";
    ayuda.classList.remove("sin-match");
    return;
  }
  const m = buscarMonitorCatalogo(valor);
  if (m) {
    ayuda.textContent = `✓ ${m.descripcion || m.modelo} · Contrato ${m.contrato} (vence ${m.fechaFin})`;
    ayuda.classList.remove("sin-match");
  } else {
    ayuda.textContent = "⚠ No coincide con un serial del catálogo (se guardará el texto tal cual)";
    ayuda.classList.add("sin-match");
  }
}

function renderSugerenciasMonitor(filtro) {
  const lista = $("monitorSugerencias");
  const catalogo = typeof CATALOGO_MONITORES !== "undefined" && Array.isArray(CATALOGO_MONITORES) ? CATALOGO_MONITORES : [];
  const t = (filtro || "").trim().toLowerCase();
  const filtrados = t ? catalogo.filter((m) => [m.serial, m.modelo, m.descripcion].join(" ").toLowerCase().includes(t)) : catalogo;

  // Sugiere primero los monitores del mismo contrato que la desktop y que
  // aún no estén asignados a ningún equipo: no hay dato que diga cuál serial
  // exacto le corresponde a cada equipo (el archivo fuente no los relaciona),
  // pero acotar por contrato + disponibilidad ahorra buscar entre ~180
  // monitores. El usuario sigue confirmando el serial físico al elegir.
  const contratoEquipo = soloNumeroContrato($("contratos")?.value || "");
  const esCandidato = (m) => contratoEquipo && m.contrato === contratoEquipo && !equipoAsignadoAMonitor(m.serial);
  const resultados = [...filtrados]
    .map((m, idx) => ({ m, idx, candidato: esCandidato(m) }))
    .sort((a, b) => (a.candidato === b.candidato ? a.idx - b.idx : a.candidato ? -1 : 1))
    .slice(0, 30)
    .map((x) => x.m);

  lista.innerHTML = "";
  if (!resultados.length) {
    lista.innerHTML = `<div class="autocomplete-item" style="cursor:default;color:#9ca3af;">Sin coincidencias en el catálogo</div>`;
    lista.classList.add("open");
    return;
  }

  resultados.forEach((m) => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    const nota = esCandidato(m) ? " · Disponible de este contrato" : "";
    item.innerHTML = `${esc(m.descripcion || m.modelo)}<small>S/N ${esc(m.serial)} · Contrato ${esc(m.contrato)}${esc(nota)}</small>`;
    // mousedown (no click) para que dispare antes del blur del input.
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      $("monitor").value = m.serial;
      lista.classList.remove("open");
      actualizarAyudaMonitor();
    });
    lista.appendChild(item);
  });
  lista.classList.add("open");
}

function inicializarAutocompleteMonitor() {
  const input = $("monitor");
  const lista = $("monitorSugerencias");
  input.addEventListener("focus", () => renderSugerenciasMonitor(""));
  input.addEventListener("input", () => {
    renderSugerenciasMonitor(input.value);
    actualizarAyudaMonitor();
  });
  input.addEventListener("blur", () => {
    setTimeout(() => lista.classList.remove("open"), 150);
  });
}

function valoresUnicos(campo) {
  return [...new Set(equipos.map((e) => String(e[campo] || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function valoresUnicosImpresoras(campo) {
  return [...new Set(impresorasData.map((p) => String(p[campo] || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function poblarFiltrosYDatalists() {
  poblarSelect($("filtroEmpresa"), valoresUnicos("empresa"), "Todas las empresas");
  poblarSelect($("filtroStatus"), valoresUnicos("status"), "Todos los status");
  poblarSelect($("filtroTipo"), valoresUnicos("tipoEquipo"), "Todos los tipos");

  const datalistMap = {
    "dl-ubicaciones": "ubicaciones",
    "dl-empresa": "empresa",
    "dl-departamento": "departamento",
    "dl-unidadNegocio": "unidadNegocio",
    "dl-status": "status",
    "dl-tipoEquipo": "tipoEquipo",
    "dl-fabricante": "fabricante",
    "dl-usuarioDominio": "usuarioDominio",
    "dl-nombreRedEquipo": "nombreRed",
    "dl-modelo": "modelo",
    "dl-numeroSerial": "numeroSerial",
    "dl-correo": "correo",
    "dl-dpi": "dpi",
    "dl-dominio": "dominio",
    "dl-tamanoDisco": "tamanoDisco",
    "dl-nombreDispositivo": "nombreDispositivo",
    "dl-serialDispositivo": "serialDispositivo",
    "dl-contratos": "contratos",
    "dl-numeroInventario": "numeroInventario",
    "dl-procesador": "procesador",
    "dl-memoria": "memoria",
    "dl-tipoDisco": "tipoDisco",
    "dl-firmwareInventario": "firmwareInventario",
    "dl-soVersion": "soVersion",
    "dl-soNucleo": "soNucleo",
    "dl-soSerial": "soSerial",
    "dl-subentidades": "subentidades",
    "dl-proyecto": "proyecto",
    "dl-puesto": "puesto",
    "dl-codigoRam": "codigoRam",
    "dl-numeroInventarioMonitor": "numeroInventarioMonitor",
    "dl-memoriaDescripcion": "memoriaDescripcion",
  };
  Object.entries(datalistMap).forEach(([dlId, campo]) => {
    const dl = $(dlId);
    dl.innerHTML = "";
    valoresUnicos(campo).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
  });

  const datalistMapImpresoras = {
    "dl-impTipoEquipoImp": "tipoEquipoImp",
    "dl-impModelo": "modelo",
    "dl-impEmpresa": "empresa",
    "dl-impDepartamento": "departamento",
    "dl-impUbicacion": "ubicacion",
    "dl-impresorasSerialCatalogo": "serial",
  };
  Object.entries(datalistMapImpresoras).forEach(([dlId, campo]) => {
    const dl = $(dlId);
    dl.innerHTML = "";
    valoresUnicosImpresoras(campo).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dl.appendChild(opt);
    });
  });

  ["dl-nombreRedActa", "dl-nombreRedIngreso"].forEach((dlId) => {
    const dlNombreRed = $(dlId);
    dlNombreRed.innerHTML = "";
    valoresUnicos("nombreRed").forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      dlNombreRed.appendChild(opt);
    });
  });
}

function esc(v) {
  return v && String(v).trim() !== "" ? v : "N/A";
}

function enlaceIp(ip) {
  const v = (ip || "").trim();
  if (!v || !/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return esc(ip);
  return `<a href="http://${v}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${v}</a>`;
}

function nonEmpty(v) {
  return v && String(v).trim() !== "" && String(v).trim().toUpperCase() !== "N/A";
}

function coincideTexto(e, texto) {
  if (!texto) return true;
  const campos = [
    "nombreRed", "nombreEmpleado", "correo", "empresa", "departamento",
    "modelo", "numeroSerial", "numeroInventario", "ubicaciones",
    "fabricante", "usuarioDominio", "codigoEmpleado", "dpi", "idGlpi", "uuid", "contratos",
  ];
  const haystack = campos.map((c) => e[c] || "").join(" ").toLowerCase();
  return haystack.includes(texto);
}

let filtroCampoVacio = null;
let filtroEnRevision = false;
let filtroPropios = false;
let filtroLenovo = false;
let filtroRiolsaTodos = false;

function obtenerFiltrados() {
  const texto = $("buscador").value.trim().toLowerCase();
  const empresa = $("filtroEmpresa").value;
  const status = $("filtroStatus").value;
  const tipo = $("filtroTipo").value;

  return equipos.filter((e) => {
    if (filtroEnRevision && !esEnRevisionCronograma(e)) return false;
    if (filtroPropios && (esServidor(e) || esEnRevisionCronograma(e) || nonEmpty(e.contratos))) return false;
    if (filtroLenovo && (esServidor(e) || esEnRevisionCronograma(e) || (e.fabricante || "").trim().toUpperCase() !== "LENOVO")) return false;
    if (filtroRiolsaTodos && (esServidor(e) || (e.empresa || "").trim().toUpperCase() !== "RIOL S.A.")) return false;
    if (filtroCampoVacio && nonEmpty(e[filtroCampoVacio])) return false;
    if ((filtroCampoVacio === "empresa" || filtroCampoVacio === "status") && esServidor(e)) return false;
    if (empresa && e.empresa !== empresa) return false;
    if (status && e.status !== status) return false;
    if (tipo) {
      const grupoTipo = tipo === "Notebook" ? ["Notebook", "Laptop"] : [tipo];
      if (!grupoTipo.includes(e.tipoEquipo)) return false;
    }
    return coincideTexto(e, texto);
  });
}

const NOMBRES_CAMPO_VACIO = {
  empresa: "Empresa", status: "Status", tipoEquipo: "Tipo de Equipo", fabricante: "Fabricante",
};

function render() {
  const avisoVacio = $("filtroVacioAviso");
  if (filtroEnRevision) {
    avisoVacio.textContent = `Mostrando los ${equipos.filter(esEnRevisionCronograma).length} equipos en revisión (no aparecen en el cronograma de migración AD 2026; valida si ya fueron dados de baja y no se quitaron del sistema). Haz clic aquí para quitar este filtro.`;
    avisoVacio.style.display = "";
  } else if (filtroPropios) {
    avisoVacio.textContent = `Mostrando equipos propios (sin contrato de renta activo). Haz clic aquí para quitar este filtro.`;
    avisoVacio.style.display = "";
  } else if (filtroLenovo) {
    avisoVacio.textContent = `Mostrando equipos Lenovo validados. Haz clic aquí para quitar este filtro.`;
    avisoVacio.style.display = "";
  } else if (filtroRiolsaTodos) {
    avisoVacio.textContent = `Mostrando equipos de RIOL S.A. Haz clic aquí para quitar este filtro.`;
    avisoVacio.style.display = "";
  } else if (filtroCampoVacio) {
    avisoVacio.textContent = `Mostrando equipos sin dato de ${NOMBRES_CAMPO_VACIO[filtroCampoVacio] || filtroCampoVacio}. Haz clic aquí para quitar este filtro.`;
    avisoVacio.style.display = "";
  } else {
    avisoVacio.style.display = "none";
  }

  const filtrados = obtenerFiltrados();
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  if (paginaActual < 1) paginaActual = 1;

  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const pagina = filtrados.slice(inicio, inicio + PAGE_SIZE);

  const tbody = $("tbodyEquipos");
  tbody.innerHTML = "";

  if (pagina.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No se encontraron equipos con los filtros aplicados.</td></tr>`;
  } else {
    pagina.forEach((e) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(e.nombreRed)}</td>
        <td><span class="badge">${esc(e.status)}</span></td>
        <td>${esc(e.nombreEmpleado)}</td>
        <td>${esc(e.empresa)}</td>
        <td>${esc(e.departamento)}</td>
        <td>${esc(e.fabricante)}</td>
        <td>${esc(e.modelo)}</td>
        <td>${esc(e.numeroSerial)}</td>
        <td>${esc(e.numeroInventario)}</td>
        <td>${esc(e.ubicaciones)}</td>
        <td class="fila-acciones"><button type="button" class="ver">Ver / Editar</button></td>
      `;
      tr.addEventListener("click", () => abrirModal(e));
      tbody.appendChild(tr);
    });
  }

  if ($("vista-computadoras").classList.contains("vista-active")) {
    $("contadorTotal").textContent = `${filtrados.length} equipo(s)`;
  }
  $("infoPagina").textContent = `Página ${paginaActual} de ${totalPaginas}`;
  $("btnPrimero").disabled = paginaActual === 1;
  $("btnAnterior").disabled = paginaActual === 1;
  $("btnSiguiente").disabled = paginaActual === totalPaginas;
  $("btnUltimo").disabled = paginaActual === totalPaginas;
}

function abrirModal(equipo) {
  poblarFiltrosYDatalists();
  $("formEquipo").reset();
  if (equipo) {
    $("modalTitulo").textContent = `Editar equipo — ${equipo.nombreRed || ""}`;
    FIELD_IDS.forEach((f) => {
      if (equipo[f] !== undefined) $(f).value = equipo[f];
    });
    if (!$("idGlpi").value.trim()) {
      $("idGlpi").value = siguienteIdGlpi();
    }
    $("btnEliminarModal").style.display = "";
  } else {
    $("modalTitulo").textContent = "Nuevo equipo";
    $("id").value = "";
    $("entidad").value = "Root Entity";
    $("status").value = "Asignada";
    $("idGlpi").value = siguienteIdGlpi();
    $("btnEliminarModal").style.display = "none";
  }
  $("nombreRedAviso").style.display = "none";
  actualizarAyudaMonitor();
  actualizarContadorMantenimientoEquipo();
  actualizarContadorGarantiaEquipo();
  $("modalOverlay").classList.add("open");
}

function cerrarModal() {
  $("modalOverlay").classList.remove("open");
}

function equipoDuplicadoPorNombreRed(nombre, idActual) {
  const n = (nombre || "").trim().toLowerCase();
  if (!n) return null;
  return equipos.find((e) => e.id !== idActual && (e.nombreRed || "").trim().toLowerCase() === n) || null;
}

function onCambioNombreRedEquipo() {
  const aviso = $("nombreRedAviso");
  const idActual = $("id").value;
  const encontrado = equipoDuplicadoPorNombreRed($("nombreRed").value, idActual);

  if (encontrado) {
    // Ya existe ese equipo: cargamos todos sus datos y pasamos a modo edición sobre ese registro.
    FIELD_IDS.forEach((f) => {
      if (encontrado[f] !== undefined) $(f).value = encontrado[f];
    });
    if (!$("idGlpi").value.trim()) {
      $("idGlpi").value = siguienteIdGlpi();
    }
    $("modalTitulo").textContent = `Editar equipo — ${encontrado.nombreRed || ""}`;
    $("btnEliminarModal").style.display = "";
    aviso.textContent = `Se cargaron los datos del equipo existente (${encontrado.empresa || "N/A"} · ${encontrado.nombreEmpleado || "sin usuario"}). Revisa/edita lo que necesites y da clic en Guardar.`;
    aviso.className = "acta-estado";
    aviso.style.display = "";
    actualizarAyudaMonitor();
    actualizarContadorMantenimientoEquipo();
  actualizarContadorGarantiaEquipo();
  } else {
    aviso.style.display = "none";
    aviso.textContent = "";
  }
}

function onSubmit(e) {
  e.preventDefault();
  const data = {};
  FIELD_IDS.forEach((f) => (data[f] = $(f).value.trim()));

  if (equipoDuplicadoPorNombreRed(data.nombreRed, data.id)) {
    alert("Ya existe otro equipo con este Nombre en Red. Cambia el nombre o busca y edita el equipo existente en vez de crear uno duplicado.");
    return;
  }

  data.ultimaModificacion = new Date().toISOString().slice(0, 16);

  let guardado;
  if (data.id) {
    const idx = equipos.findIndex((eq) => eq.id === data.id);
    if (idx !== -1) equipos[idx] = { ...equipos[idx], ...data };
    guardado = equipos[idx];
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    equipos.push(data);
    guardado = data;
  }
  guardarDatos();
  sincronizarEquipo(guardado);
  cerrarModal();
  poblarFiltrosYDatalists();
  render();
  refrescarVistasSecundarias();
}

function eliminarActual() {
  const id = $("id").value;
  if (!id) return;
  if (!confirm("¿Eliminar este registro de forma permanente?")) return;
  equipos = equipos.filter((e) => e.id !== id);
  guardarDatos();
  sincronizarEliminacion(id);
  cerrarModal();
  poblarFiltrosYDatalists();
  render();
  refrescarVistasSecundarias();
}

/* ---------- Modal de impresoras (nueva / editar) ---------- */

function abrirModalImpresora(impresora) {
  $("formImpresora").reset();
  if (impresora) {
    $("modalImpresoraTitulo").textContent = `Editar impresora — ${impresora.modelo || impresora.serial || ""}`;
    IMPRESORA_FIELD_IDS.forEach((idCampo) => {
      const campo = IMPRESORA_CAMPO_POR_ID[idCampo];
      if (impresora[campo] !== undefined) $(idCampo).value = impresora[campo];
    });
    $("btnEliminarModalImpresora").style.display = "";
  } else {
    $("modalImpresoraTitulo").textContent = "Nueva impresora";
    $("impId").value = "";
    $("impTipo").value = "B/N";
    $("btnEliminarModalImpresora").style.display = "none";
  }
  $("modalImpresoraOverlay").classList.add("open");
}

function cerrarModalImpresora() {
  $("modalImpresoraOverlay").classList.remove("open");
}

function onSubmitImpresora(e) {
  e.preventDefault();
  const data = {};
  IMPRESORA_FIELD_IDS.forEach((idCampo) => {
    data[IMPRESORA_CAMPO_POR_ID[idCampo]] = $(idCampo).value.trim();
  });
  data.ultimaModificacion = new Date().toISOString().slice(0, 16);

  let guardada;
  if (data.id) {
    const idx = impresorasData.findIndex((p) => p.id === data.id);
    if (idx !== -1) impresorasData[idx] = { ...impresorasData[idx], ...data };
    guardada = impresorasData[idx];
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    impresorasData.push(data);
    guardada = data;
  }
  guardarImpresoras();
  sincronizarImpresora(guardada);
  cerrarModalImpresora();
  poblarFiltrosYDatalists();
  refrescarVistasSecundarias();
}

function eliminarImpresoraActual() {
  const id = $("impId").value;
  if (!id) return;
  if (!confirm("¿Eliminar esta impresora de forma permanente?")) return;
  impresorasData = impresorasData.filter((p) => p.id !== id);
  guardarImpresoras();
  sincronizarEliminacionImpresora(id);
  cerrarModalImpresora();
  poblarFiltrosYDatalists();
  refrescarVistasSecundarias();
}

/* ---------- Modal de códigos de usuario (nuevo / editar) ---------- */

function abrirModalCodigo(codigo) {
  $("formCodigo").reset();
  if (codigo) {
    $("modalCodigoTitulo").textContent = `Editar código — ${codigo.nombre || ""}`;
    CODIGO_FIELD_IDS.forEach((idCampo) => {
      const campo = CODIGO_CAMPO_POR_ID[idCampo];
      if (codigo[campo] !== undefined) $(idCampo).value = codigo[campo];
    });
    $("codAgregadoPor").value = codigo.agregadoPor || TECNICO_ACTUAL || "Sin identificar";
    $("btnEliminarModalCodigo").style.display = "";
  } else {
    $("modalCodigoTitulo").textContent = "Nuevo código de usuario";
    $("codId").value = "";
    $("codAgregadoPor").value = TECNICO_ACTUAL || "Sin identificar";
    $("btnEliminarModalCodigo").style.display = "none";
  }
  $("modalCodigoOverlay").classList.add("open");
}

function cerrarModalCodigo() {
  $("modalCodigoOverlay").classList.remove("open");
}

function codigoExistente(idUsuario, idActual) {
  const idU = (idUsuario || "").trim().toLowerCase();
  if (!idU) return null;
  return codigosData.find((c) => c.id !== idActual && (c.idUsuario || "").trim().toLowerCase() === idU) || null;
}

function onSubmitCodigo(e) {
  e.preventDefault();
  const esNuevo = !$("codId").value.trim();
  const data = {};
  CODIGO_FIELD_IDS.forEach((idCampo) => {
    data[CODIGO_CAMPO_POR_ID[idCampo]] = $(idCampo).value.trim();
  });

  // Solo se valida al crear un registro nuevo: el catalogo importado del
  // Excel ya trae miles de IDs repetidos de forma legitima (historial de
  // reasignaciones), asi que exigir unicidad al editar esos registros
  // bloquearia guardar cosas que llevan años asi sin ser un error real.
  if (esNuevo) {
    const existente = codigoExistente(data.idUsuario, data.id);
    if (existente) {
      alert(
        `El ID "${data.idUsuario}" ya está en uso por ${existente.nombre || "otro usuario"} (clave ${existente.clave || "N/A"}, ${existente.origen || "sin departamento"}). Usa otro ID o edita ese registro existente en vez de crear uno nuevo.`
      );
      return;
    }
  }

  data.ultimaModificacion = new Date().toISOString().slice(0, 16);

  let guardado;
  if (data.id) {
    const idx = codigosData.findIndex((c) => c.id === data.id);
    if (idx !== -1) codigosData[idx] = { ...codigosData[idx], ...data };
    guardado = codigosData[idx];
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    codigosData.push(data);
    guardado = data;
  }
  guardarCodigos();
  sincronizarCodigo(guardado);
  cerrarModalCodigo();
  refrescarVistasSecundarias();
}

function eliminarCodigoActual() {
  const id = $("codId").value;
  if (!id) return;
  if (!confirm("¿Eliminar este código de forma permanente?")) return;
  codigosData = codigosData.filter((c) => c.id !== id);
  guardarCodigos();
  sincronizarEliminacionCodigo(id);
  cerrarModalCodigo();
  refrescarVistasSecundarias();
}

function formatearFecha(iso) {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  const hora = d.getHours();
  const h12 = hora % 12 === 0 ? 12 : hora % 12;
  const ampm = hora >= 12 ? "p.m." : "a.m.";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(h12)}:${pad(d.getMinutes())} ${ampm}`;
}

function siguienteNumeroForma() {
  const n = parseInt(localStorage.getItem(CONTADOR_KEY) || "0", 10) + 1;
  localStorage.setItem(CONTADOR_KEY, String(n));
  return `Forma-TI-${String(n).padStart(3, "0")}`;
}

function siguienteIdGlpi() {
  const max = equipos.reduce((acc, e) => {
    const n = parseInt((e.idGlpi || "").trim(), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return String(max + 1);
}

function buscarEquipoPorNombreRed(nombre) {
  const n = (nombre || "").trim().toLowerCase();
  if (!n) return null;
  return equipos.find((e) => (e.nombreRed || "").trim().toLowerCase() === n) || null;
}

/* ---------- Generación del Acta impresa (Forma-TI-001) ---------- */

function filaActa(etiqueta, valor) {
  return `<div class="acta-fila"><div class="etiqueta">${etiqueta}</div><div class="valor">${esc(valor)}</div></div>`;
}

function firmaTecnicoPara(nombre) {
  const n = (nombre || "").trim().toLowerCase();
  if (n === "victor morales" && typeof FIRMA_TECNICO_B64 !== "undefined") return FIRMA_TECNICO_B64;
  if (n === "eder rosales" && typeof FIRMA_EDER_B64 !== "undefined") return FIRMA_EDER_B64;
  return "";
}

function formatearFechaSimple(valor) {
  if (!valor) return "N/A";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor).trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return valor;
}

function obtenerMonitorDetectadoTIv2(equipo) {
  // El Agente de Inventario TI detecta el monitor fisico conectado (via EDID/
  // WmiMonitorID) y lo guarda en equiposTI_v2, buscado por nombre de equipo en
  // red. Se prefiere sobre el campo "monitor" capturado a mano, que puede
  // quedar desactualizado si el monitor cambio.
  const nombreRed = (equipo.nombreRed || "").trim().toLowerCase();
  if (!nombreRed || typeof equiposTIv2Data === "undefined") return "";
  const doc = equiposTIv2Data.find((e) => (e.computadora || e.equipoId || "").trim().toLowerCase() === nombreRed);
  if (!doc) return "";
  return formatearMonitorTIv2(doc.hardware || {});
}

function actaHTML(equipo, transaccion) {
  const declarante = transaccion.declarante || equipo.nombreEmpleado || "___________________________";
  const accion = transaccion.accion === "Devolucion" ? "Devuelvo" : "Recibo";

  return `
    <div class="acta">
      <div class="acta-header">
        <div>
          <div class="empresa-label">Empresa:</div>
          <div class="empresa-nombre">${esc(equipo.empresa)}</div>
        </div>
        <div><div class="depto-nombre">Departamento de Tecnología de Información TI</div></div>
        <div>
          <div class="fecha-valor">${formatearFecha(new Date().toISOString())}</div>
          <div class="fecha-label">Fecha de Registro</div>
        </div>
        <div><div class="forma-valor">${transaccion.numeroForma}</div></div>
        <div><span class="logo">&#128269; Data Analytics TI</span></div>
      </div>

      <div class="acta-top3">
        <div class="etiqueta">Status de Equipo:</div>
        <div class="valor">${esc(equipo.status)}</div>
        <div class="etiqueta">Código Empleado:</div>
        <div class="valor">${esc(equipo.codigoEmpleado)}</div>
        <div class="etiqueta">DPI/No. Pasaporte:</div>
        <div class="valor">${esc(equipo.dpi)}</div>

        <div class="etiqueta">Ip Impresora Asig:</div>
        <div class="valor">${esc(equipo.ipImpresora)}</div>
        <div class="etiqueta">Nombre Dispositivo:</div>
        <div class="valor">${esc(equipo.nombreDispositivo)}</div>
        <div class="etiqueta">Serial Dispositivo:</div>
        <div class="valor">${esc(equipo.serialDispositivo)}</div>
      </div>

      <div class="acta-content">
        <div class="acta-datos">
          ${filaActa("Nombre Equipo en Red:", equipo.nombreRed)}
          <div class="acta-fila combo">
            <div class="etiqueta">Id de Equipo:</div>
            <div class="valor">${esc(equipo.idGlpi)}</div>
            <div class="etiqueta">uuid:</div>
            <div class="valor">${esc(equipo.uuid)}</div>
          </div>
          ${filaActa("Usuario de Dominio:", equipo.usuarioDominio)}
          ${filaActa("Nombre de Usuario:", equipo.nombreEmpleado)}
          ${filaActa("Dominio:", equipo.dominio)}
          ${filaActa("Correo de Usuario:", equipo.correo)}
          ${filaActa("Contratos:", soloNumeroContrato(equipo.contratos))}
          ${filaActa("Ubicación:", equipo.ubicaciones)}
          ${filaActa("Departamento:", equipo.departamento)}
          ${filaActa("Unidad de Negocio:", equipo.unidadNegocio)}
          ${filaActa("Empresa:", equipo.empresa)}
          ${filaActa("Tipo de Equipo:", equipo.tipoEquipo)}
          ${filaActa("Marca de Equipo:", equipo.fabricante)}
          ${filaActa("Modelo Equipo:", equipo.modelo)}
          ${filaActa("Memoria Ram (GB):", equipo.memoria)}
          ${filaActa("Tamaño Disco (GB):", equipo.tamanoDisco)}
          ${filaActa("Service Tag:", equipo.numeroSerial)}
          ${filaActa("Descripción Procesador:", equipo.procesador)}
          ${filaActa("Monitor:", descripcionMonitorEquipo(equipo))}
          ${filaActa("Activo Fijo Monitor:", equipo.numeroInventarioMonitor)}
          ${filaActa("Activo Fijo:", equipo.numeroInventario)}
        </div>
        <div class="formulario-derecha">
          <div class="formulario-box">
            <h2>Formulario Equipo de Cómputo</h2>
            <p>Yo, <strong class="destacado">${esc(declarante)}</strong> declaro que:</p>
            <ul>
              <li><strong>a.</strong> ${accion} el equipo de cómputo consistente <strong class="destacado">${esc(equipo.nombreRed)}</strong> en perfecto estado de funcionamiento y en buen estado de conservación, sin golpes que impidan su buen funcionamiento.</li>
              <li><strong>b.</strong> Me hago responsable de darle a este equipo únicamente el uso profesional que mi puesto de trabajo requiere.</li>
              <li><strong>c.</strong> Utilizaré este equipo con el debido cuidado en su manejo, tanto en el hardware como en el software, no navegando ni descargando archivos, aplicaciones o páginas cuya naturaleza no tenga relación con el puesto laboral que desempeño.</li>
              <li><strong>d.</strong> Conozco que este equipo tiene un seguro con cobertura básica, pensada en el uso profesional y prudente del mismo en relación a mi puesto de trabajo, y por lo tanto indemnizaré personal.</li>
            </ul>
            ${transaccion.observaciones ? `<p><strong>Observaciones:</strong> ${transaccion.observaciones}</p>` : ""}

            <div class="firmas">
              <div class="firma-bloque">
                ${firmaTecnicoPara(transaccion.tecnico) ? `<img class="firma-img" src="${firmaTecnicoPara(transaccion.tecnico)}" alt="Firma técnico">` : ""}
                <div class="firma-linea">${esc(transaccion.tecnico)}<br>Nombre y firma de Técnico de Soporte</div>
              </div>
              <div><div class="firma-linea">Nombre y firma de Usuario</div></div>
            </div>
            <div class="firmas">
              <div></div>
              <div class="firma-bloque">
                ${typeof FIRMA_JEFE_B64 !== "undefined" ? `<img class="firma-img" src="${FIRMA_JEFE_B64}" alt="Firma jefe de operaciones">` : ""}
                <div class="firma-linea">${esc(transaccion.jefe)}<br>Nombre y firma de Jefe de Operaciones TI</div>
              </div>
            </div>
          </div>
          <div class="clausula">
            La entidad hace entrega al trabajador de bienes del inventario, propiedad de la empresa que aparece detallada
            en este documento, el cual le es confiado para que sea utilizado exclusivamente para la ejecución de su
            trabajo en calidad de depósito, estando obligado por ende a rendir cuentas de su uso, así como a devolverlo
            en cualquier momento a su requerimiento, aceptando el trabajador que la inobservancia a lo antes estipulado,
            constituirá falta, sujeta a la aplicación de medidas disciplinarias, sin perjuicio de las demás
            responsabilidades, civiles, penales y de cualquier otra índole, en las que pueda incurrir el trabajador por
            incumplimiento de lo antes estipulado.
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderActa(equipo, transaccion) {
  $("printArea").innerHTML = actaHTML(equipo, transaccion);
  window.print();
}

function imprimirDesdeEdicion() {
  const equipo = {};
  FIELD_IDS.forEach((f) => (equipo[f] = $(f).value.trim()));
  renderActa(equipo, {
    accion: (equipo.status || "").toLowerCase().includes("devol") ? "Devolucion" : "Entrega",
    declarante: equipo.nombreEmpleado,
    tecnico: TECNICO_ACTUAL || "Sin identificar",
    jefe: "Gustavo A. García Avila",
    observaciones: equipo.comentarios || "",
    numeroForma: siguienteNumeroForma(),
  });
}

/* ---------- Generación de la Tarjeta de Responsabilidad (Nuevo Ingreso) ---------- */

function soloNumeroContrato(valor) {
  if (!valor) return valor;
  return String(valor).trim().split(/\s*\(/)[0].trim();
}

function fechaLarga(valor) {
  if (!valor) return "N/A";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor).trim());
  if (!m) return valor;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${parseInt(m[3], 10)} de ${MESES[parseInt(m[2], 10) - 1]} de ${m[1]}`;
}

function tarjetaHTML(equipo, transaccion) {
  const esDesktop = equipo.tipoEquipo === "Desktop";
  const colDescripcion = esDesktop ? "DESCRIPCION DESKTOP - MONITOR" : "DESCRIPCION LAPTOP";
  const colSerial = esDesktop ? "S/N DESKTOP" : "S/N LAPTOP";
  const colAccesorio = esDesktop ? "S/N MONITOR" : "CODIGO RAM";
  const valorAccesorio = esDesktop ? equipo.monitor : equipo.codigoRam;

  return `
    <div class="tarjeta">
      <div class="tarjeta-titulo">TARJETA DE RESPONSABILIDAD</div>

      <table class="tarjeta-info">
        <tr>
          <td class="tlabel">NOMBRE:</td><td class="tvalue">${esc(equipo.nombreEmpleado)}</td>
          <td class="tlabel">DEPARTAMENTO:</td><td class="tvalue">${esc(equipo.departamento)}</td>
        </tr>
        <tr>
          <td class="tlabel">PUESTO:</td><td class="tvalue">${esc(equipo.puesto)}</td>
          <td class="tlabel">AREA:</td><td class="tvalue">${esc(equipo.unidadNegocio)}</td>
        </tr>
        <tr>
          <td class="tlabel">AGENCIA:</td><td class="tvalue plano">${esc(equipo.ubicaciones)}</td>
          <td class="tlabel">CODIGO SAP:</td><td class="tvalue plano">${esc(equipo.codigoEmpleado)}</td>
        </tr>
        <tr>
          <td class="tlabel">FECHA DE INGRESO:</td><td class="tvalue plano subrayado">${fechaLarga(equipo.fechaIngresoEquipo)}</td>
          <td class="tlabel">CONTRATO:</td><td class="tvalue plano">${esc(soloNumeroContrato(equipo.contratos))}</td>
        </tr>
      </table>

      <p class="tarjeta-clausula">
        La entidad <span class="tvalue-inline">_____________Tecnoelect___________________</span> hace entrega al trabajador de bienes del inventario
        propiedad de la empresa que aparece marcado con una X del listado abajo enumerado, el cual le es confiado para que sea
        utilizado exclusivamente para la ejecución de su trabajo en calidad de depósito estando obligado por ende a rendir
        cuentas de su uso así como a devolverlo en cualquier momento a su requerimiento, aceptando el trabajador que la
        inobservancia a lo antes estipulado, constituirá falta, sujeta a la aplicación de medidas disciplinarias, sin perjuicio
        de las demás responsabilidades, civiles, penales y de cualquier otra índole, en las que pueda incurrir el trabajador
        por incumplimiento de lo antes estipulado.
      </p>

      <table class="tarjeta-tabla">
        <thead>
          <tr><th>CANTIDAD</th><th>${colDescripcion}</th><th>${colSerial}</th><th>${colAccesorio}</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td class="tvalue">${esc(equipo.modelo)}</td>
            <td class="tvalue">${esc(equipo.numeroSerial)}</td>
            <td class="tvalue">${!esDesktop ? "" : esc(valorAccesorio)}</td>
          </tr>
          <tr>
            <td>${nonEmpty(equipo.memoriaDescripcion) ? "1" : ""}</td>
            <td class="tvalue">${nonEmpty(equipo.memoriaDescripcion) ? esc(equipo.memoriaDescripcion) : ""}</td>
            <td></td>
            <td class="tvalue">${esDesktop ? "" : esc(valorAccesorio)}</td>
          </tr>
          <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
          <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
        </tbody>
      </table>

      <table class="tarjeta-pie">
        <tr>
          <td class="tarjeta-pie-firma">FIRMA: <span class="linea-firma"></span></td>
          <td></td>
        </tr>
        <tr>
          <td class="tlabel">DPI: <span class="tvalue">${esc(equipo.dpi)}</span></td>
          <td></td>
        </tr>
        <tr>
          <td class="tlabel">Activo Fijo: <span class="tvalue">${esc(equipo.numeroInventario)}</span></td>
          <td></td>
        </tr>
        <tr>
          <td class="tlabel">Fecha de Entrega: <span class="tvalue subrayado">${fechaLarga(transaccion.fechaEntrega)}</span></td>
          <td class="tarjeta-pie-entrego">Entrego: <span class="tvalue subrayado">${esc(transaccion.tecnico)}</span></td>
        </tr>
      </table>
    </div>
  `;
}

/* ---------- Modal "Generar Acta" ---------- */

function abrirModalActa() {
  poblarFiltrosYDatalists();
  $("actaNombreRed").value = "";
  $("actaAccion").value = "Entrega";
  $("actaDeclarante").value = "";
  $("actaObservaciones").value = "";
  $("actaTecnico").value = TECNICO_ACTUAL || "Sin identificar";
  $("actaJefe").value = "Gustavo A. García Avila";
  $("actaEstado").textContent = "Escribe o selecciona el Nombre en Red de un equipo ya registrado para autocompletar el acta.";
  $("actaEstado").className = "acta-estado";
  $("modalActaOverlay").classList.add("open");
  $("actaNombreRed").focus();
}

function cerrarModalActa() {
  $("modalActaOverlay").classList.remove("open");
}

function onCambioNombreRedActa() {
  const equipo = buscarEquipoPorNombreRed($("actaNombreRed").value);
  if (equipo) {
    $("actaEstado").textContent = `Equipo encontrado: ${equipo.empresa || "N/A"} · ${equipo.status || "N/A"} · ${equipo.nombreEmpleado || "sin usuario asignado"}. Se autocompletarán todos los datos del acta.`;
    $("actaEstado").className = "acta-estado";
    if (!$("actaDeclarante").value) $("actaDeclarante").value = equipo.nombreEmpleado || "";
    if ((equipo.status || "").toLowerCase().includes("devol")) $("actaAccion").value = "Devolucion";
  } else if ($("actaNombreRed").value.trim()) {
    $("actaEstado").textContent = "No se encontró ningún equipo con ese Nombre en Red. Puedes registrarlo primero con \"+ Nuevo equipo\", o generar el acta solo con este nombre.";
    $("actaEstado").className = "acta-estado no-encontrado";
  } else {
    $("actaEstado").textContent = "Escribe o selecciona el Nombre en Red de un equipo ya registrado para autocompletar el acta.";
    $("actaEstado").className = "acta-estado";
  }
}

function generarEImprimirActa() {
  const nombreRed = $("actaNombreRed").value.trim();
  if (!nombreRed) {
    alert("Escribe el Nombre en Red del equipo.");
    return;
  }
  const equipo = buscarEquipoPorNombreRed(nombreRed) || { nombreRed };
  const tecnico = $("actaTecnico").value.trim();
  const jefe = $("actaJefe").value.trim();

  renderActa(equipo, {
    accion: $("actaAccion").value,
    declarante: $("actaDeclarante").value.trim(),
    tecnico,
    jefe,
    observaciones: $("actaObservaciones").value.trim(),
    numeroForma: siguienteNumeroForma(),
  });
  cerrarModalActa();
}

/* ---------- Modal "Nuevo Ingreso" (recepción de equipo de bodega) ---------- */

const CAMPOS_INGRESO_EQUIPO = {
  ingresoNombreRed: "nombreRed",
  ingresoTipoEquipo: "tipoEquipo",
  ingresoFabricante: "fabricante",
  ingresoModelo: "modelo",
  ingresoContrato: "contratos",
  ingresoSerial: "numeroSerial",
  ingresoInventario: "numeroInventario",
  ingresoMemoria: "memoria",
  ingresoMonitor: "monitor",
  ingresoCodigoRam: "codigoRam",
  ingresoMemoriaDescripcion: "memoriaDescripcion",
  ingresoNombreEmpleado: "nombreEmpleado",
  ingresoPuesto: "puesto",
  ingresoDepartamento: "departamento",
  ingresoArea: "unidadNegocio",
  ingresoEmpresa: "empresa",
  ingresoAgencia: "ubicaciones",
  ingresoCodigoSap: "codigoEmpleado",
  ingresoDpi: "dpi",
  ingresoFechaIngresoEquipo: "fechaIngresoEquipo",
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function abrirModalIngreso() {
  poblarFiltrosYDatalists();
  Object.keys(CAMPOS_INGRESO_EQUIPO).forEach((id) => ($(id).value = ""));
  $("ingresoFabricante").value = "LENOVO";
  $("ingresoAgencia").value = "Bodega 2";
  $("ingresoFechaEntrega").value = hoyISO();
  $("ingresoTecnico").value = TECNICO_ACTUAL || "Sin identificar";
  $("ingresoObservaciones").value = "";
  $("ingresoEstado").textContent = "Escribe el Nombre en Red: si ya existe en el inventario se actualizará, si no, se creará como equipo nuevo.";
  $("ingresoEstado").className = "acta-estado";
  $("modalIngresoOverlay").classList.add("open");
  $("ingresoNombreRed").focus();
}

function cerrarModalIngreso() {
  $("modalIngresoOverlay").classList.remove("open");
}

function onCambioNombreRedIngreso() {
  const equipo = buscarEquipoPorNombreRed($("ingresoNombreRed").value);
  if (equipo) {
    Object.entries(CAMPOS_INGRESO_EQUIPO).forEach(([campoId, campoEquipo]) => {
      if (campoId === "ingresoNombreRed" || campoId === "ingresoAgencia") return;
      $(campoId).value = equipo[campoEquipo] || "";
    });
    $("ingresoEstado").textContent = `Ya existe un equipo con este Nombre en Red (${equipo.empresa || "N/A"} · ${equipo.status || "N/A"}). Se cargaron sus datos actuales; edita solo lo que cambió.`;
    $("ingresoEstado").className = "acta-estado";
  } else if ($("ingresoNombreRed").value.trim()) {
    $("ingresoEstado").textContent = "No existe todavía: se creará como un equipo nuevo en el inventario.";
    $("ingresoEstado").className = "acta-estado";
  } else {
    $("ingresoEstado").textContent = "Escribe el Nombre en Red: si ya existe en el inventario se actualizará, si no, se creará como equipo nuevo.";
    $("ingresoEstado").className = "acta-estado";
  }
}

function generarIngresoCompleto() {
  const nombreRed = $("ingresoNombreRed").value.trim();
  const numeroSerial = $("ingresoSerial").value.trim();
  const nombreEmpleado = $("ingresoNombreEmpleado").value.trim();
  const dpi = $("ingresoDpi").value.trim();

  if (!nombreRed || !numeroSerial) {
    alert("Escribe al menos el Nombre en Red y el Número de Serial del equipo.");
    return;
  }
  if (!nombreEmpleado || !dpi) {
    alert("Escribe el nombre y el DPI de la persona que recibirá el equipo.");
    return;
  }

  let equipo = buscarEquipoPorNombreRed(nombreRed);
  const esNuevo = !equipo;
  if (!equipo) {
    equipo = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), entidad: "Root Entity" };
  }

  Object.entries(CAMPOS_INGRESO_EQUIPO).forEach(([campoId, campoEquipo]) => {
    equipo[campoEquipo] = $(campoId).value.trim();
  });
  equipo.status = equipo.status && !esNuevo ? equipo.status : "Nuevo > Asignado";
  equipo.comentarios = $("ingresoObservaciones").value.trim() || equipo.comentarios || "";
  equipo.ultimaModificacion = new Date().toISOString().slice(0, 16);

  if (esNuevo) {
    equipos.push(equipo);
  } else {
    const idx = equipos.findIndex((e) => e.id === equipo.id);
    if (idx !== -1) equipos[idx] = equipo;
  }
  guardarDatos();
  sincronizarEquipo(equipo);

  const tecnico = $("ingresoTecnico").value.trim();
  const transaccion = {
    accion: "Entrega",
    declarante: nombreEmpleado,
    tecnico,
    jefe: "Gustavo A. García Avila",
    observaciones: $("ingresoObservaciones").value.trim(),
    numeroForma: siguienteNumeroForma(),
    fechaEntrega: $("ingresoFechaEntrega").value,
  };

  $("printArea").innerHTML = `${actaHTML(equipo, transaccion)}${tarjetaHTML(equipo, transaccion)}`;
  window.print();

  cerrarModalIngreso();
  poblarFiltrosYDatalists();
  render();
  refrescarVistasSecundarias();
}

/* ---------- Navegación de vistas (sidebar) ---------- */

function refrescarVistasSecundarias() {
  renderTablero();
  vistaUsuarios.render();
  vistaMonitores.render();
  vistaCatalogoMonitores.render();
  vistaCatalogoImpresoras.render();
  vistaCodigos.render();
  vistaDispositivos.render();
  vistaContratos.render();
  vistaTicketsGarantia.render();
  vistaMantenimientoEquipos.render();
  vistaContadoresImpresoras.render();
  renderResumenToner();
  renderSalidasToner();
  vistaEquiposTIv2.render();
}

function cambiarVista(nombre) {
  document.querySelectorAll(".vista").forEach((v) => v.classList.remove("vista-active"));
  const destino = $(`vista-${nombre}`);
  if (destino) destino.classList.add("vista-active");

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  const boton = document.querySelector(`.nav-item[data-vista="${nombre}"]`);
  if (boton) {
    boton.classList.add("active");
    $("breadcrumbActual").textContent = boton.dataset.titulo || nombre;
  }

  if (nombre === "tablero") renderTablero();
  else if (nombre === "computadoras") render();
  else if (nombre === "usuarios") vistaUsuarios.render();
  else if (nombre === "monitores") {
    vistaMonitores.render();
    vistaCatalogoMonitores.render();
  }
  else if (nombre === "impresoras") vistaCatalogoImpresoras.render();
  else if (nombre === "dispositivos") vistaDispositivos.render();
  else if (nombre === "contratos") vistaContratos.render();
  else if (nombre === "ticketsGarantia") vistaTicketsGarantia.render();
  else if (nombre === "mantenimientoEquipos") vistaMantenimientoEquipos.render();
  else if (nombre === "contadoresImpresoras") {
    vistaContadoresImpresoras.render();
    renderResumenToner();
  }
  else if (nombre === "ingresoToner") renderFormularioIngresoToner();
  else if (nombre === "equiposTIv2") vistaEquiposTIv2.render();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => cambiarVista(btn.dataset.vista));
});

/* ---------- Tablero ---------- */

const TIPOS_SERVIDOR = [
  "VMware", "Xen", "Hyper-V", "PRD-VIRTUAL", "DESA-VIRTUAL",
  "Rack Mount Chassis", "Main System Chassis",
];

function esServidor(e) {
  return TIPOS_SERVIDOR.includes((e.tipoEquipo || "").trim());
}

const MARCA_CRONOGRAMA = "no aparece en el cronograma de migracion AD";

function esEnRevisionCronograma(e) {
  return (e.comentarios || "").includes(MARCA_CRONOGRAMA);
}

const ALIAS_TIPO_EQUIPO = { Laptop: "Notebook" };

function contarPor(campo, { excluirServidores, soloServidores, excluirEnRevision, agruparTipoEquipo } = {}) {
  const conteo = {};
  equipos.forEach((e) => {
    if (excluirServidores && esServidor(e)) return;
    if (soloServidores && !esServidor(e)) return;
    if (excluirEnRevision && esEnRevisionCronograma(e)) return;
    let v = String(e[campo] || "").trim() || "Sin dato";
    if (agruparTipoEquipo) v = ALIAS_TIPO_EQUIPO[v] || v;
    conteo[v] = (conteo[v] || 0) + 1;
  });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
}

function extraerFechaVenceContrato(valor) {
  const m = /\(vence\s*([^)]+)\)/i.exec(String(valor || ""));
  return m ? m[1].trim() : "";
}

function construirContratosLenovo(equiposValidados) {
  const porContrato = {};
  equiposValidados
    .filter((e) => (e.fabricante || "").trim().toUpperCase() === "LENOVO" && nonEmpty(e.contratos))
    .forEach((e) => {
      const numero = soloNumeroContrato(e.contratos) || "Sin número";
      const fecha = extraerFechaVenceContrato(e.contratos);
      if (!porContrato[numero]) porContrato[numero] = { fecha, desktop: 0, laptop: 0, otros: 0 };
      if (fecha && !porContrato[numero].fecha) porContrato[numero].fecha = fecha;

      // "Desktop" en este reporte agrupa todos los factores de forma de escritorio
      // (Desktop, Mini PC, Mini Tower, Low Profile Desktop), no solo el tipo
      // literal "Desktop" - de lo contrario Mini PC/Mini Tower caian en "Otros".
      const tipo = ALIAS_TIPO_EQUIPO[e.tipoEquipo] || e.tipoEquipo || "";
      const esDesktopFamilia = ["Desktop", "Mini PC", "Mini Tower", "Low Profile Desktop"].includes(tipo);
      if (esDesktopFamilia) porContrato[numero].desktop++;
      else if (tipo === "Notebook") porContrato[numero].laptop++;
      else porContrato[numero].otros++;
    });

  return Object.entries(porContrato)
    .map(([numero, d]) => ({ numero, ...d, total: d.desktop + d.laptop + d.otros }))
    .sort((a, b) => b.total - a.total);
}

let contratosLenovoFilas = [];

function fechaVenceEnAnio(fecha, anio) {
  const m = /\/(\d{4})\s*$/.exec(String(fecha || "").trim());
  return !!m && m[1] === String(anio);
}

function ordenMesDia(fecha) {
  const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}\s*$/.exec(String(fecha || "").trim());
  if (!m) return 9999;
  return parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
}

const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function nombreMesDeFecha(fecha) {
  const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}\s*$/.exec(String(fecha || "").trim());
  return m ? NOMBRES_MES[parseInt(m[2], 10) - 1] || "" : "";
}

function renderListaContratosConMes(idLista, filas, hex) {
  const paleta = generarPaletaDona(hex, Math.max(filas.length, 1));
  const encabezado = `<div class="fila-dona-header"><span></span><span>Contrato</span><span>Mes</span><span>Equipos</span></div>`;
  const filasHtml = filas
    .map(
      (f, i) => `
        <div class="tablero-fila fila-dona fila-dona-mes clickable" data-idx="${i}" data-campo-contrato-lenovo="contratoLenovo" data-valor="${esc(f.numero)}">
          <span class="punto-dona" style="background:${paleta[i]}"></span>
          <span class="nombre-dona">${esc(f.numero)}</span>
          <span class="mes-dona">${esc(nombreMesDeFecha(f.fecha))}</span>
          <span class="valor">${f.total}</span>
        </div>
      `
    )
    .join("");
  $(idLista).innerHTML = encabezado + filasHtml;
}

function renderContratosLenovo(equiposValidados) {
  contratosLenovoFilas = construirContratosLenovo(equiposValidados);
  const totalGeneral = contratosLenovoFilas.reduce((s, f) => s + f.total, 0);
  const datosDona = contratosLenovoFilas.map((f) => [f.numero, f.total]);
  pintarPanelConDona({
    idDona: "tableroContratoDona", idLista: "tableroContrato", campo: "contratoLenovo",
    atributoCampo: "data-campo-contrato-lenovo",
    datosTop: datosDona, total: totalGeneral, hex: "#7c3aed", modo: "B",
  });

  const filasVence2027 = contratosLenovoFilas
    .filter((f) => fechaVenceEnAnio(f.fecha, 2027))
    .sort((a, b) => ordenMesDia(a.fecha) - ordenMesDia(b.fecha));
  const totalVence2027 = filasVence2027.reduce((s, f) => s + f.total, 0);
  pintarPanelConDona({
    idDona: "tableroContratoVence2027Dona", idLista: "tableroContratoVence2027", campo: "contratoLenovo",
    atributoCampo: "data-campo-contrato-lenovo",
    datosTop: filasVence2027.map((f) => [f.numero, f.total]), total: totalVence2027, hex: "#dc2626", modo: "B",
  });
  renderListaContratosConMes("tableroContratoVence2027", filasVence2027, "#dc2626");

  $("contratoLenovoDetalleWrap").style.display = "none";
}

function mostrarDetalleContratoLenovo(numero) {
  const f = contratosLenovoFilas.find((c) => c.numero === numero);
  const tbody = $("tableroContratosLenovo");
  if (!f) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No se encontró información de este contrato.</td></tr>`;
  } else {
    tbody.innerHTML = `
      <tr class="clickable" data-ir-contrato="${esc(numero)}">
        <td>${esc(f.numero)}</td>
        <td>${esc(f.fecha) || "N/A"}</td>
        <td>${f.desktop}</td>
        <td>${f.laptop}</td>
        <td><strong>${f.total}</strong></td>
      </tr>
    `;
    tbody.querySelector("tr[data-ir-contrato]").addEventListener("click", () => irAContratosPorNumero(numero));
  }
  $("contratoLenovoDetalleTitulo").textContent = `Detalle del contrato ${numero}`;
  $("contratoLenovoDetalleWrap").style.display = "";
}

function irAContratosPorNumero(numero) {
  cambiarVista("contratos");
  $("buscador_contratos").value = numero;
  vistaContratos.render();
}

document.addEventListener("click", (ev) => {
  const fila = ev.target.closest(".tablero-fila[data-campo-contrato-lenovo]");
  if (fila) mostrarDetalleContratoLenovo(fila.dataset.valor);
});

function irAListaEquiposFiltrada(campo, valor) {
  $("buscador").value = "";
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroTipo").value = "";
  filtroCampoVacio = null;
  filtroEnRevision = false;
  filtroPropios = false;
  filtroLenovo = false;
  filtroRiolsaTodos = false;
  if (valor === "Sin dato") {
    filtroCampoVacio = campo;
  } else if (campo === "empresa") $("filtroEmpresa").value = valor;
  else if (campo === "status") $("filtroStatus").value = valor;
  else if (campo === "tipoEquipo") $("filtroTipo").value = valor;
  else $("buscador").value = valor;
  paginaActual = 1;
  cambiarVista("computadoras");
  render();
}

function irAEquiposPropios() {
  $("buscador").value = "";
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroTipo").value = "";
  filtroCampoVacio = null;
  filtroEnRevision = false;
  filtroPropios = true;
  filtroLenovo = false;
  filtroRiolsaTodos = false;
  paginaActual = 1;
  cambiarVista("computadoras");
  render();
}

function irAEquiposLenovo() {
  $("buscador").value = "";
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroTipo").value = "";
  filtroCampoVacio = null;
  filtroEnRevision = false;
  filtroPropios = false;
  filtroLenovo = true;
  filtroRiolsaTodos = false;
  paginaActual = 1;
  cambiarVista("computadoras");
  render();
}

function irAEquiposRiolsaTodos() {
  $("buscador").value = "";
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroTipo").value = "";
  filtroCampoVacio = null;
  filtroEnRevision = false;
  filtroPropios = false;
  filtroLenovo = false;
  filtroRiolsaTodos = true;
  paginaActual = 1;
  cambiarVista("computadoras");
  render();
}

document.addEventListener("click", (ev) => {
  const fila = ev.target.closest(".tablero-fila[data-campo]");
  if (fila) irAListaEquiposFiltrada(fila.dataset.campo, fila.dataset.valor);
  if (ev.target.closest("#tarjetaPropios")) irAEquiposPropios();
  if (ev.target.closest("#tarjetaTotales")) irATodosLosEquipos();
  if (ev.target.closest("#tarjetaLenovo")) irAEquiposLenovo();
  if (ev.target.closest("#tarjetaEmpresas")) irAEmpresasPanel();
  if (ev.target.closest("#tarjetaImpresoras")) irAImpresorasVista();
});

let statCardsAnimadas = false;

function animarNumeroStatCard(el) {
  const valorFinal = Number(el.dataset.valorFinal || 0);
  const duracion = 700;
  const t0 = performance.now();
  function paso(ahora) {
    const p = Math.min(1, (ahora - t0) / duracion);
    const suavizado = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(valorFinal * suavizado);
    if (p < 1) requestAnimationFrame(paso);
    else el.textContent = valorFinal;
  }
  requestAnimationFrame(paso);
}

const ICONOS_STAT_CARD = {
  pc: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1"></rect><line x1="8" y1="20" x2="16" y2="20"></line><line x1="12" y1="16" x2="12" y2="20"></line></svg>`,
  laptop: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="10" rx="1"></rect><line x1="2" y1="19" x2="22" y2="19"></line></svg>`,
  impresora: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7,8 7,3 17,3 17,8"></polyline><rect x="5" y="8" width="14" height="7" rx="1"></rect><rect x="8" y="15" width="8" height="5"></rect></svg>`,
  edificio: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18"></rect><rect x="8" y="6" width="3" height="3"></rect><rect x="13" y="6" width="3" height="3"></rect><rect x="8" y="11" width="3" height="3"></rect><rect x="13" y="11" width="3" height="3"></rect></svg>`,
  servidor: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="6" rx="1"></rect><rect x="4" y="10" width="16" height="6" rx="1"></rect><rect x="4" y="17" width="16" height="4" rx="1"></rect></svg>`,
  alerta: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6"></circle><line x1="21" y1="21" x2="15" y2="15"></line></svg>`,
};

function construirStatCard(valor, etiqueta, opts = {}) {
  const { id = "", claseColor = "", clickable = false, secundaria = false, icono = "", titulo = "" } = opts;
  const clases = ["stat-card", claseColor, clickable ? "clickable" : "", secundaria ? "stat-card-secundaria" : ""]
    .filter(Boolean)
    .join(" ");
  const idAttr = id ? ` id="${id}"` : "";
  const tituloAttr = titulo ? ` title="${titulo}"` : "";
  const valorMostrado = statCardsAnimadas ? valor : 0;
  const iconoHtml = icono ? `<div class="icono">${ICONOS_STAT_CARD[icono] || ""}</div>` : "";
  return `<div${idAttr} class="${clases}"${tituloAttr}>${iconoHtml}<div class="numero" data-valor-final="${valor}">${valorMostrado}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

function irATodosLosEquipos() {
  $("buscador").value = "";
  $("filtroEmpresa").value = "";
  $("filtroStatus").value = "";
  $("filtroTipo").value = "";
  filtroCampoVacio = null;
  filtroEnRevision = false;
  filtroPropios = false;
  filtroLenovo = false;
  filtroRiolsaTodos = false;
  paginaActual = 1;
  cambiarVista("computadoras");
  render();
}

function irAEmpresasPanel() {
  cambiarVista("tablero");
  requestAnimationFrame(() => {
    $("tableroEmpresa")?.closest(".tablero-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function irAImpresorasVista() {
  cambiarVista("impresoras");
}

/* ---------- Donas de los paneles del tablero (Status/Empresa/Tipo/Fabricante) ---------- */

function hexARgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbAHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslAHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Paleta contrastada: paso fijo por indice (no dividido entre el total de
// categorias), asi la 2da y 3ra categoria ya se distinguen de la primera
// aunque haya muchas categorias chiquitas despues.
function generarPaletaDona(hex, n) {
  const { h, s, l } = rgbAHsl(hexARgb(hex).r, hexARgb(hex).g, hexARgb(hex).b);
  const colores = [];
  for (let i = 0; i < n; i++) {
    colores.push(hslAHex(h + i * 18, Math.max(42, s - i * 5), Math.min(80, l + i * 11)));
  }
  return colores;
}

function porcentajesRealesDona(valores, total) {
  return valores.map((v) => (v / total) * 100);
}

// Ancho minimo por categoria (Opcion B): las categorias muy chicas reciben
// un porcentaje minimo visible, y las grandes ceden ese espacio entre ellas.
function porcentajesConMinimoDona(valores, total, minPct = 6) {
  let pcts = porcentajesRealesDona(valores, total);
  const chicas = pcts.filter((p) => p < minPct);
  if (!chicas.length) return pcts;
  const sumaChicasObjetivo = chicas.length * minPct;
  const sumaGrandesOriginal = pcts.filter((p) => p >= minPct).reduce((s, p) => s + p, 0);
  const sumaGrandesObjetivo = 100 - sumaChicasObjetivo;
  const factor = sumaGrandesOriginal > 0 ? sumaGrandesObjetivo / sumaGrandesOriginal : 0;
  return pcts.map((p) => (p < minPct ? minPct : p * factor));
}

function pintarPanelConDona({ idDona, idLista, datosTop, total, hex, modo, campo, atributoCampo = "data-campo" }) {
  if (!datosTop.length) {
    $(idDona).innerHTML = "";
    $(idLista).innerHTML = "<p>Sin datos.</p>";
    return;
  }
  const sumaVisible = datosTop.reduce((s, [, v]) => s + v, 0);
  const otros = Math.max(0, total - sumaVisible);
  const segmentos = otros > 0 ? [...datosTop, ["Otros", otros]] : datosTop;
  const valores = segmentos.map(([, v]) => v);
  const pcts = modo === "B" ? porcentajesConMinimoDona(valores, total) : porcentajesRealesDona(valores, total);
  const paleta = generarPaletaDona(hex, segmentos.length);

  let acc = 0;
  const paradas = pcts.map((p, i) => {
    const desde = acc;
    acc += p;
    return `${paleta[i]} ${desde}% ${acc}%`;
  });

  $(idDona).innerHTML = `
    <div class="dona-wrap">
      <div class="dona" style="--dona-gradient: ${paradas.join(", ")}"></div>
      <div class="dona-total"><span class="num">${total}</span></div>
    </div>
  `;

  $(idLista).innerHTML = datosTop
    .map(([nombre, cantidad], i) => {
      const atributos = campo ? ` ${atributoCampo}="${campo}" data-valor="${String(nombre).replace(/"/g, "&quot;")}"` : "";
      return `<div class="tablero-fila fila-dona clickable" data-idx="${i}"${atributos}>
        <span class="punto-dona" style="background:${paleta[i]}"></span>
        <span class="nombre-dona">${esc(nombre)}</span>
        <span class="valor">${cantidad}</span>
      </div>`;
    })
    .join("");
}

document.addEventListener("mouseover", (ev) => {
  const fila = ev.target.closest(".fila-dona");
  if (!fila) return;
  const contenedor = fila.closest(".panel-cuerpo");
  if (!contenedor) return;
  contenedor.querySelectorAll(".fila-dona").forEach((f) => f.classList.toggle("atenuada", f !== fila));
});
document.addEventListener("mouseout", (ev) => {
  const fila = ev.target.closest(".fila-dona");
  if (!fila) return;
  const contenedor = fila.closest(".panel-cuerpo");
  if (!contenedor) return;
  contenedor.querySelectorAll(".fila-dona").forEach((f) => f.classList.remove("atenuada"));
});

function renderTablero() {
  let cambioPurga = false;
  if (eliminarDuplicadoP025194()) cambioPurga = true;
  if (eliminarChatarraConfirmada()) cambioPurga = true;
  if (quitarMarcaRevisionConfirmados()) cambioPurga = true;
  if (corregirEmpresasMalCapturadas()) cambioPurga = true;
  if (corregirTipoEquipoMalClasificado()) cambioPurga = true;
  if (corregirComentariosUsoRiolsa()) cambioPurga = true;
  if (cambioPurga) guardarDatos();

  const equiposUsuario = equipos.filter((e) => !esServidor(e));
  const equiposUsuarioValidados = equiposUsuario.filter((e) => !esEnRevisionCronograma(e));

  const totalEmpresas = new Set(equiposUsuarioValidados.map((e) => (e.empresa || "").trim()).filter(Boolean)).size;
  const equiposLenovo = equiposUsuarioValidados.filter((e) => (e.fabricante || "").trim().toUpperCase() === "LENOVO").length;

  const propios = equiposUsuario.filter((e) => !nonEmpty(e.contratos));
  const propiosEnRevision = propios.filter(esEnRevisionCronograma).length;
  const equiposPropios = propios.length - propiosEnRevision;

  if ($("vista-tablero").classList.contains("vista-active")) {
    $("contadorTotal").textContent = `${equipos.length} equipo(s)`;
  }

  const impresoras = impresorasData;

  $("statCards").innerHTML =
    construirStatCard(equiposUsuarioValidados.length, "Equipos totales", { id: "tarjetaTotales", claseColor: "color-azul", clickable: true, icono: "pc", titulo: "Ver el listado completo" }) +
    construirStatCard(equiposLenovo, "Equipos Lenovo", { id: "tarjetaLenovo", claseColor: "color-indigo", clickable: true, icono: "laptop", titulo: "Ver equipos Lenovo" }) +
    construirStatCard(equiposPropios, "Equipos propios", { id: "tarjetaPropios", claseColor: "color-verde", clickable: true, icono: "pc", titulo: "Ver equipos propios" }) +
    construirStatCard(totalEmpresas, "Empresas", { id: "tarjetaEmpresas", claseColor: "color-fucsia", clickable: true, icono: "edificio", titulo: "Ver desglose por empresa" }) +
    construirStatCard(impresoras.length, "Impresoras Canon", { id: "tarjetaImpresoras", claseColor: "color-teal", clickable: true, icono: "impresora", titulo: "Ver catálogo de impresoras" });

  if (!statCardsAnimadas) {
    statCardsAnimadas = true;
    $("statCards").classList.add("animar");
    document.querySelectorAll("#statCards .numero").forEach(animarNumeroStatCard);
  }

  const filaHtml = (nombre, cantidad, campo) => {
    const clickable = !!campo;
    const atributos = clickable ? ` data-campo="${campo}" data-valor="${String(nombre).replace(/"/g, "&quot;")}"` : "";
    return `<div class="tablero-fila${clickable ? " clickable" : ""}"${atributos}><span>${esc(nombre)}</span><span class="valor">${cantidad}</span></div>`;
  };

  const totalHtml = (total) => `<div class="tablero-total"><span>Total</span><span class="valor">${total}</span></div>`;

  const statusSinServidores = contarPor("status", { excluirServidores: true, excluirEnRevision: true });
  const totalStatusSinServidores = statusSinServidores.reduce((s, [, c]) => s + c, 0);
  pintarPanelConDona({
    idDona: "tableroStatusDona", idLista: "tableroStatus", campo: "status",
    datosTop: statusSinServidores.slice(0, 8), total: totalStatusSinServidores, hex: "#1c3d6e", modo: "A",
  });
  $("tableroStatus").innerHTML += totalHtml(totalStatusSinServidores);

  const empresaSinServidores = contarPor("empresa", { excluirServidores: true, excluirEnRevision: true });
  const totalSinServidores = empresaSinServidores.reduce((s, [, c]) => s + c, 0);
  pintarPanelConDona({
    idDona: "tableroEmpresaDona", idLista: "tableroEmpresa", campo: "empresa",
    datosTop: empresaSinServidores.slice(0, 8), total: totalSinServidores, hex: "#a3336f", modo: "A",
  });
  $("tableroEmpresa").innerHTML += totalHtml(totalSinServidores);

  const tipoSinServidores = contarPor("tipoEquipo", { excluirServidores: true, excluirEnRevision: true, agruparTipoEquipo: true });
  pintarPanelConDona({
    idDona: "tableroTipoDona", idLista: "tableroTipo", campo: "tipoEquipo",
    datosTop: tipoSinServidores.slice(0, 8), total: totalSinServidores, hex: "#15803d", modo: "B",
  });
  $("tableroTipo").innerHTML += totalHtml(totalSinServidores);

  const fabricanteSinServidores = contarPor("fabricante", { excluirServidores: true, excluirEnRevision: true });
  pintarPanelConDona({
    idDona: "tableroFabricanteDona", idLista: "tableroFabricante", campo: "fabricante",
    datosTop: fabricanteSinServidores.slice(0, 8), total: totalSinServidores, hex: "#4338ca", modo: "B",
  });
  $("tableroFabricante").innerHTML += totalHtml(totalSinServidores);

  renderContratosLenovo(equiposUsuarioValidados);

  const contarImpresorasPor = (campo) => {
    const conteo = {};
    impresoras.forEach((p) => {
      const v = String(p[campo] || "").trim() || "Sin dato";
      conteo[v] = (conteo[v] || 0) + 1;
    });
    return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  };

  pintarPanelConDona({
    idDona: "tableroImpresorasTipoDona", idLista: "tableroImpresorasTipo", campo: "tipo", atributoCampo: "data-campo-imp",
    datosTop: contarImpresorasPor("tipo"), total: impresoras.length, hex: "#0f766e", modo: "A",
  });
  pintarPanelConDona({
    idDona: "tableroImpresorasEmpresaDona", idLista: "tableroImpresorasEmpresa", campo: "empresa", atributoCampo: "data-campo-imp",
    datosTop: contarImpresorasPor("empresa"), total: impresoras.length, hex: "#b45309", modo: "A",
  });
  const departamentosImpresoras = contarImpresorasPor("departamento");
  pintarPanelConDona({
    idDona: "tableroImpresorasDepartamentoDona", idLista: "tableroImpresorasDepartamento", campo: "departamento", atributoCampo: "data-campo-imp",
    datosTop: departamentosImpresoras.slice(0, 8), total: impresoras.length, hex: "#334155", modo: "B",
  });
  $("btnVerTodosDepartamentos").textContent = `Ver los ${departamentosImpresoras.length} departamentos →`;
}

function irACatalogoImpresorasFiltrado(campo, valor) {
  $("buscador_catalogoImpresoras").value = valor === "Sin dato" ? "" : valor;
  cambiarVista("impresoras");
  vistaCatalogoImpresoras.render();
}

document.addEventListener("click", (ev) => {
  const filaImp = ev.target.closest(".tablero-fila[data-campo-imp]");
  if (filaImp) irACatalogoImpresorasFiltrado(filaImp.dataset.campoImp, filaImp.dataset.valor);
});

function actualizarConteoRapido() {
  const original = $("conteoRapidoInput").value.trim();
  const texto = original.toLowerCase();
  const resultado = $("conteoRapidoResultado");
  if (!texto) {
    resultado.textContent = "";
    resultado.style.display = "none";
    return;
  }
  const coincidencias = equipos.filter((e) => (e.fabricante || "").toLowerCase().includes(texto));
  resultado.textContent = `${coincidencias.length} equipo(s) coinciden con "${original}" en Fabricante`;
  resultado.className = "acta-estado";
  resultado.style.display = "";
}

/* ---------- Vistas de listas derivadas (Usuarios / Monitores / Impresoras / Dispositivos) ---------- */

function crearVistaLista({ prefix, columnas, obtenerFilas, filtrar, alClicFila }) {
  let pagina = 1;
  function render() {
    const texto = $(`buscador_${prefix}`).value.trim().toLowerCase();
    const todas = obtenerFilas();
    const filtradas = texto ? todas.filter((f) => filtrar(f, texto)) : todas;
    const totalPag = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
    if (pagina > totalPag) pagina = totalPag;
    if (pagina < 1) pagina = 1;
    const inicio = (pagina - 1) * PAGE_SIZE;
    const pageItems = filtradas.slice(inicio, inicio + PAGE_SIZE);

    const tbody = $(`tbody_${prefix}`);
    tbody.innerHTML = "";
    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${columnas}" class="empty-state">Sin resultados. Estos datos se completan al capturarlos en cada equipo.</td></tr>`;
    } else {
      pageItems.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = item.celdas;
        if (alClicFila) tr.addEventListener("click", () => alClicFila(item));
        tbody.appendChild(tr);
      });
    }

    $(`infoPagina_${prefix}`).textContent = `Página ${pagina} de ${totalPag} — ${filtradas.length} registro(s)`;
    const vistaAsociada = $(`vista-${prefix}`);
    if (vistaAsociada && vistaAsociada.classList.contains("vista-active")) {
      $("contadorTotal").textContent = `${filtradas.length} registro(s)`;
    }
    $(`btnPrimero_${prefix}`).disabled = pagina === 1;
    $(`btnAnterior_${prefix}`).disabled = pagina === 1;
    $(`btnSiguiente_${prefix}`).disabled = pagina === totalPag;
    $(`btnUltimo_${prefix}`).disabled = pagina === totalPag;
  }

  $(`buscador_${prefix}`).addEventListener("input", () => {
    pagina = 1;
    render();
  });
  $(`btnPrimero_${prefix}`).addEventListener("click", () => {
    pagina = 1;
    render();
  });
  $(`btnAnterior_${prefix}`).addEventListener("click", () => {
    pagina--;
    render();
  });
  $(`btnSiguiente_${prefix}`).addEventListener("click", () => {
    pagina++;
    render();
  });
  $(`btnUltimo_${prefix}`).addEventListener("click", () => {
    pagina = Math.max(1, Math.ceil(obtenerFilas().length / PAGE_SIZE));
    render();
  });

  return { render };
}

function obtenerUsuarios() {
  const mapa = new Map();
  equipos.forEach((e) => {
    if (esServidor(e)) return;
    if (!nonEmpty(e.nombreEmpleado) && !nonEmpty(e.usuarioDominio)) return;
    const clave = `${(e.nombreEmpleado || "").trim().toLowerCase()}|${(e.usuarioDominio || "").trim().toLowerCase()}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nombreEmpleado: e.nombreEmpleado,
        usuarioDominio: e.usuarioDominio,
        correo: e.correo,
        empresa: e.empresa,
        departamento: e.departamento,
        equipos: [],
      });
    }
    mapa.get(clave).equipos.push(e.nombreRed);
  });
  return [...mapa.values()]
    .map((u) => ({
      ...u,
      celdas: `
        <td>${esc(u.nombreEmpleado)}</td>
        <td>${esc(u.usuarioDominio)}</td>
        <td>${esc(u.correo)}</td>
        <td>${esc(u.empresa)}</td>
        <td>${esc(u.departamento)}</td>
        <td>${u.equipos.filter(Boolean).join(", ") || "N/A"}</td>
      `,
    }))
    .sort((a, b) =>
      (a.nombreEmpleado || a.usuarioDominio || "").localeCompare(b.nombreEmpleado || b.usuarioDominio || "", "es")
    );
}

const vistaUsuarios = crearVistaLista({
  prefix: "usuarios",
  columnas: 6,
  obtenerFilas: obtenerUsuarios,
  filtrar: (u, t) =>
    [u.nombreEmpleado, u.usuarioDominio, u.correo, u.departamento, u.empresa].join(" ").toLowerCase().includes(t),
  alClicFila: (u) => {
    cambiarVista("computadoras");
    $("buscador").value = u.nombreEmpleado || u.usuarioDominio || "";
    paginaActual = 1;
    render();
  },
});

function obtenerMonitores() {
  return equipos
    .filter((e) => nonEmpty(e.monitor))
    .map((e) => ({
      equipo: e,
      celdas: `
        <td>${esc(descripcionMonitorEquipo(e))}</td>
        <td>${esc(e.nombreRed)}</td>
        <td>${esc(e.nombreEmpleado)}</td>
        <td>${esc(e.empresa)}</td>
        <td>${esc(e.ubicaciones)}</td>
      `,
    }));
}

const vistaMonitores = crearVistaLista({
  prefix: "monitores",
  columnas: 5,
  obtenerFilas: obtenerMonitores,
  filtrar: (r, t) =>
    [descripcionMonitorEquipo(r.equipo), r.equipo.nombreRed, r.equipo.nombreEmpleado, r.equipo.empresa].join(" ").toLowerCase().includes(t),
  alClicFila: (r) => abrirModal(r.equipo),
});

function obtenerCatalogoMonitores() {
  const lista = typeof CATALOGO_MONITORES !== "undefined" && Array.isArray(CATALOGO_MONITORES) ? CATALOGO_MONITORES : [];
  return lista.map((m) => ({
    monitor: m,
    celdas: `
      <td>${esc(m.serial)}</td>
      <td>${esc(m.modelo)}</td>
      <td>${esc(m.descripcion)}</td>
      <td>${esc(m.contrato)}</td>
      <td>${esc(m.fechaFin)}</td>
    `,
  }));
}

function equipoAsignadoAMonitor(serial) {
  const s = (serial || "").trim();
  if (!s) return null;
  return equipos.find((e) => (e.monitor || "").trim() === s) || null;
}

const vistaCatalogoMonitores = crearVistaLista({
  prefix: "catalogoMonitores",
  columnas: 5,
  obtenerFilas: obtenerCatalogoMonitores,
  filtrar: (r, t) => [r.monitor.serial, r.monitor.modelo, r.monitor.descripcion, r.monitor.contrato].join(" ").toLowerCase().includes(t),
  alClicFila: (r) => {
    const equipo = equipoAsignadoAMonitor(r.monitor.serial);
    if (equipo) {
      abrirModal(equipo);
    } else {
      alert(`El monitor ${r.monitor.serial} (${r.monitor.descripcion || r.monitor.modelo}) aún no está asignado a ningún equipo.\n\nPara asignarlo, edita el equipo correspondiente y selecciónalo en el campo "Monitor".`);
    }
  },
});

function obtenerCatalogoImpresoras() {
  const ordenada = [...impresorasData].sort((a, b) => (a.departamento || "").localeCompare(b.departamento || ""));
  return ordenada.map((p) => ({
    impresora: p,
    celdas: `
      <td>${esc(p.tipoEquipoImp)}</td>
      <td>${enlaceIp(p.ip)}</td>
      <td>${esc(p.gpr)}</td>
      <td>${esc(p.serial)}</td>
      <td>${esc(p.modelo)}</td>
      <td>${esc(p.tipo)}</td>
      <td>${esc(p.codigoPrinter)}</td>
      <td>${esc(p.departamento)}</td>
      <td>${esc(p.ubicacion)}</td>
      <td>${esc(p.empresa)}</td>
      <td>${esc(p.activoFijo)}</td>
    `,
  }));
}

const vistaCatalogoImpresoras = crearVistaLista({
  prefix: "catalogoImpresoras",
  columnas: 11,
  obtenerFilas: obtenerCatalogoImpresoras,
  filtrar: (r, t) =>
    [r.impresora.ip, r.impresora.serial, r.impresora.modelo, r.impresora.departamento, r.impresora.ubicacion, r.impresora.empresa, r.impresora.tipo]
      .join(" ")
      .toLowerCase()
      .includes(t),
  alClicFila: (r) => abrirModalImpresora(r.impresora),
});

function obtenerCodigos() {
  return codigosData.map((c) => ({
    codigo: c,
    celdas: `
      <td>${esc(c.idUsuario)}</td>
      <td>${esc(c.nombre)}</td>
      <td>${esc(c.clave)}</td>
      <td>${esc(c.observacion)}</td>
      <td>${esc(c.origen)}</td>
      <td>${esc(c.agregadoPor)}</td>
    `,
  }));
}

const vistaCodigos = crearVistaLista({
  prefix: "codigos",
  columnas: 6,
  obtenerFilas: obtenerCodigos,
  // Busqueda amigable: cada palabra escrita (nombre, apellido, ID o clave, en
  // cualquier orden) tiene que aparecer en algun lado del registro, no
  // necesariamente en ese orden ni todo junto.
  filtrar: (r, t) => {
    const texto = [r.codigo.idUsuario, r.codigo.nombre, r.codigo.clave, r.codigo.observacion, r.codigo.origen, r.codigo.agregadoPor]
      .join(" ")
      .toLowerCase();
    return t.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
  },
  alClicFila: (r) => abrirModalCodigo(r.codigo),
});

function formatearFechaHora(valor) {
  if (!valor) return "";
  return String(valor);
}

function formatearMonitorTIv2(hw) {
  const monitores = Array.isArray(hw.monitores) ? hw.monitores.filter((m) => m && m.activo !== false) : [];
  if (!monitores.length) return "";
  return monitores.map((m) => [m.fabricante, m.modelo].filter((v) => v && v !== "N/A").join(" ")).join(", ");
}

function obtenerEquiposTIv2() {
  return equiposTIv2Data.map((e) => {
    const hw = e.hardware || {};
    const cpu = hw.procesador || {};
    const so = hw.sistemaOperativo || {};
    return {
      dato: e,
      // Mismo orden de columnas que la vista "Computadoras" de GLPI (Nombre, Estado,
      // Fabricante, Número de Serial, Tipo, Modelo, Sistema Operativo, Ubicación,
      // Última Modificación, Procesador). Estado y Ubicación quedan vacíos: el agente
      // no los recolecta (son campos de gestión manual, no datos técnicos del equipo).
      celdas: `
        <td>${esc(e.computadora || e.equipoId)}</td>
        <td></td>
        <td>${esc(hw.fabricante)}</td>
        <td>${esc(hw.serialNumber)}</td>
        <td>${esc(hw.tipoEquipo)}</td>
        <td>${esc(hw.modelo)}</td>
        <td>${esc(so.nombre)}</td>
        <td></td>
        <td>${esc(formatearFechaHora(e.timestamp))}</td>
        <td>${esc(cpu.nombre)}</td>
      `,
    };
  });
}

const vistaEquiposTIv2 = crearVistaLista({
  prefix: "equiposTIv2",
  columnas: 10,
  obtenerFilas: obtenerEquiposTIv2,
  filtrar: (r, t) => {
    const hw = r.dato.hardware || {};
    const so = hw.sistemaOperativo || {};
    const texto = [r.dato.computadora, r.dato.equipoId, hw.fabricante, hw.serialNumber, hw.tipoEquipo, hw.modelo, so.nombre]
      .join(" ")
      .toLowerCase();
    return t.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
  },
  alClicFila: abrirDetalleEquipoTIv2,
});

function filaDetalleTIv2(etiqueta, valor) {
  return `<div class="glpi-row"><label>${etiqueta}</label><div>${esc(valor)}</div></div>`;
}

function tablaDetalleTIv2(columnas, filas) {
  if (!filas.length) return `<p class="subseccion-nota">Sin datos.</p>`;
  const encabezado = columnas.map((c) => `<th>${c}</th>`).join("");
  const cuerpo = filas.map((f) => `<tr>${f.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
  return `<section class="tabla-wrap"><table class="tabla"><thead><tr>${encabezado}</tr></thead><tbody>${cuerpo}</tbody></table></section>`;
}

function abrirDetalleEquipoTIv2(item) {
  const e = item.dato;
  const hw = e.hardware || {};
  const sw = e.software || {};
  const cpu = hw.procesador || {};
  const ram = hw.memoria || {};
  const so = hw.sistemaOperativo || {};

  $("modalDetalleEquipoTIv2Titulo").textContent = `Detalle — ${e.computadora || e.equipoId || "N/A"}`;

  const softwareLista = sw.softwareInstalado || [];

  // Cada pestaña replica una categoría del sidebar de GLPI (Computadora > pestañas con
  // contador), en vez del scroll único anterior.
  const tabs = [
    {
      id: "general",
      label: "General",
      html: `
        <div class="glpi-grid">
          <div class="glpi-col">
            ${filaDetalleTIv2("Equipo", e.computadora || e.equipoId)}
            ${filaDetalleTIv2("Usuario", e.usuario)}
            ${filaDetalleTIv2("Dominio", e.dominio)}
          </div>
          <div class="glpi-col">
            ${filaDetalleTIv2("IP Principal", hw.ipPrincipal)}
            ${filaDetalleTIv2("MAC Principal", hw.macPrincipal)}
            ${filaDetalleTIv2("Última Actualización", formatearFechaHora(e.timestamp))}
          </div>
        </div>
      `,
    },
    {
      id: "hardware",
      label: "Hardware",
      html: `
        <div class="glpi-grid">
          <div class="glpi-col">
            ${filaDetalleTIv2("Fabricante", hw.fabricante)}
            ${filaDetalleTIv2("Modelo", hw.modelo)}
            ${filaDetalleTIv2("Tipo", hw.tipoEquipo)}
            ${filaDetalleTIv2("Serial", hw.serialNumber)}
          </div>
          <div class="glpi-col">
            ${filaDetalleTIv2("Versión BIOS", hw.biosVersion)}
            ${filaDetalleTIv2("Fecha BIOS", hw.biosFecha)}
            ${filaDetalleTIv2("Procesador", cpu.nombre)}
            ${filaDetalleTIv2("Núcleos / Hilos", cpu.nucleos != null ? `${cpu.nucleos} / ${cpu.hilos}` : "")}
          </div>
        </div>
      `,
    },
    {
      id: "so",
      label: "Sistema Operativo",
      count: 1,
      html: `
        <div class="glpi-grid">
          <div class="glpi-col">
            ${filaDetalleTIv2("Nombre", so.nombre)}
            ${filaDetalleTIv2("Versión", so.version)}
          </div>
          <div class="glpi-col">
            ${filaDetalleTIv2("Build", so.build)}
            ${filaDetalleTIv2("Arquitectura", so.arquitectura)}
            ${filaDetalleTIv2("Encendido (horas)", so.tiempoEncendido)}
            ${filaDetalleTIv2("Fecha de Arranque", so.fechaArranque)}
          </div>
        </div>
      `,
    },
    {
      id: "ram",
      label: "Memoria RAM",
      count: (ram.modulos || []).length,
      html: `
        <p class="subseccion-nota">Total: ${esc(ram.total)}</p>
        ${tablaDetalleTIv2(
          ["Ranura", "Capacidad", "Fabricante", "Velocidad", "N° Parte"],
          (ram.modulos || []).map((m) => [m.ranura, m.capacidad, m.fabricante, m.velocidad, m.numeroParte])
        )}
      `,
    },
    {
      id: "discos",
      label: "Discos",
      count: (hw.discos || []).length,
      html: tablaDetalleTIv2(
        ["Unidad", "Tamaño", "Espacio Libre", "% Uso"],
        (hw.discos || []).map((d) => [d.unidad, d.tamanio, d.espacioLibre, d.porcentajeUso != null ? `${d.porcentajeUso}%` : ""])
      ),
    },
    {
      id: "red",
      label: "Red",
      count: (hw.redAdaptadores || []).length,
      html: tablaDetalleTIv2(
        ["Adaptador", "Descripción", "MAC", "IP", "Estado", "Velocidad"],
        (hw.redAdaptadores || []).map((n) => [n.nombre, n.descripcion, n.mac, n.ip, n.estado, n.velocidad])
      ),
    },
    {
      id: "monitores",
      label: "Monitores",
      count: (hw.monitores || []).length,
      html: tablaDetalleTIv2(
        ["Fabricante", "Modelo", "Serial", "Activo"],
        (hw.monitores || []).map((m) => [m.fabricante, m.modelo, m.serial, m.activo ? "Sí" : "No"])
      ),
    },
    {
      id: "antivirus",
      label: "Antivirus",
      count: (hw.antivirus || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Habilitado", "Actualizado"],
        (hw.antivirus || []).map((a) => [a.nombre, a.habilitado ? "Sí" : "No", a.actualizado ? "Sí" : "No"])
      ),
    },
    {
      id: "firewall",
      label: "Firewall",
      count: (hw.firewall || []).length,
      html: tablaDetalleTIv2(
        ["Perfil", "Activo"],
        (hw.firewall || []).map((f) => [f.perfil, f.activo ? "Sí" : "No"])
      ),
    },
    {
      id: "pci",
      label: "Controladores PCI",
      count: (hw.controladores || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Fabricante", "Device ID"],
        (hw.controladores || []).map((c) => [c.nombre, c.fabricante, c.deviceId])
      ),
    },
    {
      id: "usb",
      label: "Dispositivos USB",
      count: (hw.usbDispositivos || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Fabricante", "Device ID"],
        (hw.usbDispositivos || []).map((u) => [u.nombre, u.fabricante, u.deviceId])
      ),
    },
    {
      id: "sonido",
      label: "Tarjetas de Sonido",
      count: (hw.tarjetasSonido || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Fabricante"],
        (hw.tarjetasSonido || []).map((t) => [t.nombre, t.fabricante])
      ),
    },
    {
      id: "puertos",
      label: "Puertos Físicos",
      count: (hw.puertos || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Tipo", "Descripción"],
        (hw.puertos || []).map((p) => [p.nombre, p.tipo, p.descripcion])
      ),
    },
    {
      id: "slots",
      label: "Ranuras de Expansión",
      count: (hw.slots || []).length,
      html: tablaDetalleTIv2(
        ["Nombre", "Estado", "Tipo"],
        (hw.slots || []).map((s) => [s.nombre, s.estado, s.tipo])
      ),
    },
    {
      id: "software",
      label: "Programas",
      count: sw.cantidadSoftware || softwareLista.length || 0,
      html: `
        ${tablaDetalleTIv2(
          ["Nombre", "Versión", "Fabricante"],
          softwareLista.slice(0, 100).map((s) => [s.nombre, s.version, s.fabricante])
        )}
        ${softwareLista.length > 100 ? `<p class="subseccion-nota">Mostrando los primeros 100 de ${softwareLista.length} programas.</p>` : ""}
      `,
    },
  ];

  $("tabsDetalleTIv2").innerHTML = tabs
    .map(
      (t, i) => `
        <button type="button" class="detalle-tiv2-tab${i === 0 ? " active" : ""}" data-tiv2-tab="${t.id}">
          <span>${t.label}</span>
          ${t.count != null ? `<span class="tiv2-tab-contador">${t.count}</span>` : ""}
        </button>
      `
    )
    .join("");

  $("cuerpoDetalleEquipoTIv2").innerHTML = tabs
    .map(
      (t, i) => `
        <section class="detalle-tiv2-panel${i === 0 ? " active" : ""}" data-tiv2-panel="${t.id}">
          <h3 class="ingreso-subtitulo">${t.label}</h3>
          ${t.html}
        </section>
      `
    )
    .join("");

  $("tabsDetalleTIv2").querySelectorAll("[data-tiv2-tab]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const idPestania = boton.dataset.tiv2Tab;
      $("tabsDetalleTIv2").querySelectorAll("[data-tiv2-tab]").forEach((b) => b.classList.toggle("active", b === boton));
      $("cuerpoDetalleEquipoTIv2").querySelectorAll("[data-tiv2-panel]").forEach((p) => {
        p.classList.toggle("active", p.dataset.tiv2Panel === idPestania);
      });
    });
  });

  $("modalDetalleEquipoTIv2Overlay").style.display = "flex";
}

function cerrarDetalleEquipoTIv2() {
  $("modalDetalleEquipoTIv2Overlay").style.display = "none";
}

function obtenerTicketsGarantia() {
  return ticketsGarantiaData.map((t) => ({
    ticket: t,
    celdas: `
      <td>${esc(t.proveedor)}</td>
      <td>${esc(t.equipoRef)}</td>
      <td>${esc(t.numeroTicket)}</td>
      <td>${esc(formatearFechaSimple(t.fechaReporte))}</td>
      <td>${esc(formatearFechaSimple(t.fechaResolucion))}</td>
      <td>${esc(diasRespuestaGarantia(t))}</td>
      <td><span class="badge">${esc(t.estado)}</span></td>
      <td>${esc(t.descripcionFalla)}</td>
    `,
  }));
}

const vistaTicketsGarantia = crearVistaLista({
  prefix: "ticketsGarantia",
  columnas: 8,
  obtenerFilas: obtenerTicketsGarantia,
  filtrar: (r, t) => {
    const texto = [r.ticket.proveedor, r.ticket.equipoRef, r.ticket.numeroTicket, r.ticket.estado, r.ticket.descripcionFalla]
      .join(" ")
      .toLowerCase();
    return t.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
  },
  alClicFila: (r) => abrirModalTicketGarantia(r.ticket),
});

function registrosMantenimientoDeEquipo(nombreRed) {
  const n = (nombreRed || "").trim();
  if (!n) return [];
  return mantenimientoEquiposData
    .filter((m) => (m.equipoRef || "").trim() === n)
    .sort((a, b) => (b.fechaIngreso || "").localeCompare(a.fechaIngreso || ""));
}

function actualizarContadorMantenimientoEquipo() {
  $("contadorMantenimientoEquipo").textContent = registrosMantenimientoDeEquipo($("nombreRed").value).length;
}

function abrirHistorialMantenimientoEquipo() {
  const nombreRed = $("nombreRed").value.trim();
  const registros = registrosMantenimientoDeEquipo(nombreRed);
  $("modalHistorialMantenimientoEquipoTitulo").textContent = `Historial de Mantenimiento — ${nombreRed || "N/A"} (${registros.length})`;

  const tbody = $("tbodyHistorialMantenimientoEquipo");
  tbody.innerHTML = registros.length
    ? registros
        .map(
          (m) => `
            <tr>
              <td>${esc(formatearFechaSimple(m.fechaIngreso))}</td>
              <td>${esc(formatearFechaSimple(m.fechaSalida))}</td>
              <td>${esc(m.problema)}</td>
              <td>${esc(m.solucion)}</td>
              <td>${esc(m.tecnico)}</td>
              <td>${esc(m.observaciones)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6" class="empty-state">Este equipo no tiene registros de mantenimiento.</td></tr>`;

  $("modalHistorialMantenimientoEquipoOverlay").style.display = "flex";
}

function cerrarHistorialMantenimientoEquipo() {
  $("modalHistorialMantenimientoEquipoOverlay").style.display = "none";
}

function registrosGarantiaDeEquipo(nombreRed, numeroSerial) {
  // Los tickets de garantia se capturan a veces con el Nombre en Red del equipo
  // y otras veces con su Numero de Serial (segun lo que el proveedor pida en el
  // reporte), asi que se compara contra ambos valores del equipo.
  const candidatos = [nombreRed, numeroSerial].map((v) => (v || "").trim().toLowerCase()).filter(Boolean);
  if (!candidatos.length) return [];
  return ticketsGarantiaData
    .filter((t) => candidatos.includes((t.equipoRef || "").trim().toLowerCase()))
    .sort((a, b) => (b.fechaReporte || "").localeCompare(a.fechaReporte || ""));
}

function actualizarContadorGarantiaEquipo() {
  $("contadorGarantiaEquipo").textContent = registrosGarantiaDeEquipo($("nombreRed").value, $("numeroSerial").value).length;
}

function abrirHistorialGarantiaEquipo() {
  const nombreRed = $("nombreRed").value.trim();
  const numeroSerial = $("numeroSerial").value.trim();
  const registros = registrosGarantiaDeEquipo(nombreRed, numeroSerial);
  $("modalHistorialGarantiaEquipoTitulo").textContent = `Historial de Garantías — ${nombreRed || numeroSerial || "N/A"} (${registros.length})`;

  const tbody = $("tbodyHistorialGarantiaEquipo");
  tbody.innerHTML = registros.length
    ? registros
        .map(
          (t) => `
            <tr>
              <td>${esc(t.proveedor)}</td>
              <td>${esc(t.numeroTicket)}</td>
              <td>${esc(formatearFechaSimple(t.fechaReporte))}</td>
              <td>${esc(formatearFechaSimple(t.fechaResolucion))}</td>
              <td>${esc(diasRespuestaGarantia(t))}</td>
              <td><span class="badge">${esc(t.estado)}</span></td>
              <td>${esc(t.descripcionFalla)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7" class="empty-state">Este equipo no tiene tickets de garantía reportados.</td></tr>`;

  $("modalHistorialGarantiaEquipoOverlay").style.display = "flex";
}

function cerrarHistorialGarantiaEquipo() {
  $("modalHistorialGarantiaEquipoOverlay").style.display = "none";
}

let mostrarHistorialMantenimientoCompleto = false;

function obtenerMantenimientoEquipos() {
  const datos = mostrarHistorialMantenimientoCompleto
    ? mantenimientoEquiposData
    : mantenimientoEquiposData.filter((m) => !nonEmpty(m.fechaSalida));
  return datos.map((m) => ({
    registro: m,
    celdas: `
      <td>${esc(m.equipoRef)}</td>
      <td>${esc(formatearFechaSimple(m.fechaIngreso))}</td>
      <td>${esc(formatearFechaSimple(m.fechaSalida))}</td>
      <td>${esc(m.problema)}</td>
      <td>${esc(m.solucion)}</td>
      <td>${esc(m.tecnico)}</td>
      <td>${esc(m.observaciones)}</td>
    `,
  }));
}

function alternarHistorialMantenimiento() {
  mostrarHistorialMantenimientoCompleto = !mostrarHistorialMantenimientoCompleto;
  const boton = $("btnToggleHistorialMantenimiento");
  const aviso = $("mantenimientoFiltroAviso");
  if (mostrarHistorialMantenimientoCompleto) {
    boton.textContent = "🗂️ Ver solo en proceso";
    aviso.textContent = 'Mostrando el historial completo (en proceso y finalizados). Haz clic en "Ver solo en proceso" para ocultar los ya finalizados.';
  } else {
    boton.textContent = "🗂️ Ver historial completo";
    aviso.textContent = 'Mostrando solo mantenimientos en proceso (sin Fecha de Salida). Haz clic en "Ver historial completo" para ver también los finalizados.';
  }
  vistaMantenimientoEquipos.render();
}

const vistaMantenimientoEquipos = crearVistaLista({
  prefix: "mantenimientoEquipos",
  columnas: 7,
  obtenerFilas: obtenerMantenimientoEquipos,
  filtrar: (r, t) => {
    const texto = [r.registro.equipoRef, r.registro.problema, r.registro.solucion, r.registro.tecnico]
      .join(" ")
      .toLowerCase();
    return t.split(/\s+/).filter(Boolean).every((palabra) => texto.includes(palabra));
  },
  alClicFila: (r) => abrirModalMantenimientoEquipos(r.registro),
});

function generarReporteMantenimiento() {
  const porTecnico = {};
  mantenimientoEquiposData.forEach((registro) => {
    const tecnico = registro.tecnico || "Sin técnico";
    if (!porTecnico[tecnico]) porTecnico[tecnico] = [];
    porTecnico[tecnico].push(registro);
  });
  return Object.keys(porTecnico).sort().map((tecnico) => ({
    tecnico,
    cantidad: porTecnico[tecnico].length,
    equipos: porTecnico[tecnico],
  }));
}

function mostrarReporteMantenimiento() {
  const reporteData = generarReporteMantenimiento();
  const container = $("reporteMantenimientoContainer");
  const tablaBody = $("tablaReporteMantenimiento");
  const chartContainer = $("chartMantenimiento");

  tablaBody.innerHTML = reporteData.map((r) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee; vertical-align: top;">${esc(r.tecnico)}</td>
      <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold; vertical-align: top;">${r.cantidad}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 12px;">
        ${r.equipos
          .map(
            (eq) =>
              `${esc(eq.equipoRef)} <span style="color:#888;">(${esc(formatearFechaSimple(eq.fechaIngreso))} → ${eq.fechaSalida ? esc(formatearFechaSimple(eq.fechaSalida)) : "en proceso"})</span>`
          )
          .join("<br>")}
      </td>
    </tr>
  `).join('');

  if (reporteData.length === 0) {
    tablaBody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No hay registros de mantenimiento</td></tr>';
  }

  const maxVal = Math.max(...reporteData.map((r) => r.cantidad), 1);
  const scale = 200 / maxVal;

  chartContainer.innerHTML = `
    <div style="display: flex; gap: 15px; align-items: flex-end; justify-content: center; height: 250px; border-left: 2px solid #ddd; padding-left: 10px;">
      ${reporteData.map((r) => `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
          <div style="width: 40px; height: ${r.cantidad * scale}px; background-color: #FF9800; border-radius: 2px 2px 0 0; min-height: 2px;" title="${r.tecnico}: ${r.cantidad}"></div>
          <small style="font-size: 10px; color: #666; text-align: center; width: 70px; word-wrap: break-word;">${esc(r.tecnico)}</small>
        </div>
      `).join('')}
    </div>
  `;

  container.style.display = 'block';
}

function descargarReporteMantenimientoPDF() {
  const element = $("reporteMantenimientoContent");
  const opt = {
    margin: 10,
    filename: 'reporte-mantenimiento-' + new Date().toISOString().split('T')[0] + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
  };
  html2pdf().set(opt).from(element).save();
}

function generarReporteGarantias() {
  const datos = {};
  ticketsGarantiaData.forEach((ticket) => {
    const fecha = new Date(ticket.fechaReporte);
    const mesAnio = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
    if (!datos[mesAnio]) datos[mesAnio] = { GBM: 0, Canella: 0 };
    if (ticket.proveedor === 'GBM') datos[mesAnio].GBM++;
    else if (ticket.proveedor === 'Canella') datos[mesAnio].Canella++;
  });
  return Object.keys(datos).sort().map((mes) => ({
    mes,
    GBM: datos[mes].GBM,
    Canella: datos[mes].Canella,
    total: datos[mes].GBM + datos[mes].Canella,
  }));
}

function mostrarReporteGarantias() {
  console.log("=== Mostrar Reporte Garantías ===");
  const reporteData = generarReporteGarantias();
  console.log("Datos del reporte:", reporteData);
  const container = $("reporteGarantiaContainer");
  const tablaBody = $("tablaReporteGarantia");
  const chartContainer = $("chartGarantias");
  console.log("Contenedores encontrados:", { container, tablaBody, chartContainer });

  tablaBody.innerHTML = reporteData.map((r) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${r.mes}</td>
      <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${r.GBM}</td>
      <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;">${r.Canella}</td>
      <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold;">${r.total}</td>
    </tr>
  `).join('');

  if (reporteData.length === 0) {
    tablaBody.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">No hay datos de tickets de garantía</td></tr>';
  }

  const maxVal = Math.max(...reporteData.flatMap((r) => [r.GBM, r.Canella]), 1);
  const scale = 200 / maxVal;

  chartContainer.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: flex-end; justify-content: center; height: 250px; border-left: 2px solid #ddd; padding-left: 10px;">
      ${reporteData.map((r) => `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
          <div style="display: flex; gap: 5px; align-items: flex-end;">
            <div style="width: 25px; height: ${r.GBM * scale}px; background-color: #4CAF50; border-radius: 2px 2px 0 0; min-height: 2px;" title="GBM: ${r.GBM}"></div>
            <div style="width: 25px; height: ${r.Canella * scale}px; background-color: #2196F3; border-radius: 2px 2px 0 0; min-height: 2px;" title="Canella: ${r.Canella}"></div>
          </div>
          <small style="font-size: 11px; color: #666; text-align: center; width: 60px;">${r.mes}</small>
        </div>
      `).join('')}
    </div>
    <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px; font-size: 12px;">
      <div style="display: flex; align-items: center; gap: 5px;">
        <div style="width: 15px; height: 15px; background-color: #4CAF50;"></div>
        <span>GBM</span>
      </div>
      <div style="display: flex; align-items: center; gap: 5px;">
        <div style="width: 15px; height: 15px; background-color: #2196F3;"></div>
        <span>Canella</span>
      </div>
    </div>
  `;

  container.style.display = 'block';
}

function descargarReporteGarantiaPDF() {
  const element = $("reporteGarantiaContent");
  const opt = {
    margin: 10,
    filename: 'reporte-garantia-' + new Date().toISOString().split('T')[0] + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
  };
  html2pdf().set(opt).from(element).save();
}

function obtenerDispositivos() {
  return equipos
    .filter((e) => nonEmpty(e.nombreDispositivo) || nonEmpty(e.serialDispositivo))
    .map((e) => ({
      equipo: e,
      celdas: `
        <td>${esc(e.nombreDispositivo)}</td>
        <td>${esc(e.serialDispositivo)}</td>
        <td>${esc(e.nombreRed)}</td>
        <td>${esc(e.nombreEmpleado)}</td>
        <td>${esc(e.empresa)}</td>
      `,
    }));
}

const vistaDispositivos = crearVistaLista({
  prefix: "dispositivos",
  columnas: 5,
  obtenerFilas: obtenerDispositivos,
  filtrar: (r, t) => [r.equipo.nombreDispositivo, r.equipo.serialDispositivo, r.equipo.nombreRed].join(" ").toLowerCase().includes(t),
  alClicFila: (r) => abrirModal(r.equipo),
});

function obtenerContratos() {
  return equipos
    .filter((e) => nonEmpty(e.contratos))
    .map((e) => ({
      equipo: e,
      celdas: `
        <td>${esc(e.contratos)}</td>
        <td>${esc(e.nombreRed)}</td>
        <td>${esc(e.nombreEmpleado)}</td>
        <td>${esc(e.empresa)}</td>
      `,
    }));
}

const vistaContratos = crearVistaLista({
  prefix: "contratos",
  columnas: 4,
  obtenerFilas: obtenerContratos,
  filtrar: (r, t) => [r.equipo.contratos, r.equipo.nombreRed, r.equipo.nombreEmpleado, r.equipo.empresa].join(" ").toLowerCase().includes(t),
  alClicFila: (r) => abrirModal(r.equipo),
});

function aplicarFechaVencimientoContrato() {
  const resultado = $("bulkContratoResultado");
  const numero = $("bulkContratoNumero").value.trim();
  const fecha = $("bulkContratoFecha").value.trim();

  resultado.className = "acta-estado";
  resultado.style.display = "";

  if (!numero || !fecha) {
    resultado.textContent = "Escribe el número de contrato y la fecha de vencimiento.";
    return;
  }
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
    resultado.textContent = "La fecha debe tener el formato dd/mm/aaaa (ej. 19/06/2029).";
    return;
  }

  const afectados = equipos.filter((e) => soloNumeroContrato(e.contratos) === numero);
  if (!afectados.length) {
    resultado.textContent = `No se encontró ningún equipo con el contrato "${numero}".`;
    return;
  }

  afectados.forEach((e) => {
    e.contratos = `${numero} (vence ${fecha})`;
    sincronizarEquipo(e);
  });
  guardarDatos();
  render();
  refrescarVistasSecundarias();
  vistaContratos.render();

  resultado.textContent = `✓ Fecha de vencimiento actualizada a ${fecha} en ${afectados.length} equipo(s) del contrato ${numero}.`;
  $("bulkContratoNumero").value = "";
  $("bulkContratoFecha").value = "";
}

$("btnAplicarFechaContrato").addEventListener("click", aplicarFechaVencimientoContrato);
$("btnNuevo").addEventListener("click", () => abrirModal(null));
$("btnSugerirIdGlpi").addEventListener("click", () => {
  $("idGlpi").value = siguienteIdGlpi();
});
$("nombreRed").addEventListener("input", onCambioNombreRedEquipo);
inicializarAutocompleteMonitor();
$("btnCerrarModal").addEventListener("click", cerrarModal);
$("btnCancelar").addEventListener("click", cerrarModal);
$("btnEliminarModal").addEventListener("click", eliminarActual);
$("btnImprimirDesdeModal").addEventListener("click", imprimirDesdeEdicion);
$("formEquipo").addEventListener("submit", onSubmit);

$("btnNuevaImpresora").addEventListener("click", () => abrirModalImpresora(null));
$("btnCerrarModalImpresora").addEventListener("click", cerrarModalImpresora);
$("btnCancelarImpresora").addEventListener("click", cerrarModalImpresora);
$("btnEliminarModalImpresora").addEventListener("click", eliminarImpresoraActual);
$("formImpresora").addEventListener("submit", onSubmitImpresora);

$("btnNuevoCodigo").addEventListener("click", () => abrirModalCodigo(null));
$("btnCerrarModalCodigo").addEventListener("click", cerrarModalCodigo);
$("btnCancelarCodigo").addEventListener("click", cerrarModalCodigo);
$("btnEliminarModalCodigo").addEventListener("click", eliminarCodigoActual);
$("formCodigo").addEventListener("submit", onSubmitCodigo);

$("btnNuevoTicketGarantia").addEventListener("click", () => abrirModalTicketGarantia(null));
$("btnCerrarModalTicketGarantia").addEventListener("click", cerrarModalTicketGarantia);
$("btnCancelarTicketGarantia").addEventListener("click", cerrarModalTicketGarantia);
$("btnEliminarModalTicketGarantia").addEventListener("click", eliminarTicketGarantiaActual);
$("tgProveedor").addEventListener("change", actualizarCampoEquipoTicketGarantia);
$("formTicketGarantia").addEventListener("submit", onSubmitTicketGarantia);
$("btnVerEstadisticasGarantia").addEventListener("click", mostrarReporteGarantias);
$("btnDescargarReportePDF").addEventListener("click", descargarReporteGarantiaPDF);
$("btnCerrarReporte").addEventListener("click", () => {
  $("reporteGarantiaContainer").style.display = "none";
});

$("btnNuevoMantenimientoEquipo").addEventListener("click", () => abrirModalMantenimientoEquipos(null));
$("btnCerrarModalMantenimientoEquipos").addEventListener("click", cerrarModalMantenimientoEquipos);
$("btnCancelarMantenimientoEquipos").addEventListener("click", cerrarModalMantenimientoEquipos);
$("btnEliminarModalMantenimientoEquipos").addEventListener("click", eliminarRegistroMantenimientoActual);
$("meEquipo").addEventListener("change", actualizarUsuarioEquipoMantenimiento);
$("formMantenimientoEquipos").addEventListener("submit", onSubmitMantenimientoEquipos);
$("btnVerMantenimientoDeEquipo").addEventListener("click", abrirHistorialMantenimientoEquipo);
$("btnCerrarHistorialMantenimientoEquipo").addEventListener("click", cerrarHistorialMantenimientoEquipo);
$("btnCerrarHistorialMantenimientoEquipo2").addEventListener("click", cerrarHistorialMantenimientoEquipo);

$("btnNuevoContadorImpresora").addEventListener("click", () => abrirModalContadorImpresora(null));
$("btnCerrarModalContadorImpresora").addEventListener("click", cerrarModalContadorImpresora);
$("btnCancelarContadorImpresora").addEventListener("click", cerrarModalContadorImpresora);
$("btnEliminarModalContadorImpresora").addEventListener("click", eliminarRegistroContadorImpresoraActual);
$("formContadorImpresora").addEventListener("submit", onSubmitContadorImpresora);
$("btnMigrarStockToner").addEventListener("click", migrarStockTonerDesdeImpresoras);
$("btnCerrarImpresorasPorToner").addEventListener("click", cerrarModalImpresorasPorToner);
$("btnCerrarImpresorasPorToner2").addEventListener("click", cerrarModalImpresorasPorToner);

inicializarAutocompleteSalidaToner("sv");
$("formSalidaToner").addEventListener("submit", onSubmitNuevaSalidaToner);
inicializarAutocompleteSalidaToner("esv");
$("formEditarSalidaToner").addEventListener("submit", onSubmitEditarSalidaToner);
$("btnCancelarSalidaToner").addEventListener("click", cerrarModalSalidaToner);
$("btnCerrarModalSalidaToner").addEventListener("click", cerrarModalSalidaToner);
$("btnEliminarSalidaToner").addEventListener("click", eliminarSalidaTonerActual);
$("btnDescargarReporteToner").addEventListener("click", descargarReporteStockToner);

$("formIngresoToner").addEventListener("submit", onSubmitIngresoToner);
$("formEditarIngresoToner").addEventListener("submit", onSubmitEditarIngresoToner);
$("btnCancelarIngresoToner").addEventListener("click", cerrarModalIngresoToner);
$("btnCerrarModalIngresoToner").addEventListener("click", cerrarModalIngresoToner);

$("btnVerGarantiaDeEquipo").addEventListener("click", abrirHistorialGarantiaEquipo);
$("btnCerrarHistorialGarantiaEquipo").addEventListener("click", cerrarHistorialGarantiaEquipo);
$("btnCerrarHistorialGarantiaEquipo2").addEventListener("click", cerrarHistorialGarantiaEquipo);

$("btnCerrarDetalleEquipoTIv2").addEventListener("click", cerrarDetalleEquipoTIv2);
$("btnCerrarDetalleEquipoTIv2_2").addEventListener("click", cerrarDetalleEquipoTIv2);
$("btnToggleHistorialMantenimiento").addEventListener("click", alternarHistorialMantenimiento);
$("btnVerReporteMantenimiento").addEventListener("click", mostrarReporteMantenimiento);
$("btnDescargarReporteMantenimientoPDF").addEventListener("click", descargarReporteMantenimientoPDF);
$("btnCerrarReporteMantenimiento").addEventListener("click", () => {
  $("reporteMantenimientoContainer").style.display = "none";
});

$("btnGenerarActa").addEventListener("click", abrirModalActa);
$("btnCerrarModalActa").addEventListener("click", cerrarModalActa);
$("btnCancelarActa").addEventListener("click", cerrarModalActa);
$("btnGenerarEImprimir").addEventListener("click", generarEImprimirActa);
$("actaNombreRed").addEventListener("input", onCambioNombreRedActa);

$("btnDashboard").addEventListener("click", () => {
  window.open("dashboard.html?v=20260828h", "dashboardInventarioTI", "width=1280,height=900");
});

$("btnVerTodosDepartamentos").addEventListener("click", () => irACatalogoImpresorasFiltrado(null, ""));


$("btnNuevoIngreso").addEventListener("click", abrirModalIngreso);
$("btnCerrarModalIngreso").addEventListener("click", cerrarModalIngreso);
$("btnCancelarIngreso").addEventListener("click", cerrarModalIngreso);
$("btnGenerarIngreso").addEventListener("click", generarIngresoCompleto);
$("ingresoNombreRed").addEventListener("input", onCambioNombreRedIngreso);

$("conteoRapidoInput").addEventListener("input", actualizarConteoRapido);

$("filtroVacioAviso").addEventListener("click", () => { filtroCampoVacio = null; filtroEnRevision = false; filtroPropios = false; filtroLenovo = false; filtroRiolsaTodos = false; paginaActual = 1; render(); });

$("buscador").addEventListener("input", () => { filtroCampoVacio = null; filtroEnRevision = false; filtroPropios = false; filtroLenovo = false; filtroRiolsaTodos = false; paginaActual = 1; render(); });
$("filtroEmpresa").addEventListener("change", () => { filtroCampoVacio = null; filtroEnRevision = false; filtroPropios = false; filtroLenovo = false; filtroRiolsaTodos = false; paginaActual = 1; render(); });
$("filtroStatus").addEventListener("change", () => { filtroCampoVacio = null; filtroEnRevision = false; filtroPropios = false; filtroLenovo = false; filtroRiolsaTodos = false; paginaActual = 1; render(); });
$("filtroTipo").addEventListener("change", () => { filtroCampoVacio = null; filtroEnRevision = false; filtroPropios = false; filtroLenovo = false; filtroRiolsaTodos = false; paginaActual = 1; render(); });

$("btnPrimero").addEventListener("click", () => { paginaActual = 1; render(); });
$("btnAnterior").addEventListener("click", () => { paginaActual--; render(); });
$("btnSiguiente").addEventListener("click", () => { paginaActual++; render(); });
$("btnUltimo").addEventListener("click", () => {
  paginaActual = Math.ceil(obtenerFiltrados().length / PAGE_SIZE);
  render();
});

cargarDatos();
cargarImpresoras();
cargarCodigos();
cargarTicketsGarantia();
cargarMantenimientoEquipos();
cargarContadoresImpresoras();
cargarSalidasToner();
cargarIngresosToner();
poblarFiltrosYDatalists();
render();
renderTablero();
renderSalidasToner();
renderIngresosToner();
renderFormularioIngresoToner();
