```python?code_reference&code_event_index=2
import pandas as pd

# Load the dataframe to check column indices
df = pd.read_csv('[2025] Corte de Ventas Diarias Lavasmart - Noviembre.csv', header=1)

# Get the index of 'Servicio (s)'
try:
    servicio_index = df.columns.get_loc('Servicio (s)')
    print(f"Index of 'Servicio (s)': {servicio_index}")
    # Also verify the other columns mentioned to be sure
    print(f"Index of '❌✏️ Folio': {df.columns.get_loc('❌✏️ Folio')}")
    print(f"Index of '❌✏️ Fecha': {df.columns.get_loc('❌✏️ Fecha')}")
    print(f"Index of 'Cliente': {df.columns.get_loc('Cliente')}")
    print(f"Index of '❌✏️Costo Total (Base + Adicionales + Propinas)': {df.columns.get_loc('❌✏️Costo Total (Base + Adicionales + Propinas)')}")
    print(f"Index of 'Metodo de Pago': {df.columns.get_loc('Metodo de Pago')}")
    print(f"Index of 'Banco': {df.columns.get_loc('Banco')}")
except KeyError as e:
    print(f"Column not found: {e}")
    print("Columns available:", df.columns.tolist())

```

```text?code_stdout&code_event_index=2
Index of 'Servicio (s)': 28
Index of '❌✏️ Folio': 1
Index of '❌✏️ Fecha': 2
Index of 'Cliente': 3
Index of '❌✏️Costo Total (Base + Adicionales + Propinas)': 9
Index of 'Metodo de Pago': 16
Index of 'Banco': 18

```

Aquí tienes el **Documento de Especificación de Requerimientos de Software (SRS)** formalizado para entregar a tu equipo de desarrollo o programador.

Este documento define **qué** debe hacer el sistema sin entrar en el código de **cómo** hacerlo, estableciendo las reglas de negocio, la seguridad de la información y la estructura exacta de los datos.

-----

# 📄 Especificación de Requerimientos: Sistema de Sincronización para Conciliación Bancaria (ETL Remoto)

**Proyecto:** Automatización de Cruce de Ventas (Operaciones) vs. Bancos
**Fecha:** 21 de Noviembre de 2025
**Versión:** 1.0
**Alcance:** Desarrollo de un script de sincronización unidireccional entre dos hojas de cálculo de Google Sheets independientes.

-----

## 1\. Objetivo del Proyecto

Implementar un sistema automatizado que extraiga diariamente los registros de ventas pagadas por "Transferencia" desde una hoja de **Operaciones (Remota)** y los inserte o actualice en una hoja de **Conciliación Bancaria (Local)**.
El sistema debe garantizar la integridad de los datos, evitando duplicados y protegiendo las anotaciones manuales realizadas por el auditor en la hoja de destino.

-----

## 2\. Arquitectura de la Solución

El sistema operará bajo un modelo de **Extracción, Transformación y Carga (ETL)** remoto:

1.  **Fuente de Datos (Origen):** Archivo Google Sheets "Operaciones Lavasmart" (Lectura).
2.  **Destino de Datos (Destino):** Archivo Google Sheets "Conciliación Bancaria" (Escritura controlada).
3.  **Motor de Procesamiento:** Google Apps Script alojado exclusivamente en el archivo de **Destino**.

-----

## 3\. Especificaciones de la Fuente de Datos (Origen)

El desarrollador deberá conectar el script al archivo de operaciones utilizando su **ID único**.

  * **ID del Archivo Origen:** `1tCBxGhgacUAWNbPaAuCMIp0w3Nn-Lc6m7DHtUneO54o`
  * **Estructura de Pestañas:** El archivo origen contiene pestañas nombradas por mes (ej. "Noviembre", "Diciembre", "Enero"). El sistema debe ser capaz de identificar dinámicamente en qué pestaña buscar según la fecha del registro.
  * **Disposición de los Datos:** Los datos comienzan a partir de la **Fila 2** (La fila 1 contiene encabezados).

-----

## 4\. Mapa de Columnas (Data Mapping)

Esta es la guía exacta de qué columnas se deben leer del origen y dónde se deben escribir en el destino.

> **Nota para Desarrollo:** Los índices de columna están basados en base-0 (A=0, B=1, etc.) para facilitar la programación, pero se indica la letra de la columna para referencia visual.

| Nombre del Campo | Columna Origen (Letra) | Índice Origen (0-based) | Tipo de Dato | Columna Destino (Letra) | Función en el Sistema |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Folio** | **B** | `1` | String | **B** | **Llave Primaria (Key)**. Identificador único para evitar duplicados. |
| **Fecha de Venta** | **C** | `2` | Date | **A** | Dato informativo y criterio de búsqueda. |
| **Cliente** | **D** | `3` | String | **C** | Dato informativo. |
| **Servicio(s)** | **AC** | `28` | String | **D** | **Nuevo Campo**. Descripción del servicio para referencia. |
| **Banco** | **S** | `18` | String | **E** | Dato crítico para cruce bancario. Actualizable. |
| **Costo Total** | **J** | `9` | Currency | **F** | Dato crítico para conciliación. Actualizable. |
| **Método de Pago** | **Q** | `16` | String | *N/A* | **Filtro Crítico**. Solo se procesan filas donde este valor contenga "TRANSFERENCIA". |

-----

## 5\. Especificaciones del Destino de Datos (Conciliación)

El archivo de destino debe tener una estructura protegida para garantizar que el robot no sobrescriba el trabajo humano.

  * **ID del Archivo Destino:** `13JwPsTMdhkeRwcYsaf99t7QMvRApU-31YIrTVL7UQGo`
  * **Zona Horaria:** `America/Mexico_City` (GMT-6)

### 5.1. Estructura de la Hoja "Conciliacion\_Bancaria"

El script debe escribir **exclusivamente** en el rango de columnas **A:F**.

  * **Columna A:** Fecha
  * **Columna B:** Folio
  * **Columna C:** Cliente
  * **Columna D:** Servicio (s)
  * **Columna E:** Banco
  * **Columna F:** Monto

### 5.2. Zona de Protección Humana (Zona Intocable)

Las siguientes columnas son propiedad exclusiva del auditor/conciliador. El script **tiene prohibido** escribir, borrar o modificar celdas en estas columnas:

  * **Columna G:** `✅ Conciliado` (Checkbox) - Indica si el registro ha sido conciliado con el banco
  * **Columna H:** `💳 Concepto Banco` (Texto libre) - Concepto encontrado en el banco para facilitar el match y la conciliación
  * **Columna I:** `🔍 Observaciones` (Texto libre) - Notas y observaciones del conciliador

-----

## 6\. Lógica de Negocio y Reglas de Sincronización

### 6.1. Regla de Extracción (Lookback Window)

El sistema no debe limitarse a copiar "lo de ayer". Para cubrir fines de semana, días festivos o retrasos en la captura:

  * El script debe barrer y analizar siempre los registros de los **últimos 5 días naturales** con respecto a la fecha de ejecución.

### 6.2. Regla de Filtrado

  * Se deben ignorar todas las filas donde la columna `Metodo de Pago` (Índice 16) **NO** contenga la palabra "TRANSFERENCIA" (insensible a mayúsculas/minúsculas).

### 6.3. Lógica de "Upsert" (Insertar o Actualizar)

Para cada registro encontrado en el origen que cumpla los filtros, el sistema debe realizar la siguiente validación contra la base de datos local (Destino):

1.  **Buscar el Folio (Key):**

      * **Escenario A (Nuevo):** Si el Folio no existe en la hoja de Conciliación → **INSERTAR** una nueva fila al final con los datos de las columnas A-F.
      * **Escenario B (Existente):** Si el Folio ya existe → **COMPARAR** los valores de `Monto` y `Banco`.

2.  **Criterio de Actualización (Sincronización):**

      * Si el Folio existe pero el `Monto` o `Banco` son diferentes en el origen (porque hubo una corrección operativa) → **SOBRESCRIBIR** solo las celdas de las columnas A-F de esa fila específica.
      * **Importante:** Al sobrescribir, se deben mantener intactos los valores de las columnas G, H e I (Conciliado/Observaciones/Concepto Banco).

-----

## 7\. Requerimientos de Auditoría (Bitácora)

El sistema debe generar un rastro de evidencia (Log) cuando se modifiquen datos históricos.

  * **Hoja de Log:** `📝 Bitácora_Cambios`
  * **Disparador:** Se escribe un registro solo cuando ocurre una **Actualización** (Escenario B donde hubo cambios).
  * **Datos a registrar:**
      * Timestamp (Fecha/Hora)
      * Folio afectado
      * Campo modificado (ej. "Monto cambió")
      * Valor Anterior
      * Valor Nuevo

-----

## 8\. Requerimientos No Funcionales

1.  **Automatización:** El script debe configurarse con un activador de tiempo (Trigger) para ejecutarse automáticamente una vez al día (sugerido: 22:00 hrs).
2.  **Idempotencia:** La ejecución múltiple del script el mismo día no debe generar registros duplicados.
3.  **Manejo de Errores:** El sistema debe fallar de manera silenciosa o notificar en consola si falta una hoja mensual, sin detener la ejecución de todo el proceso.
4.  **Creación Automática de Hoja:** Si la hoja "Conciliacion_Bancaria" no existe, el script la crea automáticamente con todos los encabezados y formatos necesarios.
5.  **Respeto de Formatos:** El script respeta los formatos exactos del archivo origen:
    * Fechas: Formato `d/M/yyyy` (ej: `16/11/2025`)
    * Montos: Formato de moneda mexicana `$#,##0.00` (ej: `$1,200.00`)
    * Strings: Preservación exacta del contenido original

-----

## 9\. Entregables Esperados

1.  Código `.gs` (Google Apps Script) implementado en el archivo de Conciliación.
2.  Configuración de los IDs de archivo origen.
3.  Configuración de los Triggers de automatización.
4.  Prueba de concepto (copiar un registro, modificarlo en origen y verificar su actualización en destino sin pérdida de notas).