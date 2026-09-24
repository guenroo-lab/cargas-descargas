# Diseño: actualizar lista de cargadores + selección de varios cargadores por operación

## Contexto

App Cargas/Descargas Plataforma Málaga (TAISA). Pedro pide dos cambios relacionados:

1. Actualizar la lista fija de operarios: quitar "Ángel Alcázar", añadir "Juanlu" y "Alberto".
2. Permitir seleccionar **más de un cargador** (máximo 2) para una misma carga/descarga, de forma que cada uno se lleve **0,5** del crédito de esa operación en el ranking de rendimiento, en vez de que uno se lleve el crédito completo y el otro ninguno (o ambos el crédito completo, duplicado).

## Dónde impacta esto (investigación previa)

- El ranking **"Rendimiento por cargador (hoy)"** en `cargas.html` (sección `#rank`, función `pintarRank`) ya muestra Ops / Soportes / Min por persona, alimentado por `estado.porCargador` que calcula `obtenerEstado()` en `CargasDescargas.gs`. Es el único consumidor real de "crédito por persona" en la app — ahí es donde el reparto 0,5 debe aplicarse.
- Ya existe el patrón de selección múltiple en la misma pantalla: los **Flujos** (LS/CC/SIE/Inversa) se seleccionan como chips múltiples y se guardan como texto unido por comas (`datos.flujos.join(', ')`). Se reutiliza el mismo patrón para Cargador, sin cambiar la estructura de columnas de `EnCurso` ni `Registros`.

## Cambios

### 1. Lista de operarios (`CargasDescargas.gs`)
```js
const OPERARIOS_CARGAS = ['Manuel Rosas', 'Sergio Sánchez', 'Antonio Sánchez', 'Juanlu', 'Alberto'];
```

### 2. UI — selección múltiple con máximo 2 (`cargas.html`)
- El campo "Cargador" del modal Iniciar pasa de chip único a **chips múltiples** (máx. 2 marcados). Intentar marcar un tercero muestra aviso "Máximo 2 cargadores por operación" y no lo añade.
- El campo de texto libre "Otro cargador" deja de **sustituir** la selección de chips y pasa a **añadirse** como persona adicional (respetando el máximo de 2 combinados). Se deduplica por si acaso coincide con un nombre ya marcado.
- `selIni.cargador` (string) pasa a ser `selIni.cargadores` (array de 1–2 strings).

### 3. Envío y guardado
- `iniciarOperacion()` recibe `datos.cargadores` (array). Se valida que ninguno de los nombres esté ya operando en otro muelle (recorre `EnCurso`, separando por coma el campo Cargador de cada fila existente para comparar nombre a nombre).
- Se escribe en `EnCurso`/`Registros` la columna Cargador como `cargadores.join(', ')` — ej. `"Juanlu, Alberto"`. Sin cambios de esquema en las hojas.
- `finalizarOperacion()` no necesita cambios: ya copia el campo Cargador de `EnCurso` a `Registros` tal cual.

### 4. Reparto de crédito en el ranking (`obtenerEstado()` en `CargasDescargas.gs`)
Al recorrer `Registros` para construir `porCargador`, el campo Cargador de cada fila se separa por coma. Si hay **N** nombres (1 o 2):
- cada nombre suma `1/N` a `ops`
- cada nombre suma `(soportes de la fila)/N` a `soportes`
- cada nombre suma `(duración de la fila)/N` a `min`

Con 1 cargador (caso normal, sin cambios): crédito completo, igual que hoy.
Con 2 cargadores: 0,5 ops y mitad de soportes/min cada uno. El promedio "Min/operación" (`min/ops`) no varía, matemáticamente se simplifica igual repartido o no.

### 5. Render del ranking (`pintarRank` en `cargas.html`)
Los valores de `ops` y `soportes` pueden ahora ser fraccionarios (ej. `3.5`). Se redondean a 1 decimal al mostrarlos para evitar artefactos de coma flotante (`3.5000000000000004`). "Min/operación" sigue siendo un entero redondeado, sin cambios.

## Fuera de alcance
- No se toca el envío de correo Mijas 6:30 ni el nombre de archivo de fotos en Drive: ninguno de los dos depende de si el campo Cargador tiene uno o dos nombres, siguen funcionando igual (mostrarán/usarán el texto combinado tal cual si aplica).
- No se permiten más de 2 cargadores por operación (confirmado con Pedro).
