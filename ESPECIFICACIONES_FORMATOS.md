# Especificaciones de Formatos de Datos

Este documento define los formatos exactos que deben respetarse al copiar datos del archivo origen a destino.

## Formatos Identificados en el Archivo Origen

### 1. Fecha (Columna C, Índice 2)
- **Formato**: `d/M/yyyy` (día/mes/año sin ceros iniciales opcionales)
- **Ejemplos**: 
  - `1/11/2025`
  - `15/11/2025`
- **Manejo en Script**: 
  - Leer como string y convertir a objeto Date de JavaScript
  - Al escribir en destino, mantener el mismo formato o usar formato de fecha de Google Sheets
  - **IMPORTANTE**: No cambiar el formato al copiar

### 2. Folio (Columna B, Índice 1)
- **Formato**: String alfanumérico con guión
- **Ejemplos**: 
  - `0-17850`
  - `0-18052`
- **Manejo en Script**: 
  - Leer y escribir como string sin modificar
  - **IMPORTANTE**: Preservar exactamente como está (incluyendo guiones y ceros)

### 3. Cliente (Columna D, Índice 3)
- **Formato**: String que puede contener:
  - Texto simple: `Marío de la cruz`
  - Texto con comillas y saltos de línea: `"Platón Frías"` (en CSV aparece en múltiples líneas)
- **Manejo en Script**: 
  - Leer como string, limpiar comillas dobles si existen
  - Preservar saltos de línea si los hay
  - **IMPORTANTE**: No truncar ni modificar el contenido

### 4. Costo Total / Monto (Columna J, Índice 9)
- **Formato**: Moneda mexicana con símbolo de peso
- **Ejemplos**: 
  - `$550.00`
  - `"$1,200.00"` (con comillas cuando tiene separador de miles)
  - `$850.00`
- **Manejo en Script**: 
  - Leer y limpiar: remover `$`, comillas, y comas
  - Convertir a número: `550.00`, `1200.00`, `850.00`
  - Al escribir en destino: usar formato de número o moneda según la configuración de la hoja
  - **IMPORTANTE**: Para comparaciones, usar valores numéricos sin formato

### 5. Banco (Columna S, Índice 18)
- **Formato**: String en mayúsculas
- **Ejemplos**: 
  - `SANTANDER`
  - `BANBAJIO`
  - `BANORTE`
  - `BANCOMER`
  - `CREDITO`
  - `DEBITO`
- **Manejo en Script**: 
  - Leer y escribir como string
  - **IMPORTANTE**: Preservar mayúsculas y el valor exacto

### 6. Servicio (s) (Columna AC, Índice 28)
- **Formato**: String descriptivo
- **Ejemplos**: 
  - `tapete chico`
  - `Sala 3 pizas + 4 sillas`
  - `Sala 3 piezas`
- **Manejo en Script**: 
  - Leer y escribir como string
  - **IMPORTANTE**: Preservar exactamente como está (incluyendo espacios, signos, etc.)

### 7. Método de Pago (Columna Q, Índice 16)
- **Formato**: String en mayúsculas
- **Ejemplos**: 
  - `TRANSFERENCIA`
  - `TARJETA`
  - `EFECTIVO`
- **Manejo en Script**: 
  - Usar para filtrar (solo procesar si contiene "TRANSFERENCIA")
  - Comparación insensible a mayúsculas/minúsculas: `toUpperCase().includes("TRANSFERENCIA")`

## Reglas de Compatibilidad

1. **Fechas**: 
   - Al leer desde Google Sheets, las fechas pueden venir como objetos Date o como strings
   - Si viene como string, parsear con cuidado respetando el formato `d/M/yyyy`
   - Al escribir, usar `setValue()` con objeto Date y aplicar formato `d/M/yyyy` con `setNumberFormat()`
   - **Implementado en**: Función `parsearFecha()` que maneja ambos casos

2. **Montos/Números**: 
   - Siempre limpiar formato antes de comparar o escribir
   - Para comparaciones de actualización, comparar valores numéricos, no strings formateados
   - Al escribir, usar números sin formato y aplicar formato de moneda `$#,##0.00` con `setNumberFormat()`
   - **Implementado en**: Función `parsearMonto()` que limpia y convierte, y `compararMontos()` para comparaciones

3. **Strings**: 
   - Preservar exactamente como están (sin trim innecesario, sin cambios de mayúsculas excepto donde se indique)
   - Manejar comillas y caracteres especiales correctamente
   - **Implementado en**: Función `limpiarString()` que solo remueve comillas externas

4. **Match y Búsqueda**: 
   - Para buscar folios, usar comparación exacta de strings
   - Para comparar montos, usar comparación numérica (con tolerancia para decimales si es necesario)
   - Para comparar bancos, usar comparación exacta de strings
   - **Implementado en**: El script usa `Map` para búsqueda rápida de folios y `compararMontos()` para montos

## Funciones Implementadas en Code.gs

- `parsearFecha(fechaValue)`: Convierte strings en formato `d/M/yyyy` a objetos Date
- `parsearMonto(montoValue)`: Limpia formato de moneda (`$`, comillas, comas) y convierte a número
- `limpiarString(valor)`: Preserva strings exactamente, solo remueve comillas externas
- `compararMontos(monto1, monto2)`: Compara montos con tolerancia de 0.01 para evitar problemas de precisión decimal
- `obtenerNombrePestana(fecha)`: Obtiene el nombre de la pestaña según el mes de la fecha

