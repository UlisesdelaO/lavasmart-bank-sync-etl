# 📋 Guía: Hoja de Revisión Pendiente

## ¿Qué es la hoja "⚠️ Revisión_Pendiente"?

Es una hoja especial que se crea automáticamente cuando el sistema detecta un **conflicto** que requiere tu atención manual.

## ¿Cuándo aparece un registro aquí?

Un registro aparece en esta hoja cuando:

1. **El método de pago cambió** en el sistema origen (ej: de Tarjeta a Transferencia, o viceversa)
2. **Y** el registro ya tenía trabajo de conciliación hecho:
   - ✅ Estaba marcado como "Conciliado"
   - 💳 Tenía un "Concepto Banco" registrado
   - 🔍 Tenía "Observaciones" escritas
   - 📦 (Para tarjetas) Tenía "Afiliación" o "# Lote" registrado

### ¿Por qué no se mueve automáticamente?

Para **proteger tu trabajo**. Si ya conciliaste un registro y el sistema lo moviera automáticamente, perderías:
- El concepto del banco que encontraste
- Tus observaciones
- El estado de conciliación

Por eso, el sistema lo envía a revisión para que **tú decidas** qué hacer.

---

## 📊 Columnas de la hoja

| Columna | Descripción |
|---------|-------------|
| **Timestamp** | Fecha y hora en que se detectó el conflicto |
| **Folio** | Número de folio del registro |
| **Conflicto** | Tipo de cambio detectado (ej: "Cambio método pago: TARJETA → TRANSFERENCIA") |
| **Hoja Origen** | De dónde venía el registro (Conciliacion_Tarjetas o Conciliacion_Transferencias) |
| **Hoja Destino** | A dónde debería ir según el nuevo método de pago |
| **Fecha, Cliente, Servicio, Monto, Banco** | Datos actualizados del registro |
| **¿Conciliado?** | Si estaba marcado como conciliado antes del cambio |
| **Concepto Banco** | El concepto que habías encontrado (o Afiliación/Lote para tarjetas) |
| **Observaciones** | Las observaciones que habías escrito |
| **Estado** | "Pendiente" (cámbialo a "Resuelto" cuando termines) |

---

## 🔧 ¿Qué hacer con un registro en revisión?

### Paso 1: Revisar el conflicto

1. Lee la columna **"Conflicto"** para entender qué cambió
2. Revisa los datos en las columnas **Fecha, Cliente, Servicio, Monto**
3. Verifica si el registro realmente cambió de método de pago o es un error

### Paso 2: Decidir la acción

Tienes **3 opciones**:

#### Opción A: El cambio es correcto → Mover manualmente

Si el método de pago realmente cambió y es correcto:

1. **Copia los datos** del registro (Fecha, Folio, Cliente, Servicio, Monto, Banco)
2. **Ve a la hoja destino** indicada en la columna "Hoja Destino"
3. **Agrega el registro** en esa hoja
4. **Restaura tu trabajo de conciliación:**
   - Marca "✅ Conciliado" si estaba marcado
   - Copia el "💳 Concepto Banco" que tenías
   - Copia las "🔍 Observaciones" que tenías
5. **Marca como "Resuelto"** en la columna Estado de la hoja de revisión

#### Opción B: El cambio es un error → Ignorar

Si el cambio de método de pago es un error del sistema origen:

1. **No hagas nada** en la hoja destino
2. **Marca como "Resuelto"** en la columna Estado
3. **Agrega una nota** en "Observaciones" de la hoja de revisión: "Error en origen, ignorado"

#### Opción C: Necesitas más información → Investigar

Si no estás seguro:

1. **Investiga** el folio en el sistema origen
2. **Consulta** con el equipo si es necesario
3. **Toma la decisión** (Opción A o B) una vez que tengas claridad

---

## ✅ Buenas prácticas

### 1. Revisa periódicamente

- Revisa la hoja **al menos una vez al día**
- Los registros pendientes se acumulan si no los resuelves

### 2. Mantén el estado actualizado

- Cambia el **Estado** a "Resuelto" cuando termines
- Esto ayuda a saber qué ya procesaste

### 3. Usa las observaciones

- Si decides ignorar un cambio, explica por qué en "Observaciones"
- Si hay dudas, déjalas anotadas para consulta posterior

### 4. No elimines filas

- **No borres** filas de la hoja de revisión
- Solo cambia el Estado a "Resuelto"
- Esto mantiene un historial de todos los conflictos

---

## ❓ Preguntas frecuentes

### ¿Qué pasa si no hago nada con un registro en revisión?

El registro **se queda en la hoja de revisión** hasta que lo resuelvas. No se moverá automáticamente.

### ¿Puedo mover varios registros a la vez?

Sí, puedes procesar varios registros en lote. Solo asegúrate de:
- Copiar todos los datos correctamente
- Restaurar el trabajo de conciliación en cada uno
- Marcar todos como "Resuelto"

### ¿Qué pasa si el registro aparece dos veces en revisión?

Esto no debería pasar, pero si ocurre:
- Revisa si son duplicados
- Si es el mismo registro, resuelve solo uno
- Si son diferentes, resuélvelos por separado

### ¿El sistema vuelve a mover registros que ya resolví?

No. Una vez que marcas un registro como "Resuelto", el sistema no lo volverá a procesar automáticamente.

---

## 📞 ¿Necesitas ayuda?

Si tienes dudas sobre cómo resolver un conflicto específico:

1. Revisa la **Bitácora de Cambios** para ver el historial
2. Consulta con tu supervisor
3. Verifica el folio en el sistema origen para confirmar los datos

---

## 📝 Resumen rápido

```
Registro en Revisión Pendiente
    ↓
¿El cambio de método de pago es correcto?
    ├─ SÍ → Copia a hoja destino + restaura conciliación → Marca "Resuelto"
    └─ NO → Ignora → Marca "Resuelto" con nota
```

**Recuerda:** El objetivo es proteger tu trabajo de conciliación y darte control sobre qué hacer cuando hay cambios inesperados.

