# Proyecto: Sistema de Inventario TI

Sistema web (Firebase) de inventario de equipos TI, más un **Agente de Inventario** estilo GLPI
que recolecta hardware/software de PCs Windows y lo envía a Firebase (migrará a servidor virtual futuro).

## Ramas del repositorio (importante, no es lo típico)

- **NO existe rama `main`**. El repo tiene 3 ramas: `claude/funny-maxwell-lxolm4`,
  `claude/project-status-bp3wfn`, `claude/project-status-jcvsc9`.
- **`claude/funny-maxwell-lxolm4` es la rama por defecto (HEAD) y la que sirve GitHub Pages**
  en `https://itbreemer.github.io/pruebas1/` — es la rama "producción" del sitio web en vivo.
- **`claude/project-status-bp3wfn` es la rama de desarrollo** designada para el trabajo del
  Agente de Inventario y donde se hacen los commits normalmente.
- Cuando un cambio debe verse reflejado en el sitio en vivo, hay que fusionar
  `claude/project-status-bp3wfn` → `claude/funny-maxwell-lxolm4` y hacer push a esa rama
  (con permiso explícito del usuario, ya que afecta producción). Ya se hizo un merge así
  (fast-forward, sin conflictos) para publicar la sección "Inventario Automático".
- Al descargar el ZIP desde GitHub para probar en Windows, hay que asegurarse de bajar la
  rama correcta (`?` en la URL: `github.com/itbreemer/pruebas1/tree/claude/project-status-bp3wfn`),
  NO la rama por defecto, si se quiere probar cambios del agente antes de fusionarlos.

## Agente de Inventario (agent-inventario.ps1)

Archivos clave:
- `agent-inventario.ps1` — script principal del agente
- `config.json` — configuración (endpoint, credenciales, frecuencia, retry, logging)
- `install-agent-gpo.ps1` — instalador (crea tarea programada, para distribuir vía GPO)
- `test-agent.ps1` — script de validación/diagnóstico
- `AGENT-SETUP.md` — guía completa de instalación y GPO

Instala en `C:\ProgramData\AgentInventario` (bin/, config.json, logs/, data/).
Tarea programada: `AgentInventarioTI`, corre como SYSTEM.
Equipo de prueba: `LAPLNV250` (usuario `victor.morales`, dominio `GRUPOLTZ`).

### Credenciales Firebase (proyecto `inventario-ti-riol`)
- projectId: `inventario-ti-riol`
- database/colección Firestore del agente: `equiposTI_v2`
- apiKey: en `config.json` (no exponer en commits públicos si el repo se hace público)

### Reglas de Firestore
La colección `equiposTI_v2` tiene reglas especiales porque el agente autentica solo con
API Key (sin Firebase Auth de usuario):
```
match /equiposTI_v2/{equipoId} {
  allow read: if request.auth != null;
  allow write: if true;
}
```
El resto de colecciones del sistema usan `allow read, write: if request.auth != null;`.

### Bugs resueltos en agent-inventario.ps1 (importante para no repetirlos)

1. **`Invoke-WebRequest -Method PATCH` falla con `UriFormatException`** ("URI no válido: no se
   puede analizar el nombre de host") en Windows PowerShell/.NET Framework — bug conocido del
   truco por reflection que usa para soportar el verbo PATCH. **Fix**: se reemplazó por
   `System.Net.Http.HttpClient` en `Send-ToFirebase`.

2. **`(default)` sin codificar en la URL de Firestore** también puede causar problemas de parseo
   — se usa `%28default%29` en su lugar. (Al final este NO era la causa raíz del bug de PATCH,
   pero de todas formas es más correcto codificarlo.)

3. **Codificación UTF-8 al descargar el ZIP de GitHub en Windows**: los símbolos `✓`/`✗` en los
   scripts pueden romper el parser de PowerShell si el archivo no se re-guarda como UTF-8 tras
   extraer el ZIP. Aplicar en cada máquina tras descargar/actualizar el script:
   ```powershell
   $c = Get-Content .\archivo.ps1 -Raw -Encoding UTF8
   $c | Set-Content .\archivo.ps1 -Encoding UTF8
   ```

4. **`Send-ToFirebase` serializaba vacíos los campos anidados (hardware/software/red)**: el
   loop original solo manejaba campos de primer nivel; hashtables/arrays anidados se guardaban
   como `mapValue`/`arrayValue` vacíos. **Fix**: función recursiva `ConvertTo-FirestoreValue`
   que convierte cualquier valor de PowerShell (hashtable, PSCustomObject, array, string,
   numero, bool, null) al formato "Value" de Firestore.

5. **`ConvertTo-Json` corrompe el documento con estructuras muy anidadas** (bug real y confirmado
   de Windows PowerShell): al convertir el `$firestoreDoc` completo (cada nivel real de datos
   queda envuelto en 2-3 niveles extra por el formato Firestore: `mapValue`/`fields`,
   `arrayValue`/`values`), `ConvertTo-Json -Depth N` puede caer en su serialización por
   reflexión .NET del hashtable de nivel superior, devolviendo sus propiedades internas
   (`Keys`, `Values`, `Count`, `IsReadOnly`, `IsFixedSize`, `IsSynchronized`, `SyncRoot`) en vez
   de los nombres de campo reales (`computadora`, `hardware`, etc.) — aun cuando los VALORES
   anidados individuales se veían bien. Prueba definitiva de este bug: un campo `"SyncRoot":
   "System.Object"` apareciendo en el documento de Firestore. **Fix**: se dejó de usar
   `ConvertTo-Json` para el cuerpo de la petición; ahora `ConvertTo-FirestoreJsonValue` /
   `ConvertTo-FirestoreRequestBody` arman el texto JSON a mano de forma recursiva.

6. **El serializador manual (fix #5) al principio devolvía el valor "pelado" en vez del Value
   completo** — ej. `"GRUPOLTZ"` en vez de `{"stringValue":"GRUPOLTZ"}` — causando que Firestore
   rechazara el documento con 400 `INVALID_ARGUMENT` ("Unknown name X: Cannot find field" /
   "Invalid value at document.fields[N].value"). **Fix**: cada rama de
   `ConvertTo-FirestoreJsonValue` devuelve el objeto Value completo con su llave de tipo
   (`stringValue`, `integerValue` como string, `doubleValue`, `booleanValue`, `mapValue`,
   `arrayValue`). Este fue el último fix aplicado; **pendiente de confirmación** en la máquina
   de prueba (`LAPLNV250`) — el usuario iba a re-descargar, re-ejecutar y confirmar que el
   documento en Firestore y la vista web ya muestran los datos reales.

7. **Reintentos (`Retry-SendInventory`) recargan el inventario desde JSON local** vía
   `ConvertFrom-Json`, lo que produce `PSCustomObject` en vez de `Hashtable`.
   `ConvertTo-FirestoreValue` ahora también reconoce `[System.Management.Automation.PSCustomObject]`
   (además de `[hashtable]`) para no perder la estructura anidada en los reintentos.

### Metodología útil para depurar este tipo de bug
Cuando algo llega vacío o corrupto a Firestore: (1) confirmar con `console.log(JSON.stringify(...))`
en la consola del navegador qué llega realmente al cliente web, (2) comparar contra Firebase
Console (ojo: Firebase Console puede mostrar el array `Values` con índices numéricos que
parecen nombres de campo reales si el documento está corrupto — hay que mirar los nombres de
campo de primer nivel sin expandir nada para confirmar), (3) aislar con pruebas mínimas de
`ConvertTo-Json`/`Invoke-WebRequest` directamente en PowerShell antes de teorizar más.

## Sección web "Inventario Automático" (equiposTI_v2)

Se agregó una sección de solo lectura en la app principal (`index.html` + `app.js`) que muestra
los datos que junta el agente, siguiendo el mismo patrón que las demás secciones
(`crearVistaLista`, nav-tab, `*-sync.js`):

- `index.html`: botón de nav `data-vista="equiposTIv2"`, sección `#vista-equiposTIv2` con tabla
  (Equipo, Usuario, Procesador, RAM, SO, IP, Serial, Última Actualización), script tag para
  `equipos-ti-v2-sync.js`.
- `app.js`: `equiposTIv2Data` (array), `establecerEquiposTIv2DesdeSync` (setter, sin merge con
  nada local ya que es de solo lectura), `obtenerEquiposTIv2` (row mapper), `vistaEquiposTIv2`
  (`crearVistaLista`), rama en `cambiarVista()`.
- `equipos-ti-v2-sync.js`: nuevo archivo, solo `onSnapshot` (sin escritura) — el agente es el
  único que escribe en `equiposTI_v2`.

Esta es una colección **separada** de `equipos` (la colección administrativa/manual que usa el
resto de la app) — son dos inventarios distintos a propósito (Opción B que eligió el usuario):
`equipos` = captura manual de RRHH/asignación; `equiposTI_v2` = datos técnicos en vivo del agente.

### Estado actual
- Agente probado repetidamente en `LAPLNV250`; hardware/software se recolectan bien.
- El pipeline de envío a Firestore pasó por varias iteraciones de bugs (ver arriba, puntos 4-7)
  hasta el fix del punto 6 (últimol) — **confirmado funcionando**: el documento en Firestore y
  la vista web "Inventario Automático" ya muestran los datos reales (hardware/software completos,
  no N/A, no `Keys`/`Values`/`Count`).
- Se agregó detección del monitor físico conectado (`Get-ConnectedMonitors`, WMI `WmiMonitorID`
  en `root\wmi`) — guarda fabricante/modelo/serial en `hardware.monitores`. Funciona
  independiente de la marca de la PC. Puede fallar en VMs o con drivers de video genéricos (no
  es bug, es limitación del hardware/driver).
- Pendiente: distribuir vía GPO a más equipos del dominio; considerar restringir la API Key de
  Firebase (por IP o servicio) antes de distribución masiva.

## Dashboard flotante (dashboard.html / dashboard.js)

Ventana emergente de solo lectura (`window.open` desde `app.js`, botón del Tablero) con
tarjetas donut en vivo: Equipos Lenovo, Equipos Unidades de Negocio, Equipos RIOLSA, Impresoras
Canon, Contratos Lenovo. A diferencia de la app principal, **lee la colección `equipos` de
Firestore directamente** (no pasa por `app.js`/`data.js`).

### Bug importante ya resuelto: los totales no cuadraban con el Tablero
`app.js` aplica varias correcciones **solo en memoria, nunca se empujan a Firestore a
propósito** (para no arriesgar que una fecha "reciente" forzada le gane en la fusión a una
edición real más nueva hecha en otro navegador — ver comentarios en `quitarMarcaRevisionConfirmados`,
`corregirEmpresasMalCapturadas`, `corregirComentariosUsoRiolsa`, `corregirTipoEquipoMalClasificado`
en `app.js`), además de dos exclusiones (`eliminarDuplicadoP025194`, `eliminarChatarraConfirmada`)
que si empujan `sincronizarEliminacion` pero dependen de que algún navegador haya cargado
`index.html` después del cambio para que ya se haya borrado de Firestore.

Como `dashboard.js` lee Firestore "en crudo", estas correcciones NO se aplicaban ahí, causando
que la tarjeta "Equipos propios" del dashboard diera menos que la del Tablero (ej. 190 vs 208):
~24 equipos en `IDS_CONFIRMADOS_ACTIVOS` seguían marcados "en revisión" en el doc crudo de
Firestore aunque el Tablero ya les quita esa marca localmente.

**Fix aplicado**: se duplicaron en `dashboard.js` las listas `ID_DUPLICADO_P025194`,
`IDS_CHATARRA_CONFIRMADA` e `IDS_CONFIRMADOS_ACTIVOS` (mismas que `app.js`) y se replicó la
lógica de exclusión/override de "en revisión". **Importante para el futuro**: si se agregan o
quitan IDs de esas listas en `app.js`, hay que copiar el cambio también en `dashboard.js`, o los
totales del dashboard se desincronizarán de nuevo del Tablero. Si esto vuelve a pasar muy
seguido, considerar mover el cálculo a un documento resumen en Firestore que `app.js` publique
y `dashboard.js` solo lea (evitaría la duplicación, pero es un cambio más grande).

También se corrigió que los círculos del dashboard solo sumaban PC + Laptop para el número
central (dejando fuera equipos con `tipoEquipo` de otras familias) — ahora `pintarBloque` recibe
un total real explícito además del desglose PC/Laptop.

**Verificación final (con `window.__debugTablero` / `window.__debugDashboard` temporales,
ya quitados)**: el total sí cuadraba (208 = 190 "Equipos Unidades de Negocio" + 18 "Equipos
RIOLSA"). La confusión real del usuario fue de lectura: hay que fijarse en el **número grande
del centro de la dona** (el total real de esa categoría), no en la suma de PC+Laptop de la
leyenda de al lado (esa leyenda solo cuenta los clasificados como Desktop/Notebook; el resto de
`tipoEquipo` queda fuera de la leyenda pero sí está en el número central).

**Otra causa real de números "viejos" en pantalla**: `index.html` referencia `app.js` y
`style.css` con un parámetro `?v=` de cache-busting que hay que **subir manualmente cada vez
que se editan esos archivos** (igual que ya se hacía con `dashboard.html`/`dashboard.js`). Si
se te olvida, el navegador puede seguir sirviendo una copia en caché sin los últimos cambios
aunque el archivo en el repo ya esté actualizado. Antes de dar un cambio de `app.js`/`style.css`
por publicado, confirmar que el `?v=` en `index.html` se subió también.

## Alta masiva de equipos: contrato Lenovo 8030028191 (Tecnoelec)

Primera vez que se dio de alta un contrato completo de equipos nuevos directo en el código
(no capturado a mano uno por uno en la UI). Mecanismo usado — **es el patrón a seguir para la
próxima entrega de equipos**:

- **48 equipos** (30 laptops ThinkPad T14 Gen 6 modelo `21QC00BDFJ` + 18 desktops ThinkCentre
  M70q Gen5 modelo `12TD0038FJ`) agregados directo a `SEED_DATA` en `data.js`, con
  `id: "alta-8030028191-<nombreRed>"`, `fabricante: "LENOVO"`,
  `contratos: "8030028191 (vence 11/09/2031)"`.
- **18 monitores** ThinkVision S24-4E (`64B5KAR1LA`) agregados a `CATALOGO_MONITORES` en
  `monitores.js`, y vinculados 1 a 1 al campo `monitor` de su Desktop correspondiente (mismo
  Serial).
- **Por qué no basta con solo agregar a `SEED_DATA`**: `fusionarContratosDesdeSeed()` en `app.js`
  sí agrega automáticamente cualquier `id` nuevo de `SEED_DATA` al estado local de CADA navegador
  que cargue la app, pero **eso no los sube a Firestore por sí solo** — antes solo dos ids
  hardcodeados (`IDS_ALTAS_NUEVAS_SEED`) se sincronizaban de verdad. Se agregó
  `esAltaContrato8030028191(id)` (revisa el prefijo `"alta-8030028191-"`) para que los 48 sí se
  suban a Firestore automáticamente la primera vez que cualquier usuario autenticado cargue la
  app actualizada — **si se hace otra alta así en el futuro, hay que repetir este mismo patrón**
  (prefijo de id nuevo + agregarlo también a la condición en `fusionarContratosDesdeSeed`), o
  los equipos quedarán solo en el navegador de quien cargó primero y nunca en Firestore.
- **Datos de empleado cruzados contra el padrón real** (`Empleados_activo_sal_13-08-2026.xlsx`,
  hojas `textil`/`Resto de empresas`/`RIOL`, columnas Nombre/Posición/Número ID (DPI)/Sociedad):
  36 de 39 nombres reales del contrato se identificaron con DPI confirmado (algunos por nombre
  exacto, otros solo se pudieron desambiguar comparando el Puesto del Excel de Lenovo contra la
  Posición del padrón cuando había varias personas con el mismo nombre). Empresa se normalizó a
  la convención ya usada en la app (ej. `"Terter, S.A."` → `"Terter"`, `"PLANISALARIS, S.A."` →
  `"Planisalaris"`) en vez de copiar el texto legal completo del padrón.
- **4 personas quedaron pendientes** (sin DPI, `comentarios` marca "pendiente confirmar
  identidad/DPI"): Jose Jimenez (3 candidatos en el padrón, ninguno con el Puesto exacto del
  Excel — no se adivinó), y Rolman Ivan Urizar / Mario Walter Leiva / Ofelia Bedoya (no
  aparecen en absoluto en el padrón — probablemente contrataciones posteriores al corte del
  13/08/2026). Hay que completar esto antes de generar su Acta.
  - **Mario Walter Leiva (LAPLNV304) ya resuelto**: el usuario dio su DPI directo
    (`3269522331015`, no está en el padrón de empleados — se usó tal cual, sin cruzarlo).
    Mismo patrón que Ofelia Bedoya: se agregó `corregirDpiLAPLNV304()` en
    `fusionarContratosDesdeSeed` (busca por `id`, si `dpi` sigue vacío lo llena y
    **sí** sincroniza con `sincronizarEquipo()`), porque el registro ya se había publicado y
    sincronizado sin DPI. Empresa/departamento de esta persona siguen sin confirmar.
  - **Jose Jimenez (LAPLNV292) ya resuelto**: el usuario dio el código SAP (Nº pers. 10000551),
    que en el padrón corresponde a **Jose Adonias Jimenez Mejia** (Supervisor de Lineas de
    Transmisión, EN-Lineas de transmisión, Terter, DPI 2523779660101) — el mismo candidato de
    los 3 que ya se había detectado, ahora confirmado con el código en vez de por el Puesto
    (que no calzaba exacto). Mismo patrón de corrección forzada: `corregirEmpleadoLAPLNV292()`.
  - **Ofelia Bedoya (LAPLNV315) ya resuelto**: el usuario confirmó que en realidad es
    **Edwin Roberto Ayala Manrique** (Director legal, CORP-Legal, Breemer, DPI encontrado en
    el padrón). Como ese registro **ya se había sincronizado a Firestore** con el dato viejo
    antes de esta corrección, no bastaba con editar `SEED_DATA` — se agregó
    `corregirEmpleadoLAPLNV315()` (mismo patrón que `corregirFechaContrato8030028059` y
    similares en `fusionarContratosDesdeSeed`): busca el equipo por `id`, y si su
    `nombreEmpleado` todavía dice "Ofelia Bedoya" lo corrige y **sí** lo vuelve a sincronizar
    con `sincronizarEquipo()` (a diferencia de otras correcciones de esa función que son
    solo-en-memoria a propósito). Se aplica una sola vez; si el usuario ya lo editó a mano
    desde la app, la función no vuelve a tocarlo. **Si aparece otra corrección así de un
    registro que ya se publicó y sincronizó**, replicar este mismo patrón en vez de solo
    editar `data.js`.
  - **Código de empleado (código SAP / Nº pers.) completado para los 37 con DPI confirmado**:
    se cruzó cada DPI contra la columna "Nº pers." del mismo padrón (`Empleados_activo_sal_13-
    08-2026.xlsx`) para llenar `codigoEmpleado`. Como ya estaban publicados y sincronizados sin
    este dato, se agregó `corregirCodigosEmpleadoAlta8030028191()` — un mapa
    `{nombreRed: codigo}` (`CODIGOS_EMPLEADO_ALTA_8030028191`) en vez de una función por
    equipo, ya que eran 37 de una sola vez. Mario Walter Leiva (DPI dado directo por el
    usuario, no está en el padrón) y los generic/cuentas compartidas se quedan sin código —
    no aplica.
  - **Fecha de Ingreso (equipo) fijada para los 48**: `2026-09-11` (fecha real de entrega física
    de Tecnoelec, coincide con la Fecha Inicio del contrato). Mismo patrón de corrección
    forzada: `corregirFechaIngresoAlta8030028191()` recorre todos los `id` con prefijo
    `alta-8030028191-` y llena `fechaIngresoEquipo` si sigue vacío, re-sincronizando cada uno.
  - **Memoria RAM igual en las 30 laptops**: `memoriaDescripcion` = "KINGSTON 16GB DDR5
    5600MT/S SODIMM", `codigoRam` = "KCP556SS8-15" (confirmado por el usuario contra la
    Tarjeta de Responsabilidad impresa de una de ellas — mismo módulo en todas, solo cambia
    el dato del empleado). Mismo patrón: `corregirMemoriaRamLaptopsAlta8030028191()`.
- **Renovación de equipo detectada a tiempo**: 3 de los 18 Desktops (`PCLNV230/231/232`) iban a
  usar cuentas de dominio `atencion.clienteXX` que **ya existían** en el inventario — se validó
  contra la vista Usuarios antes de aplicar y se descubrió que `atencion.cliente01` es de
  **Julio Ramiro Fuentes Castro** (Tennat, equipo `PCLNV189`, con contrato activo → NO se toca)
  y `atencion.cliente03`/`04` son de **Francisco Javier Figueroa Solares** (Breemer) pero con
  otro equipo (`LAPDELL002`/`LAPDELL003`, sin contrato → SON los que se reemplazan). Resultado:
  `PCLNV230` hereda usuario/departamento de `LAPDELL002` (atencion.cliente03), `PCLNV231` de
  `LAPDELL003` (atencion.cliente04), y `PCLNV232` usa el único número libre (atencion.cliente02,
  sin equipo previo, departamento pendiente de definir). **`LAPDELL002` y `LAPDELL003` NO se
  modificaron** (siguen "Asignada" tal cual) — el usuario decidió no marcarlos como devueltos
  todavía, pendiente de la entrega física real.
- **`PCLNV229`** (el 4to "Usuario SLA" original) se dejó **sin tocar**, fuera de esta renovación,
  a pedido explícito del usuario.
- **2 laptops sin destino** (`LAPLNV317`, `LAPLNV318`): `status: "Nuevo > Sin Asignar"`,
  `ubicaciones: "Bodega"`, disponibilidad de bodega — no llevan Acta hasta que se asignen.
- **Próximo paso pendiente (fuera de esta tarea)**: cuando se entregue cada equipo físicamente,
  usar "📦 Nuevo Ingreso" con el Nombre en Red — como el equipo ya existe, autocompleta todo
  (empleado, puesto, departamento, modelo, serial, contrato) y solo falta el DPI (si no estaba
  ya cargado) para generar el Acta + Tarjeta de Responsabilidad.

## Mejoras recientes a la app web principal (index.html / app.js)

### Monitor vinculado al Catálogo de Monitores
- El campo "Monitor" del equipo (antes texto libre) ahora es un **autocompletado** que busca en
  `CATALOGO_MONITORES` (definido en `monitores.js`, ~180 monitores contratados con
  serial/modelo/descripción/contrato/fechaFin) por serial, modelo o descripción a medida que se
  escribe. Al seleccionar, se guarda el **serial** en `equipo.monitor` (sigue siendo un string
  plano, compatible con el sistema genérico `FIELD_IDS`). Debajo del campo se muestra un mensaje
  de confirmación con la descripción completa, contrato y fecha de vencimiento
  (`actualizarAyudaMonitor`), o una advertencia si el valor no calza con el catálogo (texto
  libre legado, se preserva).
- Funciones clave en `app.js`: `buscarMonitorCatalogo`, `descripcionMonitorEquipo`,
  `renderSugerenciasMonitor`, `inicializarAutocompleteMonitor`, `actualizarAyudaMonitor`.
- **NO usar `<select>`** para esto — con ~180 opciones resultó inutilizable (había que scrollear
  toda la lista). El autocompletado de texto libre + sugerencias filtradas es la solución que
  funcionó bien.
- El "Catálogo de monitores contratados (sin asignar a un equipo)" (`vistaCatalogoMonitores`) es
  clickeable: busca qué equipo tiene ese serial asignado (`equipoAsignadoAMonitor`) y abre su
  modal, o avisa que no está asignado aún.
- Nuevo campo `equipo.numeroInventarioMonitor` ("No. Inventario Monitor") — el número de
  activo fijo del monitor físico entregado (puede diferir del registrado si se entrega otro
  monitor). Se imprime en el Acta como **"Activo Fijo Monitor:"** (mismo naming que "Activo Fijo:").
  Campo `codigoRam` (Código RAM adicional) se dejó intacto a propósito — se usa en la Tarjeta de
  Responsabilidad para laptops (columna "CODIGO RAM", vs "S/N MONITOR" en desktops).

### Historial por equipo (dentro del modal de editar equipo, debajo de "Dominio")
- **"Mantenimiento"**: botón con contador en vivo + modal con el historial completo de
  mantenimientos de ESE equipo (`registrosMantenimientoDeEquipo`, `abrirHistorialMantenimientoEquipo`),
  matcheado por `equipoRef === nombreRed`.
- **"Garantías Lenovo"**: igual pero para `ticketsGarantiaData` (`registrosGarantiaDeEquipo`,
  `abrirHistorialGarantiaEquipo`). **Importante**: el campo `tgEquipo` es texto libre (con
  datalist de sugerencia `dl-nombreRedEquipo` para GBM, `dl-impresorasSerialCatalogo` para
  Canella) — en la práctica varios tickets GBM se capturaron con el **numeroSerial** del equipo
  en vez del `nombreRed` (confirmado: ticket de PCLNV139 usa su serial `PF3G9HQX` como
  `equipoRef`). Por eso `registrosGarantiaDeEquipo` compara contra **ambos** valores
  (nombreRed y numeroSerial, case-insensitive). Si se agregan más lookups de tickets de
  garantía por equipo en el futuro, replicar esta doble comparación.
- Ambos historiales se mantienen **separados a propósito** (no combinados en un solo reporte),
  para llevar control independiente de mantenimiento interno vs. cobertura de garantía.

### Mantenimiento de Equipos (sección completa)
- Nuevo campo `fechaSalida` (opcional) — cuándo se completó el mantenimiento.
- La tabla de mantenimiento **oculta por defecto** los registros ya finalizados (con
  `fechaSalida`), mostrando solo los "en proceso". Botón "🗂️ Ver historial completo" alterna a
  mostrar todo (`mostrarHistorialMantenimientoCompleto`, `alternarHistorialMantenimiento`).
- El "Reporte por Técnico" ahora también lista los equipos atendidos por cada técnico (no solo
  el conteo), con fechas ingreso→salida o "en proceso" (`generarReporteMantenimiento`).
- **Auto-asignación de "Técnico GBM"**: si el equipo seleccionado es Lenovo (`fabricante`) y
  tiene un contrato de renta activo (`nonEmpty(equipo.contratos)` — mismo criterio que el filtro
  "equipos propios" de la vista Computadoras), el campo "Técnico que Revisó" se fuerza a
  "Técnico GBM" (no al técnico logueado), ya que por contrato de arrendamiento solo GBM puede
  darles mantenimiento. Esto aplica tanto a registros **nuevos** como al **reabrir/editar
  existentes** (para poder corregir capturas previas a esta regla con solo abrir+guardar).
  Función: `actualizarUsuarioEquipoMantenimiento`.
- Checklist de "Solución Aplicada" incluye ahora Batería y Cargador (Mantenimiento Correctivo).

### Tickets de Garantía
- Nuevo campo `fechaResolucion` + columna calculada "Días de Respuesta"
  (`diasRespuestaGarantia` = fechaResolucion − fechaReporte en días) en la tabla principal y en
  el historial por equipo.

### Otros
- Botón "PBI Acta" eliminado (duplicaba "Generar Acta", sin lógica propia, era solo para
  comparación puntual).

### Patrón para reportes/listas nuevas en esta app
Todas las secciones de lista siguen `crearVistaLista({prefix, columnas, obtenerFilas, filtrar,
alClicFila})` (ver `app.js`). Los historiales "por equipo" (mantenimiento, garantía) en cambio
son modales simples con tabla estática (no usan `crearVistaLista`, no necesitan paginación) que
se repueblan cada vez que se abren, matcheando por `nombreRed` (y a veces `numeroSerial`) del
equipo activo en el formulario.

### Stock Tóner Bodega 2 (antes "Contador de Impresoras" — pivote de diseño)
La sección nació como "Contador de Impresoras" (lecturas de contador de páginas con historial
por impresora), pero el usuario la reorientó completamente: ya no son lecturas en el tiempo,
sino un **inventario plano de stock de tóner** para poder atender al bodeguero de Bodega 2
cuando alguien pide un tóner (a veces solo sabe el nombre del Toner, a veces solo el Serial o
Modelo de su impresora). Nav-item: "🔢 Stock Tóner Bodega 2" (`vistaContadoresImpresoras`,
`crearVistaLista`, misma colección Firestore `contadoresImpresoras` / `contadores-impresoras-sync.js`
de antes, mismo patrón que `impresoras-sync.js` — **no** el de `mantenimiento-equipos-sync.js`,
que tiene un bug real de nombres, ver abajo).

**Encabezado final** (validado con el usuario contra su Excel real de bodega): `Toner | Serial |
Modelo | Color | Cantidad Impresoras | Stock Actual`. Una fila = una impresora (no una fila por
Tóner+Color como se consideró al inicio, ni una fila por lectura como en el diseño original).
Campos guardados: `toner`, `serial`, `modelo`, `color` (texto libre — hoy se llena con el `tipo`
de la impresora migrada: "B/N"/"Colores"; se puede refinar a mano a Negro/Cyan/Magenta/Amarillo
por fila si se necesita ese detalle), `stockActual` (el único dato que se captura/actualiza a
mano). **"Cantidad Impresoras" NO se guarda** — se calcula al vuelo en `obtenerContadoresImpresoras()`
contando cuántas filas comparten el mismo `toner` (normalizado sin mayúsculas/espacios), para que
nunca se desactualice.

Se **quitó** el botón "Contador / Insumos" + el modal de historial dentro de editar impresora
(`abrirModalImpresora`) — ya no aplican con el nuevo modelo (no hay "historial" que ver, es una
foto del stock actual).

**Botón "🔄 Migrar desde Impresoras"** (`migrarStockTonerDesdeImpresoras`): puebla/actualiza el
stock a partir de `impresorasData` (Toner=`gpr`, Serial=`serial`, Modelo=`modelo`, Color=`tipo`),
matcheando por Serial normalizado para no duplicar en corridas repetidas — al re-ejecutar solo
actualiza Toner/Modelo/Color de lo que ya existía, **nunca pisa el Stock Actual** ya capturado a
mano. Excluye (a pedido explícito del usuario, por decisión de negocio, no por error de datos):
impresoras cuyo `tipo` o `tipoEquipoImp` contenga "plotter", y las que tengan `ubicacion` que
**contenga** (no que sea exactamente igual a) "Riolsa", "San Fernando" o "Km 98" — constantes
`impresoraDebeExcluirseDeStockToner`/`UBICACIONES_EXCLUIDAS_STOCK_TONER`.

**"Flor del Campo" se quitó de la lista de exclusión**: originalmente estaba excluida junto con
Riolsa/San Fernando/Km 98, pero el usuario averiguó que esa impresora es de **Inmobiliaria** y sí
debe llevar control de Stock Tóner como las demás. Al quitarla de `UBICACIONES_EXCLUIDAS_STOCK_TONER`,
cualquier impresora en esa ubicación entra a la migración (no solo la puntual que se mencionó) —
el total esperado después de re-ejecutar "Migrar desde Impresoras" sube de 61 a 62.

**Bug real ya corregido**: la primera versión comparaba `ubicacion` por **igualdad exacta**
(`===` sobre el valor normalizado) — con 69 impresoras y 8 a excluir (2 Plotters, 1 Km 98, 1
Flor del Campo, 3 San Fernando, 1 Riolsa) solo se excluyeron 7, dejando pasar 62 en vez de 61
(el usuario detectó la discrepancia comparando el total de su catálogo contra lo migrado). Causa:
alguna `ubicacion` real trae texto adicional al nombre exacto (ej. "Riolsa - Planta 1"), así que
la igualdad exacta no la reconocía como excluida. Fix: comparación por "contiene"
(`ubicacion.includes(u)`) en vez de igualdad, y también se revisa `tipoEquipoImp` (no solo
`tipo`) para detectar Plotters. Además, re-ejecutar la migración ahora también **limpia**
cualquier registro que ya se hubiera migrado por error y que con este criterio sí debería
excluirse (antes la migración solo agregaba/actualizaba, nunca quitaba).

**Pendiente/sin resolver, señalado al usuario pero no implementado**: el buscador del catálogo de
"Impresoras" (`vistaCatalogoImpresoras`) no busca por el campo Tóner (`gpr`) — si el bodeguero
escribe el nombre del tóner ahí, no encuentra nada; solo busca IP/serial/modelo/departamento/
ubicación/empresa/tipo. Sin este fix, resolver "el usuario solo me dio el nombre del Tóner" sigue
necesitando ir directo a "Stock Tóner Bodega 2" (que sí busca por Toner) en vez de por Impresoras.

### Compatibilidad de Tóner por impresora y Salidas de Tóner

- **Agrupado por # de Tóner base**: cuando 2+ impresoras a color comparten el mismo # de Tóner
  (ej. "16"), antes el Resumen por Tóner mostraba 4 filas repetidas (una por color) por cada
  impresora, así que "Cantidad Impresoras" nunca cuadraba con el total real (61). Fix:
  `tonerBaseYColor(toner)` separa el texto en `{ base, color }` quitando el sufijo " - COLOR";
  `renderResumenToner()` ahora agrupa por ese `base` y cuenta **Seriales únicos** (no filas), así
  la suma del Resumen siempre da 61 sin importar cuántos colores tenga cada Tóner.
- **Modal "Impresoras con Tóner"** (`abrirModalImpresorasPorToner`): para un Tóner a color muestra
  4 casillas fijas N/C/M/Y con su Stock editable (uno compartido por color, no por impresora) y
  abajo la lista de impresoras compatibles (Serial/Modelo, deduplicadas por Serial). Para un Tóner
  B/N compartido por varias impresoras (ej. GPR39 con 6), el mismo problema existía en su versión
  simple: el Stock se mostraba repetido en cada fila de impresora, dando a entender que cada una
  tenía su propio stock. Fix: también se muestra en **una sola casilla** arriba (sin las 4
  letras, solo el nombre del Tóner) y la tabla de abajo queda sin columna de Stock.
- **Salidas de Tóner** (nueva sub-sección dentro de "Stock Tóner Bodega 2", colección Firestore
  `salidasToner`, `salidas-toner-sync.js` con el mismo patrón anti-resurrección que
  `contadores-impresoras-sync.js`): formulario para registrar vales de salida (No. Vale, Serial,
  Modelo/Ubicación autocompletados de solo lectura desde el catálogo de Impresoras — la Ubicación
  es dónde está esa impresora, NO de dónde se sacó el tóner en bodega —, Toner con desplegable
  filtrado a las variantes compatibles con ese Serial mostrando su stock, Cantidad, Fecha). Al
  guardar, `ajustarStockToner(tonerTexto, delta)` rebaja automático esa cantidad del Stock Actual
  exacto de ese Tóner/color (mismo mecanismo que usa `actualizarStockDeToner`). Clic en una fila
  del historial abre un modal de edición/eliminación: al editar se **revierte** el efecto anterior
  sobre el stock (aunque haya cambiado de Toner/color) antes de aplicar los datos corregidos; al
  eliminar se devuelve la cantidad al Stock, como si la salida nunca hubiera pasado. Requiere la
  regla de Firestore estándar en la colección `salidasToner`:
  `match /salidasToner/{salidaId} { allow read, write: if request.auth != null; }`.
- **Reporte de auditoría** (`descargarReporteStockToner`, botón "📄 Descargar reporte PDF"): arma
  un `<div>` fuera de pantalla con la tabla de Stock Actual (agrupado igual que el Resumen) +
  Ingresos y Salidas filtrados por un rango de fechas (`repTonerDesde`/`repTonerHasta`, ambos
  opcionales), y lo descarga con `html2pdf()` — mismo patrón que `descargarReporteMantenimientoPDF`.
- **"Stock por Tóner" es de solo lectura de punta a punta** (tabla resumen y el modal de detalle
  al hacer clic en una fila): no hay ningún `<input>` de Stock ahí, solo `<span>` de consulta —
  a pedido explícito del usuario para reducir el margen de error de los bodegueros. Editar el
  Stock Actual a mano solo es posible desde "🔎 Detalle completo". El ajuste real de Stock pasa
  siempre por Salidas/Ingreso de Tóner (automático) o por "Detalle completo" (manual).

### Ingreso de Tóner (entregas de Canella, complementa a Salidas de Tóner)

- **Un Ingreso = un documento con varias líneas**, a diferencia de una Salida (que es 1 vale = 1
  Toner = 1 impresora). El proveedor (Canella, fijo, campo deshabilitado en el formulario) suele
  entregar variado en una misma caja (tintas y tóners distintos), así que cada registro de
  Ingreso guarda `{ fecha, documento, lineas: [{ toner, cantidad }], archivoNombre?, archivoUrl? }`
  en la colección Firestore `ingresosToner` (`ingresos-toner-sync.js`, mismo patrón
  anti-resurrección que `salidas-toner-sync.js`). El No. de Documento es el que trae la propia
  caja de Canella (**no** hay factura ni costo — son insumos de impresoras en renta corporativa,
  sin valor monetario para el sistema).
- **El formulario muestra TODOS los Toners exactos que existen hoy** (uno por texto completo,
  incluyendo color — ej. "16 - NEGRO" y "16 - AMARILLO" por separado, igual que hace el
  desplegable de Salidas — **no** agrupado por base como el Resumen), cada uno con su Stock
  Actual de referencia y un input de "Cantidad Recibida" vacío. El bodeguero solo llena los que
  de verdad llegaron; al guardar, cada línea con cantidad > 0 SUMA (vía `ajustarStockToner(toner,
  +cantidad)`, la misma función que usa Salidas con delta negativo) a su Stock Actual — nunca lo
  reemplaza.
- **Sin adjuntar documento escaneado**: se consideró subir la foto/escaneo del documento de
  Canella a Firebase Storage, pero **el proyecto está en plan Spark (gratis) y Storage requiere
  plan Blaze** (pago por uso, aunque con capa gratuita) — Firebase ni siquiera deja entrar a
  Storage → Rules en Spark. El usuario decidió no actualizar a Blaze por ahora, así que se quitó
  el campo de archivo del formulario (`ingresos-toner-sync.js` no importa `firebase-storage.js`
  ni expone `subirDocumentoIngreso`). Si en el futuro se actualiza a Blaze, este es el punto para
  retomarlo, agregando de nuevo el campo de archivo + la regla de Storage:
  `match /ingresosToner/{ingresoId}/{archivo} { allow read, write: if request.auth != null; }`.
- **Solo se puede editar un Ingreso, nunca eliminar** (decisión explícita del usuario, distinto a
  Salidas que sí permite eliminar). Al editar se revierte el efecto de las líneas anteriores
  (`ajustarStockToner(toner, -cantidadAnterior)`) antes de aplicar las corregidas, igual que hace
  Salidas al editar — así el Stock nunca queda descuadrado aunque se cambie el Toner o la
  cantidad de una línea ya guardada.
- Se agregó al reporte PDF de auditoría (`descargarReporteStockToner`) una tabla "Ingresos
  (Canella)" entre Stock Actual y Salidas, filtrada por el mismo rango de fechas.
- **Pendiente de validar con el jefe de bodegueros**: si el botón "🔄 Migrar desde Impresoras"
  (dentro de "Stock Tóner Bodega 2" → Detalle completo) sigue siendo útil o se puede quitar. Es
  inofensivo si le dan clic sin querer (pide confirmación antes de aplicar, nunca pisa el Stock
  Actual capturado a mano, es seguro correrlo repetidas veces) — se decidió dejarlo por ahora.
- **Pantalla propia, separada de "Stock Tóner Bodega 2"**: al principio se puso como
  sub-sección dentro de "Stock Tóner Bodega 2" (junto a Salidas), pero el usuario pidió
  sacarla a su propia vista/nav-item — `data-vista="ingresoToner"`, sección
  `#vista-ingresoToner` — **para no confundir al bodeguero** mezclando ingresos con
  stock/salidas en una sola pantalla. Nav-item: "📥 Ingreso Tóner Bodega" (sin el "2" — a pedido
  del usuario, el nombre se acortó después de crear la vista), justo debajo de
  "🔢 Stock Tóner Bodega 2". El Rol "Bodeguero" (ver abajo) se actualizó para mostrar ambas
  vistas (`VISTAS_PERMITIDAS_BODEGA = ["contadoresImpresoras", "ingresoToner"]`), no solo una.

### Rol "Bodeguero" (solo interfaz, no seguridad de base de datos)

Se agregó una restricción de menú para el usuario de Bodega 2 (`bodega2@liztex.com`, hay que
crearlo en Firebase → Authentication → Users como cualquier otro técnico): `EMAILS_BODEGA` en
`app.js` + `window.aplicarRestriccionesPorRol(correo)`, llamada desde `auth.js` en
`onAuthStateChanged` (con el correo al iniciar sesión, con `""` al cerrar sesión para restaurar
el menú completo para el siguiente login). Si el correo está en esa lista: oculta todos los
`.nav-item` salvo los de `VISTAS_PERMITIDAS_BODEGA` (`contadoresImpresoras` e `ingresoToner`) y
fuerza `cambiarVista("contadoresImpresoras")` para que entre directo a Stock Tóner Bodega 2 (con
Ingreso Tóner Bodega también visible en el menú, como pantalla aparte).

**Importante — esto es SOLO de interfaz, no seguridad real**: las reglas de Firestore no cambiaron
(`allow read, write: if request.auth != null;` sigue aplicando igual a todas las colecciones para
cualquier usuario autenticado). El usuario de bodega técnicamente sigue teniendo acceso de
lectura/escritura a `equipos`, `impresoras`, etc. a nivel de base de datos — solo la interfaz no
se lo muestra. Se decidió así a propósito (el usuario ya conoce personalmente a la persona de
bodega, el objetivo era simplificar lo que ve, no blindar contra alguien con conocimientos
técnicos). Si en el futuro se necesita un bloqueo real, hay que crear un sistema de roles
(ej. colección `usuarios/{uid}` con un campo `rol`) y condicionar las reglas de Firestore de cada
colección por ese rol — más trabajo y más riesgo de bloquear sin querer al equipo de IT si algo
queda mal, por eso no se hizo en esta tarea.

**Bug real encontrado (no corregido, no era parte de esta tarea) en `mantenimiento-equipos-sync.js`**:
la función en `app.js` que aplica los cambios remotos se llama `establecerMantenimientoEquiposDesdeSync`,
pero el sync file llama a `window.establecerRegistrosMantenimientoDesdeSync` (nombre distinto) —
esa función global nunca existe, así que el `onSnapshot` de Mantenimiento de Equipos nunca aplica
los cambios remotos al estado local (los guarda bien en Firestore, pero no se refrescan solos en
otras computadoras; hay que recargar la página). El patrón correcto (el que si usa `contadores-impresoras-sync.js`
y `impresoras-sync.js`) es que los nombres de función en `app.js` coincidan exactamente con los
que el `-sync.js` busca en `window`. Si se retoma este bug, comparar contra
`obtenerImpresorasActuales`/`establecerImpresorasDesdeSync` como referencia de lo correcto.
