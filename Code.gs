/**
 * Sistema de Sincronización para Conciliación Bancaria (ETL Remoto)
 * 
 * Este script respeta los formatos exactos del archivo origen para evitar
 * problemas de compatibilidad y match.
 * 
 * CONFIGURACIÓN:
 * - ID_ARCHIVO_ORIGEN: ID del archivo Google Sheets de Operaciones Lavasmart
 * - NOMBRE_HOJA_DESTINO: Nombre de la hoja de destino (default: "Conciliacion_Bancaria")
 * - DIAS_LOOKBACK: Días hacia atrás para buscar registros (default: 5)
 */

// ==================== CONFIGURACIÓN ====================
const ID_ARCHIVO_ORIGEN = '10_jpvm53Jn3zo0px5_wCs8Nf2YwmRpPR-CPfHC21KQs';
const ID_ARCHIVO_DESTINO = '13JwPsTMdhkeRwcYsaf99t7QMvRApU-31YIrTVL7UQGo'; // Archivo donde se guardan los registros
const NOMBRE_HOJA_DESTINO = 'Conciliacion_Bancaria';
const NOMBRE_HOJA_BITACORA = '📝 Bitácora_Cambios';
const DIAS_LOOKBACK = 5;

// Índices de columnas (base-0)
const COL_ORIGEN_FOLIO = 1; // Columna B
const COL_ORIGEN_FECHA = 2; // Columna C
const COL_ORIGEN_CLIENTE = 3; // Columna D
const COL_ORIGEN_SERVICIO = 28; // Columna AC
const COL_ORIGEN_BANCO = 18; // Columna S
const COL_ORIGEN_COSTO_TOTAL = 9; // Columna J
const COL_ORIGEN_METODO_PAGO = 16; // Columna Q

// ==================== FUNCIONES DE FORMATO ====================

/**
 * Parsea una fecha desde el formato del archivo origen (d/M/yyyy)
 * @param {string|Date} fechaValue - Valor de fecha del origen
 * @return {Date|null} Objeto Date o null si no se puede parsear
 */
function parsearFecha(fechaValue) {
  if (!fechaValue) return null;
  
  // Si ya es un objeto Date, retornarlo
  if (fechaValue instanceof Date) {
    return fechaValue;
  }
  
  // Si es string, parsear formato d/M/yyyy
  if (typeof fechaValue === 'string') {
    // Formato esperado: "1/11/2025" o "15/11/2025"
    const partes = fechaValue.trim().split('/');
    if (partes.length === 3) {
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Mes es 0-indexed en JavaScript
      const año = parseInt(partes[2], 10);
      
      if (!isNaN(dia) && !isNaN(mes) && !isNaN(año)) {
        return new Date(año, mes, dia);
      }
    }
  }
  
  // Intentar parseo automático de Google Sheets
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
 * Respeta el formato del origen: "$550.00" o "$1,200.00"
 * @param {string|number} montoValue - Valor del monto del origen
 * @return {number} Número sin formato
 */
function parsearMonto(montoValue) {
  if (typeof montoValue === 'number') {
    return montoValue;
  }
  
  if (typeof montoValue !== 'string') {
    return 0;
  }
  
  // Remover símbolo de peso, comillas, espacios y comas
  let montoLimpio = montoValue
    .replace(/\$/g, '')      // Remover $
    .replace(/"/g, '')        // Remover comillas dobles
    .replace(/,/g, '')        // Remover comas (separadores de miles)
    .replace(/\s/g, '')       // Remover espacios
    .trim();
  
  const montoNumero = parseFloat(montoLimpio);
  return isNaN(montoNumero) ? 0 : montoNumero;
}

/**
 * Limpia un string preservando su contenido exacto
 * Solo remueve comillas dobles externas si las hay
 * @param {string} valor - Valor del string
 * @return {string} String limpio
 */
function limpiarString(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }
  
  let str = String(valor);
  
  // Remover comillas dobles al inicio y final si las hay
  if (str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }
  
  // Preservar saltos de línea y espacios internos
  return str.trim();
}

/**
 * Compara dos montos con tolerancia para decimales
 * @param {number} monto1 - Primer monto
 * @param {number} monto2 - Segundo monto
 * @return {boolean} True si son iguales (dentro de tolerancia)
 */
function compararMontos(monto1, monto2) {
  const tolerancia = 0.01; // Tolerancia de 1 centavo
  return Math.abs(monto1 - monto2) < tolerancia;
}

/**
 * Formatea una fecha al formato d/M/yyyy (formato del archivo origen)
 * @param {Date} fecha - Fecha a formatear
 * @return {string} Fecha formateada (ej: "16/11/2025")
 */
function formatearFecha(fecha) {
  if (!fecha || !(fecha instanceof Date)) {
    return '';
  }
  
  const dia = fecha.getDate();
  const mes = fecha.getMonth() + 1; // Mes es 0-indexed, sumar 1
  const año = fecha.getFullYear();
  
  return `${dia}/${mes}/${año}`;
}

/**
 * Obtiene el nombre de la pestaña según el mes de la fecha
 * @param {Date} fecha - Fecha del registro
 * @return {string} Nombre de la pestaña (ej: "Noviembre", "Diciembre")
 */
function obtenerNombrePestana(fecha) {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return meses[fecha.getMonth()];
}

// ==================== FUNCIONES PRINCIPALES ====================

/**
 * Función principal de sincronización
 */
function sincronizarConciliacion() {
  try {
    // Usar el ID del archivo destino para asegurar que siempre trabajamos con el archivo correcto
    // Esto es importante cuando el script se ejecuta desde un trigger remoto
    const ssDestino = SpreadsheetApp.openById(ID_ARCHIVO_DESTINO);
    let hojaDestino = ssDestino.getSheetByName(NOMBRE_HOJA_DESTINO);
    
    // Si la hoja no existe, crearla con los encabezados
    if (!hojaDestino) {
      console.log(`La hoja "${NOMBRE_HOJA_DESTINO}" no existe. Creándola...`);
      hojaDestino = ssDestino.insertSheet(NOMBRE_HOJA_DESTINO);
      
      // Agregar encabezados
      hojaDestino.appendRow([
        'Fecha',           // Columna A - Datos del script
        'Folio',           // Columna B - Datos del script
        'Cliente',          // Columna C - Datos del script
        'Servicio (s)',    // Columna D - Datos del script
        'Banco',           // Columna E - Datos del script
        'Monto',           // Columna F - Datos del script
        '✅ Conciliado',    // Columna G - Zona protegida (Checkbox)
        '💳 Concepto Banco', // Columna H - Zona protegida (Concepto encontrado en banco para match)
        '🔍 Observaciones'  // Columna I - Zona protegida (Texto libre)
      ]);
      
      // Formatear encabezados
      const headerRange = hojaDestino.getRange(1, 1, 1, 9);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f0f0f0');
      
      // Aplicar formatos a las columnas
      hojaDestino.getRange(1, 1, 1, 1).setNumberFormat('d/M/yyyy'); // Columna A: Fecha
      hojaDestino.getRange(1, 6, 1, 1).setNumberFormat('$#,##0.00'); // Columna F: Monto
      
      // Formatear zona protegida con color diferente para indicar que es solo para el conciliador
      const zonaProtegidaRange = hojaDestino.getRange(1, 7, 1, 3); // Columnas G, H, I
      zonaProtegidaRange.setBackground('#fff2cc'); // Color amarillo claro para indicar zona protegida
      
      console.log(`Hoja "${NOMBRE_HOJA_DESTINO}" creada exitosamente`);
    } else {
      // Verificar si la hoja existe pero le faltan columnas (para hojas creadas antes de esta actualización)
      const encabezados = hojaDestino.getRange(1, 1, 1, hojaDestino.getLastColumn()).getValues()[0];
      const numColumnas = encabezados.length;
      
      // Si tiene menos de 9 columnas, agregar las faltantes
      if (numColumnas < 9) {
        console.log(`La hoja tiene ${numColumnas} columnas. Agregando columnas faltantes...`);
        
        // Agregar encabezados faltantes
        if (numColumnas < 7) {
          hojaDestino.getRange(1, 7).setValue('✅ Conciliado');
        }
        if (numColumnas < 8) {
          hojaDestino.getRange(1, 8).setValue('💳 Concepto Banco');
        }
        if (numColumnas < 9) {
          hojaDestino.getRange(1, 9).setValue('🔍 Observaciones');
        }
        
        // Formatear encabezados
        const headerRange = hojaDestino.getRange(1, 1, 1, 9);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#f0f0f0');
        
        // Formatear zona protegida
        const zonaProtegidaRange = hojaDestino.getRange(1, 7, 1, 3); // Columnas G, H, I
        zonaProtegidaRange.setBackground('#fff2cc');
        
        console.log('Columnas agregadas exitosamente');
      }
    }
    
    const ssOrigen = SpreadsheetApp.openById(ID_ARCHIVO_ORIGEN);
    if (!ssOrigen) {
      throw new Error('No se pudo abrir el archivo origen');
    }
    
    // Obtener fechas del rango de búsqueda (últimos 5 días)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaInicio = new Date(hoy);
    fechaInicio.setDate(fechaInicio.getDate() - DIAS_LOOKBACK);
    
    // Log del rango de búsqueda con formato correcto
    console.log(`Buscando registros desde: ${formatearFecha(fechaInicio)} hasta: ${formatearFecha(hoy)}`);
    
    // Obtener todos los folios existentes en destino para búsqueda rápida
    const datosDestino = hojaDestino.getDataRange().getValues();
    const foliosExistentes = new Map(); // Map<folio, {rowIndex, monto, banco}>
    
    // Construir mapa de folios existentes (empezar desde fila 2, índice 1)
    for (let i = 1; i < datosDestino.length; i++) {
      const folio = String(datosDestino[i][1] || '').trim(); // Columna B (índice 1)
      if (folio) {
        const montoDestino = parsearMonto(datosDestino[i][5]); // Columna F (índice 5)
        const bancoDestino = String(datosDestino[i][4] || '').trim(); // Columna E (índice 4)
        foliosExistentes.set(folio, {
          rowIndex: i + 1, // +1 porque getValues() es 0-indexed pero setValue() usa 1-indexed
          monto: montoDestino,
          banco: bancoDestino
        });
      }
    }
    
    // Procesar cada día del rango
    const registrosNuevos = [];
    const registrosActualizados = [];
    
    for (let d = 0; d <= DIAS_LOOKBACK; d++) {
      const fechaBusqueda = new Date(fechaInicio);
      fechaBusqueda.setDate(fechaBusqueda.getDate() + d);
      
      const nombrePestana = obtenerNombrePestana(fechaBusqueda);
      let hojaOrigen;
      
      try {
        hojaOrigen = ssOrigen.getSheetByName(nombrePestana);
      } catch (e) {
        console.log(`No se encontró la pestaña "${nombrePestana}", continuando...`);
        continue;
      }
      
      if (!hojaOrigen) {
        continue;
      }
      
      // Leer datos de la hoja origen (empezar desde fila 2)
      const datosOrigen = hojaOrigen.getDataRange().getValues();
      
      for (let i = 1; i < datosOrigen.length; i++) {
        const fila = datosOrigen[i];
        
        // Filtrar por método de pago (debe contener "TRANSFERENCIA")
        const metodoPago = String(fila[COL_ORIGEN_METODO_PAGO] || '').toUpperCase();
        if (!metodoPago.includes('TRANSFERENCIA')) {
          continue;
        }
        
        // Parsear fecha y verificar si está en el rango
        const fechaVenta = parsearFecha(fila[COL_ORIGEN_FECHA]);
        if (!fechaVenta) {
          continue;
        }
        
        // Verificar si la fecha está en el rango de búsqueda
        const fechaVentaSolo = new Date(fechaVenta.getFullYear(), fechaVenta.getMonth(), fechaVenta.getDate());
        if (fechaVentaSolo < fechaInicio || fechaVentaSolo > hoy) {
          continue;
        }
        
        // Extraer datos respetando formatos
        const folio = limpiarString(fila[COL_ORIGEN_FOLIO]);
        const cliente = limpiarString(fila[COL_ORIGEN_CLIENTE]);
        const servicio = limpiarString(fila[COL_ORIGEN_SERVICIO]);
        const banco = limpiarString(fila[COL_ORIGEN_BANCO]);
        const monto = parsearMonto(fila[COL_ORIGEN_COSTO_TOTAL]);
        
        if (!folio) {
          continue; // Saltar si no hay folio
        }
        
        // Verificar si el folio ya existe
        const folioExistente = foliosExistentes.get(folio);
        
        if (!folioExistente) {
          // NUEVO REGISTRO: Agregar a la lista para insertar
          registrosNuevos.push({
            fecha: fechaVenta,
            folio: folio,
            cliente: cliente,
            servicio: servicio,
            banco: banco,
            monto: monto
          });
          
          // Agregar al mapa para evitar duplicados en la misma ejecución
          foliosExistentes.set(folio, {
            rowIndex: -1, // Se asignará al insertar
            monto: monto,
            banco: banco
          });
        } else {
          // REGISTRO EXISTENTE: Verificar si necesita actualización
          const necesitaActualizacion = 
            !compararMontos(monto, folioExistente.monto) || 
            banco !== folioExistente.banco;
          
          if (necesitaActualizacion) {
            registrosActualizados.push({
              rowIndex: folioExistente.rowIndex,
              folio: folio,
              fecha: fechaVenta,
              cliente: cliente,
              servicio: servicio,
              banco: banco,
              monto: monto,
              montoAnterior: folioExistente.monto,
              bancoAnterior: folioExistente.banco
            });
            
            // Actualizar el mapa
            foliosExistentes.set(folio, {
              rowIndex: folioExistente.rowIndex,
              monto: monto,
              banco: banco
            });
          }
        }
      }
    }
    
    // Insertar nuevos registros
    if (registrosNuevos.length > 0) {
      const ultimaFila = hojaDestino.getLastRow();
      const nuevosDatos = registrosNuevos.map(reg => [
        reg.fecha,      // Columna A: Fecha
        reg.folio,      // Columna B: Folio
        reg.cliente,    // Columna C: Cliente
        reg.servicio,   // Columna D: Servicio
        reg.banco,      // Columna E: Banco
        reg.monto       // Columna F: Monto
      ]);
      
      hojaDestino.getRange(ultimaFila + 1, 1, nuevosDatos.length, 6).setValues(nuevosDatos);
      
      // Formatear fechas en la columna A
      hojaDestino.getRange(ultimaFila + 1, 1, nuevosDatos.length, 1)
        .setNumberFormat('d/M/yyyy');
      
      // Formatear montos en la columna F
      hojaDestino.getRange(ultimaFila + 1, 6, nuevosDatos.length, 1)
        .setNumberFormat('$#,##0.00');
      
      console.log(`${registrosNuevos.length} registros nuevos insertados`);
    }
    
    // Actualizar registros existentes
    if (registrosActualizados.length > 0) {
      const hojaBitacora = obtenerOCrearBitacora(ssDestino);
      
      for (const reg of registrosActualizados) {
        // Actualizar solo columnas A-F (índices 1-6)
        hojaDestino.getRange(reg.rowIndex, 1).setValue(reg.fecha); // Fecha
        hojaDestino.getRange(reg.rowIndex, 1).setNumberFormat('d/M/yyyy');
        hojaDestino.getRange(reg.rowIndex, 2).setValue(reg.folio); // Folio
        hojaDestino.getRange(reg.rowIndex, 3).setValue(reg.cliente); // Cliente
        hojaDestino.getRange(reg.rowIndex, 4).setValue(reg.servicio); // Servicio
        hojaDestino.getRange(reg.rowIndex, 5).setValue(reg.banco); // Banco
        hojaDestino.getRange(reg.rowIndex, 6).setValue(reg.monto); // Monto
        hojaDestino.getRange(reg.rowIndex, 6).setNumberFormat('$#,##0.00');
        
        // Registrar en bitácora
        const cambios = [];
        if (!compararMontos(reg.monto, reg.montoAnterior)) {
          cambios.push(`Monto: ${reg.montoAnterior} → ${reg.monto}`);
        }
        if (reg.banco !== reg.bancoAnterior) {
          cambios.push(`Banco: ${reg.bancoAnterior} → ${reg.banco}`);
        }
        
        if (cambios.length > 0) {
          const filaBitacora = [
            new Date(), // Timestamp
            reg.folio,  // Folio
            cambios.join('; '), // Cambios
            `Monto: ${reg.montoAnterior}; Banco: ${reg.bancoAnterior}`, // Valores anteriores
            `Monto: ${reg.monto}; Banco: ${reg.banco}` // Valores nuevos
          ];
          
          hojaBitacora.appendRow(filaBitacora);
        }
      }
      
      console.log(`${registrosActualizados.length} registros actualizados`);
    }
    
    console.log('Sincronización completada exitosamente');
    
  } catch (error) {
    console.error('Error en sincronización:', error);
    throw error;
  }
}

/**
 * Obtiene o crea la hoja de bitácora
 * @param {Spreadsheet} ss - Spreadsheet de destino
 * @return {Sheet} Hoja de bitácora
 */
function obtenerOCrearBitacora(ss) {
  let hojaBitacora = ss.getSheetByName(NOMBRE_HOJA_BITACORA);
  
  if (!hojaBitacora) {
    hojaBitacora = ss.insertSheet(NOMBRE_HOJA_BITACORA);
    // Agregar encabezados
    hojaBitacora.appendRow([
      'Timestamp',
      'Folio',
      'Campo Modificado',
      'Valor Anterior',
      'Valor Nuevo'
    ]);
    
    // Formatear encabezados
    const headerRange = hojaBitacora.getRange(1, 1, 1, 5);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#f0f0f0');
  }
  
  return hojaBitacora;
}

/**
 * Función de prueba para verificar el parseo de formatos
 */
function probarFormatos() {
  // Probar parseo de fechas
  console.log('=== Prueba de Formatos ===');
  console.log('Fecha "1/11/2025":', parsearFecha('1/11/2025'));
  console.log('Fecha "15/11/2025":', parsearFecha('15/11/2025'));
  
  // Probar parseo de montos
  console.log('Monto "$550.00":', parsearMonto('$550.00'));
  console.log('Monto "$1,200.00":', parsearMonto('$1,200.00'));
  console.log('Monto "\"$1,200.00\"":', parsearMonto('"$1,200.00"'));
  
  // Probar limpieza de strings
  console.log('String "Marío de la cruz":', limpiarString('Marío de la cruz'));
  console.log('String "\"Platón Frías\"":', limpiarString('"Platón Frías"'));
  
  console.log('=== Fin de Pruebas ===');
}

