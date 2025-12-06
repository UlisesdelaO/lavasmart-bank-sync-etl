# 📚 Documentación del Sistema de Sincronización para Conciliación Bancaria

**Versión:** 2.0  
**Última actualización:** Diciembre 2025  
**Tipo:** Sistema ETL (Extracción, Transformación y Carga)

---

## 📋 Índice

1. [Descripción General](#1-descripción-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura de Hojas](#3-estructura-de-hojas)
4. [Configuración](#4-configuración)
5. [Funciones Principales](#5-funciones-principales)
6. [Flujo de Sincronización](#6-flujo-de-sincronización)
7. [Detección de Cambios](#7-detección-de-cambios)
8. [Manejo de Conflictos](#8-manejo-de-conflictos)
9. [Bitácora de Cambios](#9-bitácora-de-cambios)
10. [Funcionalidades Especiales](#10-funcionalidades-especiales)
11. [Ejecución y Triggers](#11-ejecución-y-triggers)
12. [Solución de Problemas](#12-solución-de-problemas)

---

## 1. Descripción General

### ¿Qué es este sistema?

Es un sistema automatizado que sincroniza los registros de ventas desde el archivo de **Operaciones Lavasmart** hacia el archivo de **Conciliación Bancaria**, separando automáticamente los pagos por:

- **Transferencia bancaria** → Hoja `Conciliacion_Transferencias`
- **Tarjeta de crédito/débito** → Hoja `Conciliacion_Tarjetas`

### Objetivo

Facilitar la conciliación bancaria al:

1. Extraer automáticamente las ventas relevantes
2. Mantener los datos actualizados cuando hay correcciones
3. Proteger el trabajo manual del conciliador
4. Registrar todos los cambios para auditoría

---

## 2. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHIVO ORIGEN                                │
│            "Operaciones Lavasmart"                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Enero    │ │ Febrero  │ │   ...    │ │Diciembre │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Lectura (últimos 10 días)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOOGLE APPS SCRIPT                            │
│                     (Motor ETL)                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Extracción │→ │Transformac.│→ │   Carga    │                │
│  └────────────┘  └────────────┘  └────────────┘                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Escritura (solo columnas A-F)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ARCHIVO DESTINO                                │
│            "Conciliación Bancaria"                               │
│  ┌────────────────────────┐  ┌────────────────────────┐        │
│  │Conciliacion_Transferenc│  │  Conciliacion_Tarjetas │        │
│  └────────────────────────┘  └────────────────────────┘        │
│  ┌────────────────────────┐  ┌────────────────────────┐        │
│  │    Cierres_Lotes       │  │  📝 Bitácora_Cambios   │        │
│  └────────────────────────┘  └────────────────────────┘        │
│  ┌────────────────────────┐                                     │
│  │ ⚠️ Revisión_Pendiente  │                                     │
│  └────────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Estructura de Hojas

### 3.1. Conciliacion_Transferencias

Para pagos realizados por transferencia bancaria. Conciliación 1:1 con movimientos del banco.

| Columna | Nombre | Tipo | Escritura |
|---------|--------|------|-----------|
| A | Fecha | Fecha | 🤖 Script |
| B | Folio | Texto (hipervínculo) | 🤖 Script |
| C | Cliente | Texto | 🤖 Script |
| D | Servicio (s) | Texto | 🤖 Script |
| E | Banco | Texto | 🤖 Script |
| F | Monto | Moneda | 🤖 Script |
| G | ✅ Conciliado | Checkbox | 👤 Manual |
| H | 💳 Concepto Banco | Texto | 👤 Manual |
| I | 🔍 Observaciones | Texto | 👤 Manual |

### 3.2. Conciliacion_Tarjetas

Para pagos con tarjeta de crédito/débito. Conciliación por lote de cierre.

| Columna | Nombre | Tipo | Escritura |
|---------|--------|------|-----------|
| A | Fecha | Fecha | 🤖 Script |
| B | Folio | Texto (hipervínculo) | 🤖 Script |
| C | Cliente | Texto | 🤖 Script |
| D | Servicio (s) | Texto | 🤖 Script |
| E | Monto | Moneda | 🤖 Script |
| F | 🧾 Recibo | Checkbox | 👤 Manual |
| G | Afiliación | Texto | 👤 Manual |
| H | 📦 # Lote | Texto | 👤 Manual |
| I | 🔍 Observaciones | Texto | 👤 Manual |

### 3.3. Cierres_Lotes

Para registrar los cierres de terminal y validar cuadre.

| Columna | Nombre | Tipo | Notas |
|---------|--------|------|-------|
| A | Fecha | Fecha | Manual |
| B | # Lote | Texto | Manual |
| C | Total Cierre | Moneda | Del ticket de cierre |
| D | Total Folios | Moneda | Fórmula SUMIF |
| E | ✅ Cuadra | Texto | Fórmula (✅/❌) |
| F | 💰 Depositado | Checkbox | Manual |
| G | 🔍 Observaciones | Texto | Manual |

### 3.4. 📝 Bitácora_Cambios

Registro histórico de todas las modificaciones.

| Columna | Contenido |
|---------|-----------|
| Timestamp | Fecha y hora del cambio |
| Folio | Folio afectado |
| Acción | Tipo de cambio (ACTUALIZACIÓN, CAMBIO MÉTODO PAGO, etc.) |
| Detalle | Descripción del cambio |
| Valores Anteriores | Datos antes del cambio |
| Valores Nuevos | Datos después del cambio |

### 3.5. ⚠️ Revisión_Pendiente

Para conflictos que requieren revisión manual.

| Columna | Contenido |
|---------|-----------|
| Timestamp | Cuándo se detectó |
| Folio | Identificador |
| Conflicto | Tipo de conflicto |
| Hoja Origen | De dónde venía |
| Hoja Destino | A dónde debería ir |
| Fecha, Cliente, Servicio, Monto, Banco | Datos del registro |
| ¿Conciliado? | Si estaba marcado |
| Concepto Banco | El que tenía |
| Observaciones | Las que tenía |
| Estado | Pendiente/Resuelto |

---

## 4. Configuración

### 4.1. IDs de Archivos

```javascript
const ID_ARCHIVO_ORIGEN = '10_jpvm53Jn3zo0px5_wCs8Nf2YwmRpPR-CPfHC21KQs';
const ID_ARCHIVO_DESTINO = '13JwPsTMdhkeRwcYsaf99t7QMvRApU-31YIrTVL7UQGo';
```

### 4.2. Parámetros de Sincronización

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `DIAS_LOOKBACK` | 10 | Días hacia atrás para buscar registros |

### 4.3. Mapeo de Columnas Origen

| Campo | Columna | Índice (base-0) |
|-------|---------|-----------------|
| Folio | B | 1 |
| Fecha | C | 2 |
| Cliente | D | 3 |
| Costo Total | J | 9 |
| Método de Pago | Q | 16 |
| Banco | S | 18 |
| Servicio (s) | AC | 28 |

---

## 5. Funciones Principales

### 5.1. `sincronizarConciliacion()`

**Función principal de sincronización automática.**

- Se ejecuta automáticamente vía trigger
- Procesa los últimos 10 días
- Separa registros por método de pago
- Detecta y aplica cambios
- Maneja conflictos

```javascript
// Ejecutar manualmente desde el editor de Apps Script
sincronizarConciliacion();
```

### 5.2. `sincronizarRango(fechaInicio, fechaFin)`

**Para sincronizar un período específico.**

Útil para:
- Carga inicial de datos históricos
- Correcciones masivas
- Después de vacaciones largas

```javascript
// Ejemplos de uso:
sincronizarRango('1/11/2025', '30/11/2025');  // Todo noviembre
sincronizarRango('1/12/2025', '15/12/2025');  // Primera quincena diciembre
```

### 5.3. `actualizarHipervínculosExistentes()`

**Actualiza hipervínculos faltantes en folios.**

Los folios se vinculan automáticamente a su carpeta en Google Drive (si existe).

```javascript
// Ejecutar si hay folios sin hipervínculo
actualizarHipervínculosExistentes();
```

### 5.4. `probarFormatos()`

**Función de prueba para verificar parseo de datos.**

```javascript
// Para debugging
probarFormatos();
```

---

## 6. Flujo de Sincronización

```
┌─────────────────────────────────────────────────────────────────┐
│                    INICIO SINCRONIZACIÓN                         │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Construir mapas de folios existentes en ambas hojas         │
│     - foliosTransferencias: Map<folio, {rowIndex, datos...}>    │
│     - foliosTarjetas: Map<folio, {rowIndex, datos...}>          │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Para cada día en el rango (últimos 10 días):                │
│     - Determinar pestaña del mes (Enero, Febrero, etc.)         │
│     - Leer registros de esa pestaña                             │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Para cada registro del origen:                              │
│     - Filtrar: ¿Es TRANSFERENCIA o TARJETA?                     │
│     - Verificar: ¿Fecha está en el rango?                       │
│     - Clasificar: Nuevo / Actualización / Movimiento            │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Aplicar cambios:                                            │
│     a) Procesar movimientos entre hojas (método de pago)        │
│     b) Insertar registros nuevos                                │
│     c) Actualizar registros existentes                          │
│     d) Actualizar hipervínculos faltantes                       │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FIN SINCRONIZACIÓN                            │
│  (Log con resumen de cambios)                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Detección de Cambios

### 7.1. Campos Monitoreados

**Para Transferencias:**
- Fecha
- Cliente
- Servicio
- Banco
- Monto

**Para Tarjetas:**
- Fecha
- Cliente
- Servicio
- Monto

### 7.2. Comparación de Valores

| Tipo | Método de Comparación |
|------|----------------------|
| Fechas | Comparación de día, mes y año |
| Montos | Tolerancia de $0.01 (centavo) |
| Textos | Comparación exacta (trim) |

### 7.3. Acciones por Tipo de Cambio

| Escenario | Acción |
|-----------|--------|
| Folio no existe | Insertar nuevo registro |
| Folio existe, sin cambios | Ignorar |
| Folio existe, con cambios | Actualizar columnas A-F, preservar G-I |
| Cambio de método de pago | Ver sección 8 (Manejo de Conflictos) |

---

## 8. Manejo de Conflictos

### 8.1. Cambio de Método de Pago

Cuando un registro cambia de TRANSFERENCIA a TARJETA (o viceversa):

```
¿El registro tiene trabajo manual?
    │
    ├─ NO (sin conciliar, sin observaciones)
    │   └─ Mover automáticamente a la otra hoja
    │
    └─ SÍ (conciliado, con observaciones, con lote, etc.)
        └─ Mover a "⚠️ Revisión_Pendiente"
```

### 8.2. Qué se Considera "Trabajo Manual"

**Transferencias:**
- ✅ Checkbox "Conciliado" marcado
- 💳 "Concepto Banco" con texto
- 🔍 "Observaciones" con texto

**Tarjetas:**
- 🧾 Checkbox "Recibo" marcado
- Afiliación con texto
- # Lote asignado
- 🔍 "Observaciones" con texto

### 8.3. Resolución de Conflictos

Ver la guía completa: [`GUIA_REVISION_PENDIENTE.md`](./GUIA_REVISION_PENDIENTE.md)

---

## 9. Bitácora de Cambios

### 9.1. Eventos Registrados

| Evento | Descripción |
|--------|-------------|
| ACTUALIZACIÓN | Cambio en datos de un registro existente |
| CAMBIO MÉTODO PAGO | Registro movido entre hojas |
| CONFLICTO → REVISIÓN | Registro con trabajo manual enviado a revisión |

### 9.2. Ejemplo de Registro

```
Timestamp: 6/12/2025 14:30:00
Folio: 2025-12345
Acción: ACTUALIZACIÓN
Detalle: Cambios en: Monto, Banco
Valores Anteriores: Monto: 500; Banco: BBVA
Valores Nuevos: Monto: 550; Banco: Santander
```

---

## 10. Funcionalidades Especiales

### 10.1. Hipervínculos en Folios

Los folios se convierten automáticamente en hipervínculos que apuntan a la carpeta del folio en Google Drive (si existe).

**Beneficios:**
- Acceso rápido a documentos del folio
- Verificación de tickets/comprobantes

### 10.2. Fórmulas en Cierres_Lotes

La hoja de cierres incluye fórmulas automáticas:

```
Total Folios = SUMIF('Conciliacion_Tarjetas'!H:H, [#Lote], 'Conciliacion_Tarjetas'!E:E)
Cuadra = IF(C=D, "✅", "❌")
```

### 10.3. Migración Automática

El sistema migra automáticamente la hoja antigua `Conciliacion_Bancaria` a `Conciliacion_Transferencias` si existe.

---

## 11. Ejecución y Triggers

### 11.1. Ejecución Automática

Configurar un trigger de tiempo en Google Apps Script:

1. Ir a **Extensiones > Apps Script**
2. Ir a **Triggers** (icono de reloj)
3. Agregar trigger:
   - Función: `sincronizarConciliacion`
   - Origen: Basado en tiempo
   - Tipo: Día específico
   - Hora: 22:00 - 23:00 (recomendado)

### 11.2. Ejecución Manual

Desde el editor de Apps Script:

1. Seleccionar función en el dropdown
2. Clic en "Ejecutar"
3. Revisar logs en "Ejecuciones"

### 11.3. Permisos Requeridos

El script necesita acceso a:
- Google Sheets (lectura/escritura)
- Google Drive (lectura de carpetas)

---

## 12. Solución de Problemas

### 12.1. Registros Duplicados

**Causa:** Bug en versiones anteriores (corregido en v2.0)

**Solución:**
1. Identificar duplicados por folio
2. Eliminar manualmente las filas duplicadas
3. Verificar que se está usando la versión actual del código

### 12.2. Hipervínculos No Aparecen

**Causa:** La carpeta del folio no existe en Drive o no tiene el nombre exacto del folio.

**Solución:**
1. Verificar que la carpeta existe en Drive
2. Verificar que el nombre coincide exactamente con el folio
3. Ejecutar `actualizarHipervínculosExistentes()`

### 12.3. Registro No Se Sincroniza

**Posibles causas:**
- Fecha fuera del rango de lookback (últimos 10 días)
- Método de pago no contiene "TRANSFERENCIA" ni "TARJETA"
- Folio vacío en el origen

**Solución:**
1. Verificar la fecha del registro
2. Verificar el método de pago
3. Para registros antiguos, usar `sincronizarRango()`

### 12.4. Error de Permisos

**Mensaje:** "No se pudo abrir el archivo origen/destino"

**Solución:**
1. Verificar que los IDs de archivo son correctos
2. Verificar que la cuenta tiene acceso a ambos archivos
3. Re-autorizar el script si es necesario

### 12.5. Registro en Hoja Equivocada

**Causa:** Cambio de método de pago en el origen

**Qué hacer:**
1. Revisar la hoja "⚠️ Revisión_Pendiente"
2. Si no está ahí, el registro se movió automáticamente (no tenía trabajo manual)
3. Verificar en la bitácora el movimiento

---

## 📎 Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `Code.gs` | Código fuente del sistema |
| `appsscript.json` | Configuración del proyecto |
| `GUIA_REVISION_PENDIENTE.md` | Guía para conciliadores |
| `ESPECIFICACIONES_FORMATOS.md` | Especificaciones de formatos de datos |
| `requerimientos.md` | Requerimientos originales del proyecto |

---

## 📞 Soporte

Para problemas técnicos o mejoras al sistema:
1. Revisar esta documentación
2. Revisar los logs de ejecución
3. Consultar la bitácora de cambios
4. Contactar al equipo de desarrollo

---

*Documentación generada para el Sistema de Sincronización para Conciliación Bancaria v2.0*

