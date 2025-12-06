/**
 * Sistema de Sincronización para Conciliación Bancaria (ETL Remoto)
 * 
 * Este script respeta los formatos exactos del archivo origen para evitar
 * problemas de compatibilidad y match.
 * 
 * ESTRUCTURA DE HOJAS:
 * - Conciliacion_Transferencias: Pagos por transferencia (conciliación 1:1 con banco)
 * - Conciliacion_Tarjetas: Pagos con tarjeta (conciliación por lote)
 * - Cierres_Lotes: Registro de cierres de terminal
 * - 📝 Bitácora_Cambios: Historial de cambios detectados
 * 
 * CONFIGURACIÓN:
 * - ID_ARCHIVO_ORIGEN: ID del archivo Google Sheets de Operaciones Lavasmart
 * - ID_ARCHIVO_DESTINO: ID del archivo donde se guardan los registros
 * - DIAS_LOOKBACK: Días hacia atrás para buscar registros (default: 10)
 */

// ==================== CONFIGURACIÓN ====================
const ID_ARCHIVO_ORIGEN = '10_jpvm53Jn3zo0px5_wCs8Nf2YwmRpPR-CPfHC21KQs';
const ID_ARCHIVO_DESTINO = '13JwPsTMdhkeRwcYsaf99t7QMvRApU-31YIrTVL7UQGo';
const DIAS_LOOKBACK = 10; // Aumentado de 5 a 10 para cubrir fines de semana largos

// Nombres de hojas
const NOMBRE_HOJA_TRANSFERENCIAS = 'Conciliacion_Transferencias';
const NOMBRE_HOJA_TARJETAS = 'Conciliacion_Tarjetas';
const NOMBRE_HOJA_CIERRES = 'Cierres_Lotes';
const NOMBRE_HOJA_BITACORA = '📝 Bitácora_Cambios';
const NOMBRE_HOJA_REVISION = '⚠️ Revisión_Pendiente';

// Nombre antiguo de la hoja (para migración)
const NOMBRE_HOJA_ANTIGUA = 'Conciliacion_Bancaria';

// Índices de columnas ORIGEN (base-0)
const COL_ORIGEN_FOLIO = 1; // Columna B
const COL_ORIGEN_FECHA = 2; // Columna C
const COL_ORIGEN_CLIENTE = 3; // Columna D
const COL_ORIGEN_SERVICIO = 28; // Columna AC
const COL_ORIGEN_BANCO = 18; // Columna S
const COL_ORIGEN_COSTO_TOTAL = 9; // Columna J
const COL_ORIGEN_METODO_PAGO = 16; // Columna Q

// ==================== FUNCIONES DE DRIVE ====================

// Cache para URLs de carpetas (evita búsquedas repetidas)
const carpetasCache = new Map();

/**
 * Busca una carpeta en Google Drive por nombre exacto
 * @param {string} nombreCarpeta - Nombre de la carpeta a buscar
 * @return {string|null} URL de la carpeta o null si no se encuentra
 */
function buscarCarpetaEnDrive(nombreCarpeta) {
  if (!nombreCarpeta) return null;
  
  // Verificar cache primero
  if (carpetasCache.has(nombreCarpeta)) {
    return carpetasCache.get(nombreCarpeta);
  }
  
  try {
    // Buscar carpetas con el nombre exacto
    const carpetas = DriveApp.getFoldersByName(nombreCarpeta);
    
    if (carpetas.hasNext()) {
      const carpeta = carpetas.next();
      const url = carpeta.getUrl();
      carpetasCache.set(nombreCarpeta, url);
      return url;
    }
  } catch (e) {
    console.log(`Error buscando carpeta "${nombreCarpeta}":`, e);
  }
  
  // Guardar null en cache para evitar búsquedas repetidas
  carpetasCache.set(nombreCarpeta, null);
  return null;
}

/**
 * Crea un RichTextValue con hipervínculo para el folio
 * @param {string} folio - Número de folio
 * @param {string} url - URL de la carpeta
 * @return {RichTextValue} Texto enriquecido con hipervínculo
 */
function crearHipervínculoFolio(folio, url) {
  if (!url) {
    // Sin URL, retornar texto plano
    return SpreadsheetApp.newRichTextValue()
      .setText(folio)
      .build();
  }
  
  // Con URL, crear hipervínculo
  return SpreadsheetApp.newRichTextValue()
    .setText(folio)
    .setLinkUrl(0, folio.length, url)
    .build();
}

/**
 * Aplica hipervínculos a los folios en un rango de celdas
 * @param {Sheet} hoja - Hoja donde aplicar
 * @param {number} filaInicio - Fila inicial
 * @param {number} columnaFolio - Columna del folio
 * @param {Array} folios - Array de folios
 */
function aplicarHipervínculosFolios(hoja, filaInicio, columnaFolio, folios) {
  for (let i = 0; i < folios.length; i++) {
    const folio = folios[i];
    const url = buscarCarpetaEnDrive(folio);
    const richText = crearHipervínculoFolio(folio, url);
    hoja.getRange(filaInicio + i, columnaFolio).setRichTextValue(richText);
  }
}

// ==================== FUNCIONES DE FORMATO ====================

/**
 * Parsea una fecha desde el formato del archivo origen (d/M/yyyy)
 */
function parsearFecha(fechaValue) {
  if (!fechaValue) return null;
  
  if (fechaValue instanceof Date) {
    return fechaValue;
  }
  
  if (typeof fechaValue === 'string') {
    const partes = fechaValue.trim().split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const año = parseInt(partes[2], 10);
      
      if (!isNaN(dia) && !isNaN(mes) && !isNaN(año)) {
        return new Date(año, mes, dia);
      }
    }
  }
  
  try {
    const fecha = new Date(fechaValue);
    if (!isNaN(fecha.getTime())) {
      return fecha;
    }
  } catch (e) {
    console.log('Error parseando fecha:', fechaValue, e);
  }
  
  return null;
}

/**
 * Limpia y convierte un monto de formato de moneda a número
 */
function parsearMonto(montoValue) {
  if (typeof montoValue === 'number') {
    return montoValue;
  }
  
  if (typeof montoValue !== 'string') {
    return 0;
  }
  
  let montoLimpio = montoValue
    .replace(/\$/g, '')
    .replace(/"/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  
  const montoNumero = parseFloat(montoLimpio);
  return isNaN(montoNumero) ? 0 : montoNumero;
}

/**
 * Limpia un string preservando su contenido exacto
 */
function limpiarString(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  
  let str = String(valor);
  
  if (str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }
  
  return str.trim();
}

/**
 * Compara dos montos con tolerancia para decimales
 */
function compararMontos(monto1, monto2) {
  const tolerancia = 0.01;
  return Math.abs(monto1 - monto2) < tolerancia;
}

/**
 * Compara dos fechas (solo día, mes, año)
 */
function compararFechas(fecha1, fecha2) {
  if (!fecha1 && !fecha2) return true;
  if (!fecha1 || !fecha2) return false;
  
  return fecha1.getFullYear() === fecha2.getFullYear() &&
         fecha1.getMonth() === fecha2.getMonth() &&
         fecha1.getDate() === fecha2.getDate();
}

/**
 * Formatea una fecha al formato d/M/yyyy
 */
function formatearFecha(fecha) {
  if (!fecha || !(fecha instanceof Date)) {
    return '';
  }
  
  const dia = fecha.getDate();
  const mes = fecha.getMonth() + 1;
  const año = fecha.getFullYear();
  
  return `${dia}/${mes}/${año}`;
}

/**
 * Obtiene el nombre de la pestaña según el mes de la fecha
 */
function obtenerNombrePestana(fecha) {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return meses[fecha.getMonth()];
}

// ==================== FUNCIONES DE HOJAS ====================

/**
 * Migra la hoja antigua "Conciliacion_Bancaria" a "Conciliacion_Transferencias"
 */
function migrarHojaAntigua(ss) {
  const hojaAntigua = ss.getSheetByName(NOMBRE_HOJA_ANTIGUA);
  
  if (hojaAntigua) {
    console.log(`Migrando hoja "${NOMBRE_HOJA_ANTIGUA}" a "${NOMBRE_HOJA_TRANSFERENCIAS}"...`);
    hojaAntigua.setName(NOMBRE_HOJA_TRANSFERENCIAS);
    console.log('Migración de nombre completada');
    return hojaAntigua;
  }
  
  return null;
}

/**
 * Verifica y agrega encabezados si faltan en una hoja de transferencias
 */
function verificarEncabezadosTransferencias(hoja) {
  const primeraFila = hoja.getRange(1, 1, 1, 9).getValues()[0];
  const primerValor = String(primeraFila[0] || '').toLowerCase();
  
  // Si la primera celda no parece ser un encabezado, insertar fila de encabezados
  if (primerValor !== 'fecha' && !primerValor.includes('fecha')) {
    console.log('Insertando encabezados faltantes en hoja de transferencias...');
    hoja.insertRowBefore(1);
    hoja.getRange(1, 1, 1, 9).setValues([[
      'Fecha', 'Folio', 'Cliente', 'Servicio (s)', 'Banco', 'Monto',
      '✅ Conciliado', '💳 Concepto Banco', '🔍 Observaciones'
    ]]);
      
      // Formatear encabezados
    const headerRange = hoja.getRange(1, 1, 1, 9);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');
    hoja.getRange(1, 7, 1, 3).setBackground('#fff2cc');
    
    console.log('Encabezados agregados');
  }
}

/**
 * Obtiene o crea la hoja de Transferencias
 */
function obtenerOCrearHojaTransferencias(ss) {
  // Primero intentar migrar la hoja antigua
  let hoja = migrarHojaAntigua(ss);
  
  if (!hoja) {
    hoja = ss.getSheetByName(NOMBRE_HOJA_TRANSFERENCIAS);
  }
  
  if (!hoja) {
    console.log(`Creando hoja "${NOMBRE_HOJA_TRANSFERENCIAS}"...`);
    hoja = ss.insertSheet(NOMBRE_HOJA_TRANSFERENCIAS);
    
    // Encabezados para transferencias
    hoja.appendRow([
      'Fecha',           // A - Script
      'Folio',           // B - Script
      'Cliente',         // C - Script
      'Servicio (s)',    // D - Script
      'Banco',           // E - Script
      'Monto',           // F - Script
      '✅ Conciliado',    // G - Manual
      '💳 Concepto Banco', // H - Manual
      '🔍 Observaciones'  // I - Manual
      ]);
      
      // Formatear encabezados
    const headerRange = hoja.getRange(1, 1, 1, 9);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');
      
    // Zona protegida
    hoja.getRange(1, 7, 1, 3).setBackground('#fff2cc');
    
    console.log(`Hoja "${NOMBRE_HOJA_TRANSFERENCIAS}" creada`);
    } else {
    // Verificar que tenga encabezados
    verificarEncabezadosTransferencias(hoja);
  }
  
  return hoja;
}

/**
 * Verifica y agrega encabezados si faltan en una hoja de tarjetas
 */
function verificarEncabezadosTarjetas(hoja) {
  const primeraFila = hoja.getRange(1, 1, 1, 9).getValues()[0];
  const primerValor = String(primeraFila[0] || '').toLowerCase();
  
  // Si la primera celda no parece ser un encabezado, insertar fila de encabezados
  if (primerValor !== 'fecha' && !primerValor.includes('fecha')) {
    console.log('Insertando encabezados faltantes en hoja de tarjetas...');
    hoja.insertRowBefore(1);
    hoja.getRange(1, 1, 1, 9).setValues([[
      'Fecha', 'Folio', 'Cliente', 'Servicio (s)', 'Monto',
      '🧾 Recibo', 'Afiliación', '📦 # Lote', '🔍 Observaciones'
    ]]);
    
    // Formatear encabezados
    const headerRange = hoja.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    hoja.getRange(1, 6, 1, 4).setBackground('#e6f3ff'); // Zona protegida F-I
    
    console.log('Encabezados agregados');
  }
}

/**
 * Obtiene o crea la hoja de Tarjetas
 */
function obtenerOCrearHojaTarjetas(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_TARJETAS);
  
  if (!hoja) {
    console.log(`Creando hoja "${NOMBRE_HOJA_TARJETAS}"...`);
    hoja = ss.insertSheet(NOMBRE_HOJA_TARJETAS);
    
    // Encabezados para tarjetas (9 columnas incluyendo Afiliación)
    hoja.appendRow([
      'Fecha',           // A - Script
      'Folio',           // B - Script
      'Cliente',         // C - Script
      'Servicio (s)',    // D - Script
      'Monto',           // E - Script
      '🧾 Recibo',        // F - Manual (checkbox)
      'Afiliación',      // G - Manual (número de afiliación terminal)
      '📦 # Lote',        // H - Manual
      '🔍 Observaciones'  // I - Manual
    ]);
    
    // Formatear encabezados
    const headerRange = hoja.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
    
    // Zona protegida (F, G, H, I)
    hoja.getRange(1, 6, 1, 4).setBackground('#e6f3ff'); // Azul claro para diferenciar
    
    console.log(`Hoja "${NOMBRE_HOJA_TARJETAS}" creada`);
  } else {
    // Verificar que tenga encabezados
    verificarEncabezadosTarjetas(hoja);
  }
  
  return hoja;
}

/**
 * Obtiene o crea la hoja de Cierres de Lotes
 */
function obtenerOCrearHojaCierres(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_CIERRES);
  
  if (!hoja) {
    console.log(`Creando hoja "${NOMBRE_HOJA_CIERRES}"...`);
    hoja = ss.insertSheet(NOMBRE_HOJA_CIERRES);
    
    // Encabezados
    hoja.appendRow([
      'Fecha',           // A - Manual
      '# Lote',          // B - Manual
      'Total Cierre',    // C - Manual (del ticket)
      'Total Folios',    // D - Fórmula
      '✅ Cuadra',        // E - Fórmula
      '💰 Depositado',    // F - Manual
      '🔍 Observaciones'  // G - Manual
    ]);
        
        // Formatear encabezados
    const headerRange = hoja.getRange(1, 1, 1, 7);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f0f0f0');
        
    // Agregar fila de ejemplo con fórmulas
    // Nota: # Lote está en columna H de Tarjetas (después de Afiliación en G)
    hoja.getRange(2, 1).setValue(new Date());
    hoja.getRange(2, 2).setValue('EJEMPLO-001');
    hoja.getRange(2, 3).setValue(0);
    hoja.getRange(2, 4).setFormula(`=SUMIF('${NOMBRE_HOJA_TARJETAS}'!H:H,B2,'${NOMBRE_HOJA_TARJETAS}'!E:E)`);
    hoja.getRange(2, 5).setFormula('=IF(C2=D2,"✅","❌")');
    hoja.getRange(2, 6).setValue(false);
    hoja.getRange(2, 7).setValue('← Fila de ejemplo, puedes borrarla');
    
    // Formatear columnas
    hoja.getRange(2, 1).setNumberFormat('d/M/yyyy');
    hoja.getRange(2, 3).setNumberFormat('$#,##0.00');
    hoja.getRange(2, 4).setNumberFormat('$#,##0.00');
    
    // Colorear columnas de fórmulas
    hoja.getRange(1, 4, 1, 2).setBackground('#d9ead3'); // Verde claro
    
    console.log(`Hoja "${NOMBRE_HOJA_CIERRES}" creada con fórmulas de ejemplo`);
  } else {
    // Hoja existe: verificar y actualizar fórmulas que apuntan a columna incorrecta
    actualizarFormulasCierresLotes(hoja);
  }
  
  return hoja;
}

/**
 * Actualiza las fórmulas en Cierres_Lotes para apuntar a la columna correcta
 * Esto corrige fórmulas antiguas que apuntaban a G:G cuando # Lote estaba en columna G
 */
function actualizarFormulasCierresLotes(hoja) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return; // Solo encabezados o vacía
  
  let formulasActualizadas = 0;
  const formulaCorrecta = `=SUMIF('${NOMBRE_HOJA_TARJETAS}'!H:H,B`;
  const formulaIncorrecta = `'${NOMBRE_HOJA_TARJETAS}'!G:G`;
  
  // Revisar columna D (Total Folios) desde fila 2
  for (let fila = 2; fila <= ultimaFila; fila++) {
    const celda = hoja.getRange(fila, 4); // Columna D
    const formula = celda.getFormula();
    
    if (formula && formula.includes(formulaIncorrecta)) {
      // Actualizar fórmula para apuntar a columna H en lugar de G
      const nuevaFormula = `=SUMIF('${NOMBRE_HOJA_TARJETAS}'!H:H,B${fila},'${NOMBRE_HOJA_TARJETAS}'!E:E)`;
      celda.setFormula(nuevaFormula);
      formulasActualizadas++;
    }
  }
  
  if (formulasActualizadas > 0) {
    console.log(`Cierres_Lotes: ${formulasActualizadas} fórmulas actualizadas (G:G → H:H)`);
  }
}

/**
 * Obtiene o crea la hoja de bitácora
 */
function obtenerOCrearBitacora(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_BITACORA);
  
  if (!hoja) {
    hoja = ss.insertSheet(NOMBRE_HOJA_BITACORA);
    hoja.appendRow([
      'Timestamp',
      'Folio',
      'Acción',
      'Detalle',
      'Valores Anteriores',
      'Valores Nuevos'
    ]);
    
    const headerRange = hoja.getRange(1, 1, 1, 6);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
  }
  
  return hoja;
}

/**
 * Obtiene o crea la hoja de revisión pendiente
 */
function obtenerOCrearHojaRevision(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_REVISION);
  
  if (!hoja) {
    hoja = ss.insertSheet(NOMBRE_HOJA_REVISION);
    hoja.appendRow([
      'Timestamp',           // A - Cuándo se detectó
      'Folio',               // B - Identificador
      'Conflicto',           // C - Tipo de conflicto
      'Hoja Origen',         // D - De dónde venía
      'Hoja Destino',        // E - A dónde debería ir
      'Fecha',               // F - Fecha del registro
      'Cliente',             // G - Cliente
      'Servicio',            // H - Servicio
      'Monto',               // I - Monto
      'Banco',               // J - Banco (si aplica)
      '¿Conciliado?',        // K - Estaba conciliado
      'Concepto Banco',      // L - Concepto que tenía
      'Observaciones',       // M - Observaciones que tenía
      'Estado'               // N - Pendiente/Resuelto
    ]);
    
    const headerRange = hoja.getRange(1, 1, 1, 14);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#ffcccc'); // Rojo claro para llamar atención
    
    // Ajustar anchos de columna
    hoja.setColumnWidth(3, 200); // Conflicto
    hoja.setColumnWidth(12, 150); // Concepto Banco
    hoja.setColumnWidth(13, 200); // Observaciones
  }
  
  return hoja;
}

// ==================== FUNCIÓN PRINCIPAL ====================

/**
 * Función principal de sincronización
 */
function sincronizarConciliacion() {
  try {
    const ssDestino = SpreadsheetApp.openById(ID_ARCHIVO_DESTINO);
    
    // Obtener o crear todas las hojas necesarias
    const hojaTransferencias = obtenerOCrearHojaTransferencias(ssDestino);
    const hojaTarjetas = obtenerOCrearHojaTarjetas(ssDestino);
    obtenerOCrearHojaCierres(ssDestino); // Solo crear si no existe
    
    const ssOrigen = SpreadsheetApp.openById(ID_ARCHIVO_ORIGEN);
    if (!ssOrigen) {
      throw new Error('No se pudo abrir el archivo origen');
    }
    
    // Configurar rango de fechas
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaInicio = new Date(hoy);
    fechaInicio.setDate(fechaInicio.getDate() - DIAS_LOOKBACK);
    
    console.log(`Buscando registros desde: ${formatearFecha(fechaInicio)} hasta: ${formatearFecha(hoy)}`);
    
    // Construir mapas de folios existentes en ambas hojas
    const foliosTransferencias = construirMapaFolios(hojaTransferencias, 'TRANSFERENCIA');
    const foliosTarjetas = construirMapaFolios(hojaTarjetas, 'TARJETA');
    
    // Arrays para acumular registros
    const nuevosTransferencias = [];
    const nuevosTarjetas = [];
    const actualizadosTransferencias = [];
    const actualizadosTarjetas = [];
    const movimientosEntreHojas = []; // Para cambios de método de pago
    
    // Procesar cada día del rango
    for (let d = 0; d <= DIAS_LOOKBACK; d++) {
      const fechaBusqueda = new Date(fechaInicio);
      fechaBusqueda.setDate(fechaBusqueda.getDate() + d);
      
      const nombrePestana = obtenerNombrePestana(fechaBusqueda);
      let hojaOrigen;
      
      try {
        hojaOrigen = ssOrigen.getSheetByName(nombrePestana);
      } catch (e) {
        continue;
      }
      
      if (!hojaOrigen) continue;
      
      const datosOrigen = hojaOrigen.getDataRange().getValues();
      
      for (let i = 1; i < datosOrigen.length; i++) {
        const fila = datosOrigen[i];
        
        // Determinar método de pago
        const metodoPagoRaw = String(fila[COL_ORIGEN_METODO_PAGO] || '').toUpperCase();
        const esTransferencia = metodoPagoRaw.includes('TRANSFERENCIA');
        const esTarjeta = metodoPagoRaw.includes('TARJETA');
        
        if (!esTransferencia && !esTarjeta) continue;
        
        const metodoPago = esTransferencia ? 'TRANSFERENCIA' : 'TARJETA';
        
        // Parsear fecha
        const fechaVenta = parsearFecha(fila[COL_ORIGEN_FECHA]);
        if (!fechaVenta) continue;
        
        const fechaVentaSolo = new Date(fechaVenta.getFullYear(), fechaVenta.getMonth(), fechaVenta.getDate());
        if (fechaVentaSolo < fechaInicio || fechaVentaSolo > hoy) continue;
        
        // Extraer datos
        const folio = limpiarString(fila[COL_ORIGEN_FOLIO]);
        const cliente = limpiarString(fila[COL_ORIGEN_CLIENTE]);
        const servicio = limpiarString(fila[COL_ORIGEN_SERVICIO]);
        const banco = limpiarString(fila[COL_ORIGEN_BANCO]);
        const monto = parsearMonto(fila[COL_ORIGEN_COSTO_TOTAL]);
        
        if (!folio) continue;
        
        // Buscar en ambas hojas
        const existeEnTransferencias = foliosTransferencias.get(folio);
        const existeEnTarjetas = foliosTarjetas.get(folio);
        
        if (metodoPago === 'TRANSFERENCIA') {
          if (existeEnTarjetas && existeEnTarjetas.rowIndex > 0) {
            // CAMBIÓ de Tarjeta a Transferencia - mover (solo si tiene rowIndex válido)
            movimientosEntreHojas.push({
              tipo: 'TARJETA_A_TRANSFERENCIA',
            folio: folio,
              rowIndexOrigen: existeEnTarjetas.rowIndex,
            fecha: fechaVenta,
            cliente: cliente,
            servicio: servicio,
            banco: banco,
            monto: monto
          });
            foliosTarjetas.delete(folio);
          } else if (existeEnTransferencias && existeEnTransferencias.rowIndex > 0) {
            // Ya existe en transferencias con rowIndex válido - verificar cambios
            const cambios = detectarCambios(existeEnTransferencias, {
              fecha: fechaVenta, cliente, servicio, banco, monto
            });
            if (cambios.hayCambios) {
              actualizadosTransferencias.push({
                rowIndex: existeEnTransferencias.rowIndex,
                folio, fecha: fechaVenta, cliente, servicio, banco, monto,
                cambios: cambios
              });
            }
          } else if (!existeEnTransferencias) {
            // Nuevo registro
            nuevosTransferencias.push({ fecha: fechaVenta, folio, cliente, servicio, banco, monto });
            foliosTransferencias.set(folio, { rowIndex: -1 });
          }
        } else { // TARJETA
          if (existeEnTransferencias && existeEnTransferencias.rowIndex > 0) {
            // CAMBIÓ de Transferencia a Tarjeta - mover (solo si tiene rowIndex válido)
            movimientosEntreHojas.push({
              tipo: 'TRANSFERENCIA_A_TARJETA',
              folio: folio,
              rowIndexOrigen: existeEnTransferencias.rowIndex,
              fecha: fechaVenta,
              cliente: cliente,
              servicio: servicio,
              monto: monto
            });
            foliosTransferencias.delete(folio);
          } else if (existeEnTarjetas && existeEnTarjetas.rowIndex > 0) {
            // Ya existe en tarjetas con rowIndex válido - verificar cambios
            const cambios = detectarCambiosTarjetas(existeEnTarjetas, {
              fecha: fechaVenta, cliente, servicio, monto
            });
            if (cambios.hayCambios) {
              actualizadosTarjetas.push({
                rowIndex: existeEnTarjetas.rowIndex,
                folio, fecha: fechaVenta, cliente, servicio, monto,
                cambios: cambios
              });
            }
          } else if (!existeEnTarjetas) {
            // Nuevo registro
            nuevosTarjetas.push({ fecha: fechaVenta, folio, cliente, servicio, monto });
            foliosTarjetas.set(folio, { rowIndex: -1 });
          }
        }
      }
    }
    
    // Aplicar cambios a las hojas
    const hojaBitacora = obtenerOCrearBitacora(ssDestino);
    const hojaRevision = obtenerOCrearHojaRevision(ssDestino);
      
    // 1. Procesar movimientos entre hojas (cambios de método de pago)
    procesarMovimientosEntreHojas(movimientosEntreHojas, hojaTransferencias, hojaTarjetas, hojaBitacora, hojaRevision);
    
    // 2. Insertar nuevos registros
    insertarNuevosTransferencias(nuevosTransferencias, hojaTransferencias);
    insertarNuevosTarjetas(nuevosTarjetas, hojaTarjetas);
    
    // 3. Actualizar registros existentes
    actualizarTransferencias(actualizadosTransferencias, hojaTransferencias, hojaBitacora);
    actualizarTarjetas(actualizadosTarjetas, hojaTarjetas, hojaBitacora);
    
    // 4. Actualizar hipervínculos faltantes (solo los que no tienen link)
    actualizarHipervínculosFaltantes(hojaTransferencias, 2);
    actualizarHipervínculosFaltantes(hojaTarjetas, 2);
    
    // Resumen
    console.log('=== Sincronización completada ===');
    console.log(`Transferencias: ${nuevosTransferencias.length} nuevos, ${actualizadosTransferencias.length} actualizados`);
    console.log(`Tarjetas: ${nuevosTarjetas.length} nuevos, ${actualizadosTarjetas.length} actualizados`);
    console.log(`Movimientos entre hojas: ${movimientosEntreHojas.length}`);
    
  } catch (error) {
    console.error('Error en sincronización:', error);
    throw error;
  }
}

/**
 * Sincroniza un rango de fechas específico
 * Usar para: vacaciones largas, correcciones históricas, sincronización inicial
 * 
 * @param {string} fechaInicioStr - Fecha de inicio en formato "d/M/yyyy" (ej: "1/11/2025")
 * @param {string} fechaFinStr - Fecha de fin en formato "d/M/yyyy" (ej: "30/11/2025")
 * 
 * Ejemplo de uso:
 *   sincronizarRango('1/11/2025', '30/11/2025')  // Sincroniza todo noviembre
 *   sincronizarRango('1/12/2025', '15/12/2025') // Sincroniza primera quincena diciembre
 */
function sincronizarRango(fechaInicioStr, fechaFinStr) {
  try {
    // Parsear fechas
    const fechaInicio = parsearFecha(fechaInicioStr);
    const fechaFin = parsearFecha(fechaFinStr);
    
    if (!fechaInicio || !fechaFin) {
      throw new Error(`Fechas inválidas. Usar formato d/M/yyyy. Recibido: inicio="${fechaInicioStr}", fin="${fechaFinStr}"`);
    }
    
    if (fechaInicio > fechaFin) {
      throw new Error('La fecha de inicio debe ser anterior o igual a la fecha de fin');
    }
    
    // Normalizar a medianoche
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(0, 0, 0, 0);
    
    console.log(`=== SINCRONIZACIÓN POR RANGO ===`);
    console.log(`Desde: ${formatearFecha(fechaInicio)} hasta: ${formatearFecha(fechaFin)}`);
    
    const ssDestino = SpreadsheetApp.openById(ID_ARCHIVO_DESTINO);
    const hojaTransferencias = obtenerOCrearHojaTransferencias(ssDestino);
    const hojaTarjetas = obtenerOCrearHojaTarjetas(ssDestino);
    obtenerOCrearHojaCierres(ssDestino);
    
    const ssOrigen = SpreadsheetApp.openById(ID_ARCHIVO_ORIGEN);
    if (!ssOrigen) {
      throw new Error('No se pudo abrir el archivo origen');
    }
    
    // Construir mapas de folios existentes
    const foliosTransferencias = construirMapaFolios(hojaTransferencias, 'TRANSFERENCIA');
    const foliosTarjetas = construirMapaFolios(hojaTarjetas, 'TARJETA');
    
    // Arrays para acumular registros
    const nuevosTransferencias = [];
    const nuevosTarjetas = [];
    const actualizadosTransferencias = [];
    const actualizadosTarjetas = [];
    const movimientosEntreHojas = [];
    
    // Calcular número de días en el rango
    const diasEnRango = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`Procesando ${diasEnRango} días...`);
    
    // Procesar cada día del rango
    for (let d = 0; d < diasEnRango; d++) {
      const fechaBusqueda = new Date(fechaInicio);
      fechaBusqueda.setDate(fechaBusqueda.getDate() + d);
      
      const nombrePestana = obtenerNombrePestana(fechaBusqueda);
      let hojaOrigen;
      
      try {
        hojaOrigen = ssOrigen.getSheetByName(nombrePestana);
      } catch (e) {
        continue;
      }
      
      if (!hojaOrigen) continue;
      
      const datosOrigen = hojaOrigen.getDataRange().getValues();
      
      for (let i = 1; i < datosOrigen.length; i++) {
        const fila = datosOrigen[i];
        
        // Determinar método de pago
        const metodoPagoRaw = String(fila[COL_ORIGEN_METODO_PAGO] || '').toUpperCase();
        const esTransferencia = metodoPagoRaw.includes('TRANSFERENCIA');
        const esTarjeta = metodoPagoRaw.includes('TARJETA');
        
        if (!esTransferencia && !esTarjeta) continue;
        
        const metodoPago = esTransferencia ? 'TRANSFERENCIA' : 'TARJETA';
        
        // Parsear fecha
        const fechaVenta = parsearFecha(fila[COL_ORIGEN_FECHA]);
        if (!fechaVenta) continue;
        
        const fechaVentaSolo = new Date(fechaVenta.getFullYear(), fechaVenta.getMonth(), fechaVenta.getDate());
        if (fechaVentaSolo < fechaInicio || fechaVentaSolo > fechaFin) continue;
        
        // Extraer datos
        const folio = limpiarString(fila[COL_ORIGEN_FOLIO]);
        const cliente = limpiarString(fila[COL_ORIGEN_CLIENTE]);
        const servicio = limpiarString(fila[COL_ORIGEN_SERVICIO]);
        const banco = limpiarString(fila[COL_ORIGEN_BANCO]);
        const monto = parsearMonto(fila[COL_ORIGEN_COSTO_TOTAL]);
        
        if (!folio) continue;
        
        // Buscar en ambas hojas
        const existeEnTransferencias = foliosTransferencias.get(folio);
        const existeEnTarjetas = foliosTarjetas.get(folio);
        
        if (metodoPago === 'TRANSFERENCIA') {
          if (existeEnTarjetas && existeEnTarjetas.rowIndex > 0) {
            movimientosEntreHojas.push({
              tipo: 'TARJETA_A_TRANSFERENCIA',
              folio, rowIndexOrigen: existeEnTarjetas.rowIndex,
              fecha: fechaVenta, cliente, servicio, banco, monto
            });
            foliosTarjetas.delete(folio);
          } else if (existeEnTransferencias && existeEnTransferencias.rowIndex > 0) {
            const cambios = detectarCambios(existeEnTransferencias, { fecha: fechaVenta, cliente, servicio, banco, monto });
            if (cambios.hayCambios) {
              actualizadosTransferencias.push({
                rowIndex: existeEnTransferencias.rowIndex,
                folio, fecha: fechaVenta, cliente, servicio, banco, monto, cambios
              });
            }
          } else if (!existeEnTransferencias) {
            // Nuevo registro
            nuevosTransferencias.push({ fecha: fechaVenta, folio, cliente, servicio, banco, monto });
            foliosTransferencias.set(folio, { rowIndex: -1 });
          }
        } else { // TARJETA
          if (existeEnTransferencias && existeEnTransferencias.rowIndex > 0) {
            movimientosEntreHojas.push({
              tipo: 'TRANSFERENCIA_A_TARJETA',
              folio, rowIndexOrigen: existeEnTransferencias.rowIndex,
              fecha: fechaVenta, cliente, servicio, monto
            });
            foliosTransferencias.delete(folio);
          } else if (existeEnTarjetas && existeEnTarjetas.rowIndex > 0) {
            const cambios = detectarCambiosTarjetas(existeEnTarjetas, { fecha: fechaVenta, cliente, servicio, monto });
            if (cambios.hayCambios) {
              actualizadosTarjetas.push({
                rowIndex: existeEnTarjetas.rowIndex,
                folio, fecha: fechaVenta, cliente, servicio, monto, cambios
              });
            }
          } else if (!existeEnTarjetas) {
            // Nuevo registro
            nuevosTarjetas.push({ fecha: fechaVenta, folio, cliente, servicio, monto });
            foliosTarjetas.set(folio, { rowIndex: -1 });
          }
        }
      }
    }
    
    // Aplicar cambios
    const hojaBitacora = obtenerOCrearBitacora(ssDestino);
    const hojaRevision = obtenerOCrearHojaRevision(ssDestino);
    
    procesarMovimientosEntreHojas(movimientosEntreHojas, hojaTransferencias, hojaTarjetas, hojaBitacora, hojaRevision);
    insertarNuevosTransferencias(nuevosTransferencias, hojaTransferencias);
    insertarNuevosTarjetas(nuevosTarjetas, hojaTarjetas);
    actualizarTransferencias(actualizadosTransferencias, hojaTransferencias, hojaBitacora);
    actualizarTarjetas(actualizadosTarjetas, hojaTarjetas, hojaBitacora);
    
    // Actualizar hipervínculos faltantes
    actualizarHipervínculosFaltantes(hojaTransferencias, 2);
    actualizarHipervínculosFaltantes(hojaTarjetas, 2);
    
    // Resumen
    console.log('=== Sincronización por rango completada ===');
    console.log(`Rango: ${formatearFecha(fechaInicio)} - ${formatearFecha(fechaFin)} (${diasEnRango} días)`);
    console.log(`Transferencias: ${nuevosTransferencias.length} nuevos, ${actualizadosTransferencias.length} actualizados`);
    console.log(`Tarjetas: ${nuevosTarjetas.length} nuevos, ${actualizadosTarjetas.length} actualizados`);
    console.log(`Movimientos entre hojas: ${movimientosEntreHojas.length}`);
    
  } catch (error) {
    console.error('Error en sincronización por rango:', error);
    throw error;
  }
}

// ==================== FUNCIONES AUXILIARES ====================

/**
 * Construye un mapa de folios existentes en una hoja
 */
function construirMapaFolios(hoja, tipo) {
  const mapa = new Map();
  const datos = hoja.getDataRange().getValues();
  
  for (let i = 1; i < datos.length; i++) {
    const folio = String(datos[i][1] || '').trim(); // Columna B siempre es Folio
    if (folio) {
      if (tipo === 'TRANSFERENCIA') {
        mapa.set(folio, {
          rowIndex: i + 1,
          fecha: parsearFecha(datos[i][0]),
          cliente: String(datos[i][2] || '').trim(),
          servicio: String(datos[i][3] || '').trim(),
          banco: String(datos[i][4] || '').trim(),
          monto: parsearMonto(datos[i][5])
        });
      } else { // TARJETA
        mapa.set(folio, {
          rowIndex: i + 1,
          fecha: parsearFecha(datos[i][0]),
          cliente: String(datos[i][2] || '').trim(),
          servicio: String(datos[i][3] || '').trim(),
          monto: parsearMonto(datos[i][4]) // Monto en columna E para tarjetas
        });
      }
    }
  }
  
  return mapa;
}

/**
 * Detecta cambios en un registro de transferencias
 */
function detectarCambios(existente, nuevo) {
  const cambios = {
    hayCambios: false,
    fecha: !compararFechas(nuevo.fecha, existente.fecha),
    cliente: nuevo.cliente !== existente.cliente,
    servicio: nuevo.servicio !== existente.servicio,
    banco: nuevo.banco !== existente.banco,
    monto: !compararMontos(nuevo.monto, existente.monto),
    existente: existente,
    nuevo: nuevo
  };
  
  cambios.hayCambios = cambios.fecha || cambios.cliente || cambios.servicio || cambios.banco || cambios.monto;
  return cambios;
}

/**
 * Detecta cambios en un registro de tarjetas
 */
function detectarCambiosTarjetas(existente, nuevo) {
  const cambios = {
    hayCambios: false,
    fecha: !compararFechas(nuevo.fecha, existente.fecha),
    cliente: nuevo.cliente !== existente.cliente,
    servicio: nuevo.servicio !== existente.servicio,
    monto: !compararMontos(nuevo.monto, existente.monto),
    existente: existente,
    nuevo: nuevo
  };
  
  cambios.hayCambios = cambios.fecha || cambios.cliente || cambios.servicio || cambios.monto;
  return cambios;
}

/**
 * Verifica si una fila tiene trabajo manual (datos de conciliación)
 * @param {Sheet} hoja - Hoja a verificar
 * @param {number} rowIndex - Índice de fila
 * @param {string} tipo - 'TRANSFERENCIA' o 'TARJETA'
 * @return {object} {tieneTrabajoManual, conciliado, conceptoBanco, observaciones}
 */
function verificarTrabajoManual(hoja, rowIndex, tipo) {
  if (tipo === 'TRANSFERENCIA') {
    // Transferencias: G=Conciliado, H=Concepto Banco, I=Observaciones
    const valores = hoja.getRange(rowIndex, 7, 1, 3).getValues()[0];
    const conciliado = valores[0] === true || valores[0] === 'TRUE';
    const conceptoBanco = String(valores[1] || '').trim();
    const observaciones = String(valores[2] || '').trim();
    
    return {
      tieneTrabajoManual: conciliado || conceptoBanco !== '' || observaciones !== '',
      conciliado: conciliado,
      conceptoBanco: conceptoBanco,
      observaciones: observaciones
    };
  } else { // TARJETA
    // Tarjetas: F=Recibo, G=Afiliación, H=# Lote, I=Observaciones
    const valores = hoja.getRange(rowIndex, 6, 1, 4).getValues()[0];
    const recibo = valores[0] === true || valores[0] === 'TRUE';
    const afiliacion = String(valores[1] || '').trim();
    const lote = String(valores[2] || '').trim();
    const observaciones = String(valores[3] || '').trim();
    
    return {
      tieneTrabajoManual: recibo || afiliacion !== '' || lote !== '' || observaciones !== '',
      conciliado: recibo, // Usamos recibo como indicador de "procesado"
      conceptoBanco: `Afiliación: ${afiliacion}; Lote: ${lote}`,
      observaciones: observaciones
    };
  }
}

/**
 * Procesa movimientos de registros entre hojas (cambio de método de pago)
 * Si el registro tiene trabajo manual, va a hoja de revisión en lugar de moverse
 */
function procesarMovimientosEntreHojas(movimientos, hojaTransferencias, hojaTarjetas, hojaBitacora, hojaRevision) {
  // Ordenar por rowIndex descendente para eliminar sin afectar índices
  const tarjetaATransferencia = movimientos
    .filter(m => m.tipo === 'TARJETA_A_TRANSFERENCIA')
    .sort((a, b) => b.rowIndexOrigen - a.rowIndexOrigen);
  
  const transferenciaATarjeta = movimientos
    .filter(m => m.tipo === 'TRANSFERENCIA_A_TARJETA')
    .sort((a, b) => b.rowIndexOrigen - a.rowIndexOrigen);
  
  let movidosARevision = 0;
  let movidosNormales = 0;
  
  // Procesar TARJETA → TRANSFERENCIA
  for (const mov of tarjetaATransferencia) {
    // Verificar si tiene trabajo manual antes de eliminar
    const trabajo = verificarTrabajoManual(hojaTarjetas, mov.rowIndexOrigen, 'TARJETA');
    
    if (trabajo.tieneTrabajoManual) {
      // Tiene trabajo manual → Mover a hoja de revisión
      hojaRevision.appendRow([
        new Date(),                           // Timestamp
        mov.folio,                            // Folio
        'Cambio método pago: TARJETA → TRANSFERENCIA', // Conflicto
        NOMBRE_HOJA_TARJETAS,                 // Hoja Origen
        NOMBRE_HOJA_TRANSFERENCIAS,           // Hoja Destino
        mov.fecha,                            // Fecha
        mov.cliente,                          // Cliente
        mov.servicio,                         // Servicio
        mov.monto,                            // Monto
        mov.banco || '',                      // Banco
        trabajo.conciliado ? 'Sí' : 'No',    // ¿Conciliado?
        trabajo.conceptoBanco,                // Concepto Banco
        trabajo.observaciones,                // Observaciones
        'Pendiente'                           // Estado
      ]);
      
      // Eliminar de tarjetas
      hojaTarjetas.deleteRow(mov.rowIndexOrigen);
      
      // Registrar en bitácora
      hojaBitacora.appendRow([
        new Date(),
        mov.folio,
        'CONFLICTO → REVISIÓN',
        'TARJETA → TRANSFERENCIA (tenía trabajo manual)',
        `Conciliado: ${trabajo.conciliado}; ${trabajo.conceptoBanco}`,
        'Movido a: ' + NOMBRE_HOJA_REVISION
      ]);
      
      console.log(`⚠️ Folio ${mov.folio} movido a REVISIÓN (tenía trabajo manual)`);
      movidosARevision++;
    } else {
      // Sin trabajo manual → Mover normalmente
      hojaTarjetas.deleteRow(mov.rowIndexOrigen);
      
      const ultimaFila = hojaTransferencias.getLastRow();
      hojaTransferencias.getRange(ultimaFila + 1, 1, 1, 6).setValues([[
        mov.fecha, mov.folio, mov.cliente, mov.servicio, mov.banco, mov.monto
      ]]);
      hojaTransferencias.getRange(ultimaFila + 1, 1).setNumberFormat('d/M/yyyy');
      hojaTransferencias.getRange(ultimaFila + 1, 6).setNumberFormat('$#,##0.00');
      
      aplicarHipervínculosFolios(hojaTransferencias, ultimaFila + 1, 2, [mov.folio]);
      
      hojaBitacora.appendRow([
        new Date(),
        mov.folio,
        'CAMBIO MÉTODO PAGO',
        'TARJETA → TRANSFERENCIA',
        'Hoja: ' + NOMBRE_HOJA_TARJETAS,
        'Hoja: ' + NOMBRE_HOJA_TRANSFERENCIAS
      ]);
      
      console.log(`Folio ${mov.folio} movido de Tarjetas a Transferencias`);
      movidosNormales++;
    }
  }
  
  // Procesar TRANSFERENCIA → TARJETA
  for (const mov of transferenciaATarjeta) {
    // Verificar si tiene trabajo manual antes de eliminar
    const trabajo = verificarTrabajoManual(hojaTransferencias, mov.rowIndexOrigen, 'TRANSFERENCIA');
    
    if (trabajo.tieneTrabajoManual) {
      // Tiene trabajo manual → Mover a hoja de revisión
      hojaRevision.appendRow([
        new Date(),                           // Timestamp
        mov.folio,                            // Folio
        'Cambio método pago: TRANSFERENCIA → TARJETA', // Conflicto
        NOMBRE_HOJA_TRANSFERENCIAS,           // Hoja Origen
        NOMBRE_HOJA_TARJETAS,                 // Hoja Destino
        mov.fecha,                            // Fecha
        mov.cliente,                          // Cliente
        mov.servicio,                         // Servicio
        mov.monto,                            // Monto
        '',                                   // Banco (no aplica para tarjetas)
        trabajo.conciliado ? 'Sí' : 'No',    // ¿Conciliado?
        trabajo.conceptoBanco,                // Concepto Banco
        trabajo.observaciones,                // Observaciones
        'Pendiente'                           // Estado
      ]);
      
      // Eliminar de transferencias
      hojaTransferencias.deleteRow(mov.rowIndexOrigen);
      
      // Registrar en bitácora
      hojaBitacora.appendRow([
        new Date(),
        mov.folio,
        'CONFLICTO → REVISIÓN',
        'TRANSFERENCIA → TARJETA (tenía trabajo manual)',
        `Conciliado: ${trabajo.conciliado}; ${trabajo.conceptoBanco}`,
        'Movido a: ' + NOMBRE_HOJA_REVISION
      ]);
      
      console.log(`⚠️ Folio ${mov.folio} movido a REVISIÓN (tenía trabajo manual)`);
      movidosARevision++;
    } else {
      // Sin trabajo manual → Mover normalmente
      hojaTransferencias.deleteRow(mov.rowIndexOrigen);
      
      const ultimaFila = hojaTarjetas.getLastRow();
      hojaTarjetas.getRange(ultimaFila + 1, 1, 1, 5).setValues([[
        mov.fecha, mov.folio, mov.cliente, mov.servicio, mov.monto
      ]]);
      hojaTarjetas.getRange(ultimaFila + 1, 1).setNumberFormat('d/M/yyyy');
      hojaTarjetas.getRange(ultimaFila + 1, 5).setNumberFormat('$#,##0.00');
      
      aplicarHipervínculosFolios(hojaTarjetas, ultimaFila + 1, 2, [mov.folio]);
      
      hojaBitacora.appendRow([
        new Date(),
        mov.folio,
        'CAMBIO MÉTODO PAGO',
        'TRANSFERENCIA → TARJETA',
        'Hoja: ' + NOMBRE_HOJA_TRANSFERENCIAS,
        'Hoja: ' + NOMBRE_HOJA_TARJETAS
      ]);
      
      console.log(`Folio ${mov.folio} movido de Transferencias a Tarjetas`);
      movidosNormales++;
    }
  }
  
  if (movidosARevision > 0) {
    console.log(`⚠️ ${movidosARevision} registros enviados a Revisión Pendiente`);
  }
  if (movidosNormales > 0) {
    console.log(`✓ ${movidosNormales} registros movidos entre hojas`);
  }
}

/**
 * Inserta nuevos registros de transferencias
 */
function insertarNuevosTransferencias(registros, hoja) {
  if (registros.length === 0) return;
  
  const ultimaFila = hoja.getLastRow();
  const datos = registros.map(r => [r.fecha, r.folio, r.cliente, r.servicio, r.banco, r.monto]);
  
  hoja.getRange(ultimaFila + 1, 1, datos.length, 6).setValues(datos);
  hoja.getRange(ultimaFila + 1, 1, datos.length, 1).setNumberFormat('d/M/yyyy');
  hoja.getRange(ultimaFila + 1, 6, datos.length, 1).setNumberFormat('$#,##0.00');
  
  // Aplicar hipervínculos a los folios (columna B = 2)
  const folios = registros.map(r => r.folio);
  aplicarHipervínculosFolios(hoja, ultimaFila + 1, 2, folios);
  
  console.log(`${registros.length} nuevas transferencias insertadas`);
}

/**
 * Inserta nuevos registros de tarjetas
 */
function insertarNuevosTarjetas(registros, hoja) {
  if (registros.length === 0) return;
  
  const ultimaFila = hoja.getLastRow();
  const datos = registros.map(r => [r.fecha, r.folio, r.cliente, r.servicio, r.monto]);
  
  hoja.getRange(ultimaFila + 1, 1, datos.length, 5).setValues(datos);
  hoja.getRange(ultimaFila + 1, 1, datos.length, 1).setNumberFormat('d/M/yyyy');
  hoja.getRange(ultimaFila + 1, 5, datos.length, 1).setNumberFormat('$#,##0.00');
  
  // Aplicar hipervínculos a los folios (columna B = 2)
  const folios = registros.map(r => r.folio);
  aplicarHipervínculosFolios(hoja, ultimaFila + 1, 2, folios);
  
  console.log(`${registros.length} nuevas tarjetas insertadas`);
}

/**
 * Actualiza registros existentes de transferencias
 */
function actualizarTransferencias(registros, hoja, hojaBitacora) {
  if (registros.length === 0) return;
  
  for (const reg of registros) {
    // Actualizar solo columnas A-F (no tocar G-I zona protegida)
    hoja.getRange(reg.rowIndex, 1).setValue(reg.fecha);
    hoja.getRange(reg.rowIndex, 1).setNumberFormat('d/M/yyyy');
    hoja.getRange(reg.rowIndex, 2).setValue(reg.folio);
    hoja.getRange(reg.rowIndex, 3).setValue(reg.cliente);
    hoja.getRange(reg.rowIndex, 4).setValue(reg.servicio);
    hoja.getRange(reg.rowIndex, 5).setValue(reg.banco);
    hoja.getRange(reg.rowIndex, 6).setValue(reg.monto);
    hoja.getRange(reg.rowIndex, 6).setNumberFormat('$#,##0.00');
    
    // Registrar en bitácora
    const cambiosTexto = construirTextoCambios(reg.cambios, 'TRANSFERENCIA');
    if (cambiosTexto) {
      hojaBitacora.appendRow([
        new Date(),
        reg.folio,
        'ACTUALIZACIÓN',
        cambiosTexto.descripcion,
        cambiosTexto.anterior,
        cambiosTexto.nuevo
      ]);
    }
  }
  
  console.log(`${registros.length} transferencias actualizadas`);
}

/**
 * Actualiza registros existentes de tarjetas
 */
function actualizarTarjetas(registros, hoja, hojaBitacora) {
  if (registros.length === 0) return;
  
  for (const reg of registros) {
    // Actualizar solo columnas A-E (no tocar F-I zona protegida)
    hoja.getRange(reg.rowIndex, 1).setValue(reg.fecha);
    hoja.getRange(reg.rowIndex, 1).setNumberFormat('d/M/yyyy');
    hoja.getRange(reg.rowIndex, 2).setValue(reg.folio);
    hoja.getRange(reg.rowIndex, 3).setValue(reg.cliente);
    hoja.getRange(reg.rowIndex, 4).setValue(reg.servicio);
    hoja.getRange(reg.rowIndex, 5).setValue(reg.monto);
    hoja.getRange(reg.rowIndex, 5).setNumberFormat('$#,##0.00');
    
    // Registrar en bitácora
    const cambiosTexto = construirTextoCambios(reg.cambios, 'TARJETA');
    if (cambiosTexto) {
      hojaBitacora.appendRow([
        new Date(),
        reg.folio,
        'ACTUALIZACIÓN',
        cambiosTexto.descripcion,
        cambiosTexto.anterior,
        cambiosTexto.nuevo
      ]);
    }
  }
  
  console.log(`${registros.length} tarjetas actualizadas`);
}

/**
 * Construye el texto de cambios para la bitácora
 */
function construirTextoCambios(cambios, tipo) {
  const partes = [];
  const anteriores = [];
  const nuevos = [];
  
  if (cambios.fecha) {
    partes.push('Fecha');
    anteriores.push(`Fecha: ${formatearFecha(cambios.existente.fecha) || '(vacío)'}`);
    nuevos.push(`Fecha: ${formatearFecha(cambios.nuevo.fecha)}`);
  }
  if (cambios.cliente) {
    partes.push('Cliente');
    anteriores.push(`Cliente: ${cambios.existente.cliente || '(vacío)'}`);
    nuevos.push(`Cliente: ${cambios.nuevo.cliente}`);
  }
  if (cambios.servicio) {
    partes.push('Servicio');
    anteriores.push(`Servicio: ${cambios.existente.servicio || '(vacío)'}`);
    nuevos.push(`Servicio: ${cambios.nuevo.servicio}`);
  }
  if (tipo === 'TRANSFERENCIA' && cambios.banco) {
    partes.push('Banco');
    anteriores.push(`Banco: ${cambios.existente.banco || '(vacío)'}`);
    nuevos.push(`Banco: ${cambios.nuevo.banco}`);
  }
  if (cambios.monto) {
    partes.push('Monto');
    anteriores.push(`Monto: ${cambios.existente.monto}`);
    nuevos.push(`Monto: ${cambios.nuevo.monto}`);
  }
  
  if (partes.length === 0) return null;
  
  return {
    descripcion: `Cambios en: ${partes.join(', ')}`,
    anterior: anteriores.join('; '),
    nuevo: nuevos.join('; ')
  };
}

/**
 * Verifica si una celda ya tiene un hipervínculo
 * @param {Sheet} hoja - Hoja de cálculo
 * @param {number} fila - Número de fila
 * @param {number} columna - Número de columna
 * @return {boolean} True si ya tiene hipervínculo
 */
function tieneHipervínculo(hoja, fila, columna) {
  try {
    const richText = hoja.getRange(fila, columna).getRichTextValue();
    if (richText) {
      const linkUrl = richText.getLinkUrl(0, 1);
      return linkUrl !== null && linkUrl !== '';
    }
  } catch (e) {
    // Si hay error, asumir que no tiene link
  }
  return false;
}

/**
 * Actualiza hipervínculos solo para folios que no tienen link
 * @param {Sheet} hoja - Hoja a procesar
 * @param {number} columnaFolio - Columna donde está el folio (1-indexed)
 */
function actualizarHipervínculosFaltantes(hoja, columnaFolio) {
  if (!hoja) return 0;
  
  const datos = hoja.getDataRange().getValues();
  let actualizados = 0;
  
  for (let i = 1; i < datos.length; i++) {
    const fila = i + 1; // Convertir a 1-indexed
    const folio = String(datos[i][columnaFolio - 1] || '').trim();
    
    if (folio && !tieneHipervínculo(hoja, fila, columnaFolio)) {
      const url = buscarCarpetaEnDrive(folio);
      if (url) {
        const richText = crearHipervínculoFolio(folio, url);
        hoja.getRange(fila, columnaFolio).setRichTextValue(richText);
        actualizados++;
      }
    }
  }
  
  return actualizados;
}

/**
 * Actualiza los hipervínculos de todos los folios existentes que no tienen link
 * Se llama automáticamente al final de sincronizarConciliacion
 */
function actualizarHipervínculosExistentes() {
  console.log('Verificando hipervínculos faltantes...');
  
  const ss = SpreadsheetApp.openById(ID_ARCHIVO_DESTINO);
  
  // Actualizar hoja de Transferencias (folio en columna B = 2)
  const hojaTransferencias = ss.getSheetByName(NOMBRE_HOJA_TRANSFERENCIAS);
  const actualizadosT = actualizarHipervínculosFaltantes(hojaTransferencias, 2);
  if (actualizadosT > 0) {
    console.log(`Transferencias: ${actualizadosT} hipervínculos agregados`);
  }
  
  // Actualizar hoja de Tarjetas (folio en columna B = 2)
  const hojaTarjetas = ss.getSheetByName(NOMBRE_HOJA_TARJETAS);
  const actualizadosC = actualizarHipervínculosFaltantes(hojaTarjetas, 2);
  if (actualizadosC > 0) {
    console.log(`Tarjetas: ${actualizadosC} hipervínculos agregados`);
  }
  
  const total = actualizadosT + actualizadosC;
  if (total > 0) {
    console.log(`Total: ${total} hipervínculos agregados`);
  } else {
    console.log('Todos los folios ya tienen hipervínculo');
  }
}

/**
 * Función de prueba para verificar el parseo de formatos
 */
function probarFormatos() {
  console.log('=== Prueba de Formatos ===');
  console.log('Fecha "1/11/2025":', parsearFecha('1/11/2025'));
  console.log('Fecha "15/11/2025":', parsearFecha('15/11/2025'));
  console.log('Monto "$550.00":', parsearMonto('$550.00'));
  console.log('Monto "$1,200.00":', parsearMonto('$1,200.00'));
  console.log('=== Fin de Pruebas ===');
}
