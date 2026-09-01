# SIM-CD · Simulador de Cadena de Suministro

Simulador web e interactivo de una cadena **Planta → Centro de Distribución → Clientes**,
pensado para que estudiantes experimenten con políticas de inventario, capacidad de
producción, flotas de transporte y su impacto en costos y nivel de servicio.

Sin dependencias, sin build, sin instalación: HTML + CSS + JavaScript puro.

---

## 1. Cómo ejecutarlo

### Opción A — abrir el archivo directamente
Doble clic en `index.html`. Funciona porque no se usan módulos ES ni `fetch`.

### Opción B — Visual Studio Code + Live Server (recomendada)
1. `Archivo → Abrir carpeta…` y elegir `simulador-cadena-suministro`.
2. Instalar la extensión **Live Server** (autor: Ritwick Dey) desde el panel de extensiones.
3. Clic derecho sobre `index.html` → **Open with Live Server**.
4. Se abre en `http://127.0.0.1:5500`. Al guardar un archivo, la página se recarga sola.

### Opción C — servidor con Python (ya incluido en VS Code sin extensiones)
```bash
python -m http.server 5500
```
Luego abrir `http://localhost:5500`.

---

## 2. Estructura del proyecto

| Archivo | Rol |
|---|---|
| `index.html` | Estructura de la página: barra, lienzo, gráficos, tarjetas de KPI. |
| `css/styles.css` | Tema oscuro, grilla de 3 columnas, componentes. |
| `js/sim.js` | **Motor de simulación**: reloj, entidades, políticas, costos, KPIs y modelo teórico. |
| `js/view.js` | Dibujo del mapa animado en canvas y mini-librería de gráficos. |
| `js/app.js` | Interfaz: genera los controles desde un esquema, cablea botones y refresca todo. |
| `pruebas.html` · `js/pruebas.js` | Batería de 43 pruebas del motor. Ábrela para verificar que nada se rompió. |

Para agregar un parámetro nuevo basta con:
1. Añadirlo a `PARAMS_DEFAULT` en `js/sim.js`.
2. Usarlo en la lógica del motor.
3. Agregar una entrada al arreglo `ESQUEMA` en `js/app.js` — el control se genera solo.

---

## 3. El modelo

Simulación por pasos de tiempo con reloj continuo (para animar) y **eventos discretos al
inicio de cada día**, en este orden:

1. **Producción** — la planta fabrica hasta su capacidad diaria para alcanzar su stock objetivo.
2. **Pronóstico** — el CD estima la demanda del día *antes* de verla.
3. **Demanda** — cada zona genera demanda aleatoria (Normal, Poisson o determinística).
4. **Corrección de la previsión** — el CD actualiza D̂ y σ̂ con lo observado.
5. **Política dinámica** — se recalculan *s*, *Q* y *S* si hay previsión activa.
6. **Despacho a clientes** — el CD carga camiones respetando la regla de consolidación.
7. **Revisión de inventario** — política *(s, Q)* continua o *(R, S)* periódica.
8. **Reposición** — la planta despacha camiones al CD con lead time estocástico.
9. **Faltantes** — se mide la parte de la demanda que el CD no puede cubrir.
10. **Costos** — mantención, pedido, quiebre, transporte, producción y setup.

Los camiones se recargan apenas quedan libres: el despacho es continuo, no solo diario.

### Conceptos clave modelados
- **Posición de inventario** = disponible + en tránsito + pendiente de envío − backorders.
- **Faltante real** vs **espera por consolidación**: un pedido que solo aguarda su camión
  no es quiebre; solo lo es la parte que el CD no puede cubrir con stock.
- **Ley de Little** (`W = L / λ`) para la espera media del pedido.
- **Efecto látigo** medido eslabón por eslabón sobre series agregadas por semana.

### Dos preguntas distintas que no hay que mezclar
El simulador las mide por separado, a propósito:

| Pregunta | Indicador | De qué depende |
|---|---|---|
| ¿Había stock cuando llegó el pedido? | **Fill rate** | política de inventario, lead time, producción |
| ¿Cuánto tardó en llegarle al cliente? | **Espera media** | flota, consolidación de carga, distancias |

El escenario 5 (flota insuficiente) lo deja claro: fill rate **98,7%** —el CD tenía stock
de sobra— con una espera de **33,7 días**, porque un solo camión no da abasto. Un único
indicador mezclado escondería el diagnóstico y llevaría a comprar inventario cuando lo que
falta son camiones.

### Tipo 1 y tipo 2: no son lo mismo
- **Servicio de ciclo (tipo 1)**: probabilidad de *no* quebrar durante un ciclo de
  reposición. Es lo que fija la `z` del stock de seguridad.
- **Fill rate (tipo 2)**: fracción de la demanda que encuentra stock al llegar.

El tipo 2 siempre sale más alto, porque cuando ocurre un quiebre normalmente falta solo una
parte de la demanda del ciclo. Con esta configuración, un objetivo de ciclo del 70% ya
implica un fill rate del 98%. Por eso el control dice explícitamente *tipo 1* y la línea de
referencia del gráfico de servicio es el **fill rate esperado por la fórmula**, no el
objetivo de ciclo.

### El sub-disparo (undershoot)
El inventario se revisa una vez al día, no de forma continua: cuando el CD detecta que la
posición cayó bajo `s`, ya la sobrepasó. En promedio la sobrepasa **D·R/2** (media revisión
de demanda). Medido en el simulador: 46,2 u contra 50,0 u teóricas.

Ignorarlo hace que el punto de reorden entregue *menos* servicio del prometido, así que el
panel teórico lo incorpora:

```
s* = D·L + z·σ_LT + D·R/2
```

---

## 3 bis. Estacionalidad, promociones y efecto látigo

La demanda diaria de cada zona es `μ · f(t) + ruido`, donde **f(t) es la parte predecible**:

```
f(t) = tendencia(t) × estacionalidad(t) × día-de-semana(t) × promoción(t)
```

- **Estacionalidad**: `1 + A·sen(2πt/T)`.
- **Día de semana**: perfil retail (viernes ×1,25, sábado ×1,45, lunes ×0,85).
- **Promoción**: peak de `uplift` veces durante la campaña y **resaca** posterior,
  porque parte de esa venta fue compra adelantada (*forward buying*).
- La varianza crece con el nivel (`σ_t = σ·√f`), como en un proceso de Poisson.

### De dónde sale el efecto látigo
El CD **no observa la demanda futura, la estima**. Con previsión activa (media móvil o
suavizamiento exponencial) recalcula cada día su punto de reorden:

```
s = D̂ · H  +  z · σ̂_LT
```

Un peak de promoción sube `D̂` y `σ̂`, eso sube `s`, y eso dispara una orden mucho mayor
que el peak que la originó. La cadena amplifica. El panel *Amplificación por etapa*
compara el coeficiente de variación semanal de **demanda del cliente → órdenes del CD →
producción de la planta**.

### Las tres palancas que el estudiante puede mover
1. **Reactividad de la previsión** — `α` alto o ventana corta ⇒ más látigo.
2. **Información compartida** — si el CD conoce el calendario de promociones,
   desestacionaliza lo observado y deja de confundir el peak con un cambio de nivel.
3. **Anticipación (pre-build)** — conocer el calendario no basta: la planta no alcanza a
   fabricar el peak. Hay que acumular stock *antes* de la campaña.

Resultados del horizonte de 180 días con la semilla 42, comparando los escenarios 10 y 11:

| Configuración | Error previsión | Látigo CD | Fill rate | Margen |
|---|---|---|---|---|
| Sin coordinar | 60,7% | 2,93× | 77,1% | −$15.406 |
| CD informado, anticipación 0 | 13,5% | 1,31× | 66,6% | −$37.630 |
| CD informado, anticipación 5 | 13,3% | 1,73× | 89,2% | +$69.036 |
| CD informado, anticipación 10 | 14,2% | 2,60× | 96,2% | **+$77.016** |
| CD informado, anticipación 14 | 14,5% | 2,99× | 99,0% | +$67.987 |

Cuatro lecciones salen de esta tabla:
- Compartir información **por sí sola** arregla el pronóstico (60,7% → 13,5% de error) pero
  no mueve el dinero.
- Peor aún: en esta configuración, **saber sin actuar es peor que no saber** (−$37.630 vs
  −$15.406). El pronóstico acertado deja al CD trabajando ajustado justo cuando necesitaba
  colchón, mientras que el CD ignorante acumulaba stock por error y eso lo protegía. Un
  accidente afortunado no es una política, pero explica por qué muchos proyectos de
  "compartir datos" no muestran retorno.
- La ganancia aparece al **actuar** sobre esa información: pre-construir stock antes de la
  campaña.
- Hay un **óptimo interior** cerca de los 10 días: más anticipación cuesta más inventario
  del que ahorra. Y el látigo *sube* al pre-construir — porque ahora se pide en tandas
  grandes pero **planificadas**. Variabilidad planificada no es lo mismo que variabilidad
  sufrida.

### Modelo matemático de referencia
El panel derecho calcula, en paralelo a la simulación, el óptimo analítico:

- Lote económico: `Q* = √(2·D·K / h)`
- Desviación en el lead time: `σ_LT = √(L·σ_d² + D²·σ_L²)`
- Stock de seguridad: `SS = z·σ_LT`, con `z = Φ⁻¹(nivel de servicio)`
- Punto de reorden: `s* = D·L + SS`
- Nivel objetivo: `S* = D·(L+R) + z·σ_{L+R}`
- Fill rate esperado: `1 − σ_LT·G(z)/Q`

El botón **Aplicar valores óptimos** lleva esos resultados al simulador, para contrastar
la teoría con lo que realmente ocurre.

---

## 3 ter. Comparador A / B

Comparar de memoria dos corridas no funciona: son doce indicadores y cinco gráficos. El
panel **Comparación A / B** lo resuelve.

1. Corre una configuración y pulsa **📌 Fijar corrida actual como A** (si no has simulado
   nada, corre el horizonte completo sola).
2. Cambia lo que quieras y vuelve a simular: eso es **B**.
3. Los gráficos superponen A en **gris punteado**, las barras de costo y de amplificación
   muestran una **marca blanca** con el valor de A, y la tabla contrasta los indicadores.

La columna Δ se colorea según la **dirección de mejora** de cada indicador: verde si B es
mejor que A, rojo si es peor, gris si el indicador no tiene una dirección obvia (como la
utilización de la flota, donde ni muy alta ni muy baja es buena).

Debajo de la tabla aparece **qué parámetros cambiaron** entre A y B. Esa lista es la parte
más importante para la clase: obliga a mover **una palanca a la vez** y a poder atribuir el
resultado. Si el estudiante tocó ocho cosas, la lista se lo muestra y la conclusión pierde
valor.

### Guardas contra comparaciones tramposas
El panel avisa cuando la comparación no es legítima:
- **Semillas distintas** — parte de la diferencia es azar, no la decisión tomada.
- **Días distintos** — comparar una corrida de 180 días contra una de 60 no significa nada.
- **Horizontes distintos** entre A y B.

Además, si la corrida ya terminó, cualquier cambio de parámetro reinicia la simulación:
así los indicadores en pantalla siempre corresponden a los parámetros en pantalla.

El botón **Descargar comparación (CSV)** exporta ambas series lado a lado
(`demanda_A, orden_A, inv_cd_A, … , demanda_B, orden_B, inv_cd_B, …`) para graficarlas en
Excel o R.

Ejemplo de lo que ve el estudiante al activar solo la consolidación de carga sobre el
escenario base:

| Indicador | A | B | Δ |
|---|---|---|---|
| Fill rate | 98,7% | 98,7% | = |
| Espera del pedido | 0,69 d | 2,05 d | +1,36 d |
| Inventario promedio | 311 u | 448 u | +137 u |
| Costo total | $410.264 | $359.621 | −$50.644 |
| Margen | $57.502 | $102.191 | **+$44.690** |
| Uso flota de reparto | 89,2% | 30,3% | −58,9% |

No hay almuerzo gratis: el margen sube $44.690 **a cambio** de que el cliente espere el
triple. Fíjate en que el fill rate **no se mueve**: el stock estaba disponible en ambos
casos, lo que cambió fue cuándo salió el camión. Por eso el simulador separa las dos
preguntas (ver más abajo). Si el intercambio conviene depende de en qué negocio estás — y
esa discusión es justamente el objetivo.

---

## 4. Guía para trabajar en clase

La semilla aleatoria fija la demanda: **misma semilla + distinta política = comparación
justa**. Cambiarla genera otra realización del mismo proceso (útil para ver variabilidad).

Preguntas que el simulador permite responder experimentalmente:

1. ¿Cuánto sube el costo total si se exige 99% de servicio en vez de 95%?
2. ¿Qué conviene más: más camiones (rápido y caro) o consolidar carga (barato y lento)?
   Comparar los escenarios 1 y 2 con `cargaMinimaPct` y `esperaMaxima`.
3. Con lead time incierto, ¿crece más el stock de seguridad por `σ_d` o por `σ_L`?
4. ¿Por qué la política *(s, Q)* genera más efecto látigo que *(R, S)*?
5. Si la capacidad de la planta cae bajo la demanda media, ¿qué KPI se rompe primero?
6. ¿Cómo cambian las conclusiones al pasar de backorder a venta perdida?

Sobre estacionalidad y promociones (escenarios 9 a 12):

7. Con estacionalidad marcada y `s`/`Q` **fijos**, ¿en qué momento del ciclo se rompe el
   servicio y en cuál sobra inventario? ¿Lo arregla activar la previsión?
8. Mantén todo fijo y baja `α` de 0,6 a 0,1. ¿Qué le pasa al látigo y al inventario?
   ¿Por qué mejora el uno y empeora el otro?
9. El panel teórico informa qué porcentaje de la variabilidad viene del **patrón**. Si el
   80% es predecible, ¿tiene sentido cubrirlo con stock de seguridad?
10. Compara los escenarios 10 y 11 (misma semilla). ¿Cuánto del beneficio viene de
    *saber* y cuánto de *actuar* con anticipación?
11. Busca la anticipación óptima moviendo el control de 0 a 21 días. ¿Por qué existe un
    óptimo interior en vez de "mientras más, mejor"?
12. En el escenario 12, la producción de la planta tiene **menos** variabilidad que las
    órdenes del CD. ¿Es buena noticia? (Pista: mira el nivel de servicio y los pendientes.)

### Ejercicio guiado con el comparador A/B

Una sesión de laboratorio que funciona bien:

1. Fija el escenario **1 · Base equilibrado** como A.
2. Cambia **una sola palanca** y corre B. Anota los tres indicadores que más se movieron.
3. Vuelve a A (**Actualizar A** o reelige el escenario 1) y repite con otra palanca.
4. Al final, cada grupo presenta **una** recomendación y debe defenderla con la tabla Δ,
   nombrando explícitamente qué sacrificó para conseguirla.

Palancas que dan discusiones interesantes: consolidación de carga, número de camiones de
reparto, nivel de servicio objetivo, `α` de la previsión, y anticipación de la campaña.

Regla de la casa: **si la lista de cambios tiene más de una línea, la conclusión no vale.**

El botón **Descargar datos (CSV)** exporta la serie diaria completa para analizarla en
Excel, R o Python.

---

## 5. Pruebas del motor

Abre **`pruebas.html`** (mismo servidor, o doble clic). Corre 43 pruebas en menos de medio
segundo y muestra el detalle numérico de cada una. Úsala cada vez que toques `sim.js`.

| Grupo | Qué verifica |
|---|---|
| 1 · Conservación | Que no se pierdan ni se inventen unidades. Se comprueba día a día, no solo al final: `stock inicial + producido = planta + tránsito + CD + camiones + entregado`. Además: demanda = servida + perdida + pendiente, inventarios no negativos, camiones dentro de su capacidad, costos monótonos. |
| 2 · Determinismo | Misma semilla ⇒ resultado idéntico; semillas distintas ⇒ resultado distinto; el resultado no depende del tamaño del paso; el avance animado coincide con "Al final"; ningún KPI es NaN en los 12 escenarios ni en 8 configuraciones límite. |
| 3 · Propiedades | Que el modelo responda en la dirección correcta: más camiones ⇒ menos espera; mayor `s` ⇒ más inventario y mejor servicio; mayor lead time ⇒ peor servicio; `α` más alto ⇒ más látigo; consolidar ⇒ menos transporte y más espera; planta insuficiente ⇒ sistema inestable. |
| 4 · Teoría vs simulación | Que las fórmulas del panel predigan lo que el simulador hace: fill rate esperado, utilización de planta, EOQ como mínimo de costo, ley de Little, y que el `s*` teórico entregue de verdad el servicio prometido. |
| 5 · Casos borde | 1 y 6 zonas, demanda cero, σ = 0, horizontes mínimo y máximo, campaña más larga que su periodo, resaca extrema, un solo camión, cadencia de (R,S), integridad del CSV. |

Los números que imprime cada prueba son tan útiles como el verde o el rojo. Por ejemplo, la
prueba de fill rate reporta:

```
s=320: teoría 92,0% vs real 92,7%   |   s=400: teoría 99,9% vs real 99,7%
```

Esa coincidencia es la que justifica usar el panel teórico como guía. Y donde la fórmula se
degrada —con `s` muy bajo, en quiebre profundo— la prueba también lo muestra (4,7 puntos de
diferencia), que es exactamente el tipo de límite que conviene discutir en clase.

---

## 6. Atajos

- `Espacio` — iniciar / pausar
- **1 día** — avanzar un solo día (útil para explicar la secuencia de eventos)
- **Al final** — correr el horizonte completo al instante
