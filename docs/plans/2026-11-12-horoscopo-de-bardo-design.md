# Diseño: Horóscopo de Bardo

**Fecha:** 2026-11-12 · **Autor:** Sergio (Ogires) con Claude
**App nº 7 de la factoría** · Dominio: `bardo.webninja.fyi` · Coste objetivo: 0 €

---

## 1. Visión

**Horóscopo de Bardo** publica cada día el horóscopo de doce lenguajes de programación, escrito por un bardo pesimista. Tu signo es tu lenguaje.

Es la primera app de la factoría con **tarea programada (cron)**, **API pública documentada** y **bot**:
- Un cron genera las doce profecías una vez al día con una sola llamada a un LLM. Las visitas no gastan IA.
- Una **API pública** (JSON, CORS abierto, OpenAPI) sirve el día de hoy y el archivo.
- Una **tarjeta SVG** con la profecía diaria de tu lenguaje, para pegar en el README de tu perfil de GitHub.
- Un **canal público de Telegram** recibe el horóscopo cada mañana.

Ejemplo de profecía:

> **Rust** · «Hoy el compilador os hablará con crueldad, y tendrá razón. Un lifetime que creíais domado volverá a por vos antes de la comida.»
> Puerto de la suerte: 8080 (HTTP alternativo) · Compatible con: Go, a regañadientes · Evita: hacer `clone()` para callarlo

El diseño se revisó antes de construirlo con dos modelos externos (Gemini y GLM). De esa revisión salen, entre otros, el horario del cron, la caché de la tarjeta y la decisión de no usar un moderador.

## 2. Alcance de la primera versión

1. **Doce signos:** Rust, JavaScript, Python, Java, C#, Go, PHP, COBOL, TypeScript, SQL, Kotlin y Haskell.
2. **Cada profecía tiene cuatro campos:** el texto del Bardo (dos o tres frases), el puerto de la suerte con su servicio, «Compatible con» (otro de los doce signos con un matiz) y «Evita» (lo que conviene evitar hoy).
3. **Web:** portada con los doce signos de hoy, una página por signo (`/rust`) con el fragmento para el README listo para copiar, y un archivo por fecha (`/h/2026-11-12`). Una og:image general de 1200×627.
4. **API pública:** `/api/v1/signos`, `/api/v1/hoy`, `/api/v1/signos/{signo}` y `/api/v1/dias/{fecha}`, con CORS abierto y un `openapi.json`.
5. **Tarjeta SVG** (`/tarjeta/rust.svg`) para el README de GitHub, en modo claro y oscuro.
6. **Canal de Telegram:** un mensaje diario con los doce signos y el enlace a la web. El mismo bot avisa por privado al administrador si algo falla.
7. **Respaldo:** un banco de profecías escritas de antemano para cuando falle la IA.

Lo que queda fuera está en la sección 13.

## 3. Arquitectura

Un único Worker de Cloudflare con assets, como el resto de la factoría.

```
            ┌──────────── Worker horoscopo-de-bardo ─────────────┐
 cron ────► │ scheduled: generar(mañana) ─► Z.ai ─► validar ─► D1 │
            │            publicar(hoy) ──────────────► Telegram   │
            │                                                     │
 visitas ─► │ fetch: web SSR · /api/v1/* · /tarjeta/*.svg ◄── D1  │
            └────────────────────────────────────────────────────┘
```

**El cron escribe y todo lo demás solo lee.** Ninguna visita llama a la IA.

### 3.1 El día del Bardo

El «día» es el de Madrid (`Europe/Madrid`, con horario de verano). Los crons de Cloudflare van en UTC, así que el Worker calcula la fecha con `Intl.DateTimeFormat`.

El día siguiente se genera la víspera, pero **no se sirve hasta la medianoche de Madrid**: ni la web, ni la API, ni la tarjeta enseñan una fecha posterior a hoy.

### 3.2 Horario del cron

Una sola expresión, `0 21,22,7,8 * * *` (UTC). El Worker decide qué hacer según `controller.scheduledTime`:

| Hora UTC | En Madrid (invierno / verano) | Tarea |
|---|---|---|
| 21:00 | 22:00 / 23:00 | **Generar** el día de Madrid que empieza en unas horas |
| 22:00 | 23:00 / 00:00 | **Reintento.** Si el día ya existe, no hace nada. Si no, vuelve a llamar a la IA y, si falla otra vez, guarda el día con el banco y avisa al administrador |
| 07:00 | 08:00 / 09:00 | **Publicar** el día de hoy en Telegram. Si ya se publicó, no hace nada |
| 08:00 | 09:00 / 10:00 | **Reintento de Telegram.** Si vuelve a fallar, avisa al administrador |

La fecha objetivo de la generación es **la fecha de Madrid 4 horas después de la hora programada**. Las dos ejecuciones caen antes de la medianoche de Madrid o justo en ella, con horario de invierno y de verano.

Todas las tareas son **idempotentes**: repetirlas no duplica nada.

### 3.3 Estructura del repo

```
src/
  index.ts             fetch + scheduled
  fecha.ts             día de Madrid, fecha objetivo, validación de fechas
  signos.ts            los doce signos (slug, nombre, emoji, alias)
  generar/
    prompt.ts          prompt del sistema y del día
    cadena.ts          GLM-5.3 (Z.ai) → banco
    validar.ts         longitudes, palabras vetadas, repeticiones
    sorteo.ts          gancho, puerto y compatible deterministas por fecha
    banco.ts           elección determinista del banco
  telegram.ts          publicación en el canal y avisos al administrador
  web/                 plantillas HTML (SSR)
  api.ts
  tarjeta.ts           SVG
data/
  banco.json           profecías escritas de antemano (7 por signo)
  ganchos.json         hechos ciertos de cada lenguaje (15 por signo)
  matices.json         matices de reserva para «Compatible con» (10)
  puertos.json         puertos con su servicio (8080, 5432, 6379…)
public/                CSS, fuentes, og.png, openapi.json, favicon
migrations/0001_inicial.sql
```

## 4. Modelo de datos (D1)

Una fila por día:

```sql
CREATE TABLE dias (
  fecha        TEXT PRIMARY KEY,   -- 'AAAA-MM-DD', día de Madrid
  profecias    TEXT NOT NULL,      -- JSON: 12 objetos (ver abajo)
  modelo       TEXT,               -- id del modelo ('zai:glm-5.3') | NULL si todo es del banco
  creado_ms    INTEGER NOT NULL,
  telegram_ms  INTEGER             -- NULL: sin publicar · -1: publicando · >0: publicado
);
```

Cada profecía:

```json
{
  "signo": "rust",
  "texto": "Hoy el compilador os hablará con crueldad…",
  "puerto": { "numero": 8080, "servicio": "HTTP alternativo" },
  "compatible": { "signo": "go", "matiz": "a regañadientes" },
  "evita": "hacer clone() para callarlo",
  "origen": "ia"
}
```

`origen` vale `ia` o `banco`, por signo: si una sola profecía no pasa la validación, solo esa sale del banco.

**D1 y no KV:** el archivo necesita consultas por fecha y KV no es consistente. Hay una escritura al día.

## 5. Generación de las profecías

### 5.1 Qué decide el código y qué escribe la IA

Para que la IA tenga menos que inventar (y menos que validar), el código sortea antes de llamarla, de forma determinista a partir de la fecha:

- **El gancho del día de cada signo:** un hecho cierto y comprobable de su lenguaje, sacado de `data/ganchos.json`, que tiene 15 por signo: un comportamiento, un error con su mensaje, una herramienta oficial o una manía («unwrap() sobre un None hace entrar en pánico al programa», «NULL = NULL no es verdadero: hay que usar IS NULL»). Solo el lenguaje y su ecosistema oficial (compilador, gestor de paquetes, biblioteca estándar), nada que dependa de una versión concreta y nada de proyectos de terceros, personas ni empresas. Cada signo rota los suyos en **ciclos de quince días**: cada ciclo baraja la lista del signo con su propia semilla y toma uno por día, así que en un ciclo ningún gancho sale dos veces. Con un tema genérico («la reunión», «el certificado caducado»), el modelo escribía partes de incidencias y se inventaba hechos técnicos; con el gancho, el código pone el hecho y la IA solo la voz.
- **El puerto de la suerte**, de `data/puertos.json`, con su servicio: «5432 (PostgreSQL)».
- **El signo compatible**, otro de los doce.

La IA escribe solo **el texto, el «Evita» y el matiz de «Compatible con»** (si el matiz se pasa de largo, sale de una lista de reserva: sección 5.4).

### 5.2 La llamada

- **Una sola llamada al día** con los doce signos, al modelo **GLM-5.3 de Z.ai**, con `thinking` activado y `reasoning_effort: low`: este modelo siempre razona y, sin pedirle otra cosa, lo hace al máximo; con `low` le bastan unas decenas de tokens. El id del modelo va en `vars` (`zai:glm-5.3`; el prefijo `zai:` manda la llamada a Z.ai), porque los modelos caducan. La llamada tarda unos 20 segundos, y la espera de red no cuenta como CPU del cron.
- **Si falla, el banco** (sección 5.6). La cadena admite un modelo de respaldo, pero va vacío. Se probaron `openai/gpt-oss-120b` y `openai/gpt-oss-20b` en Groq y se descartaron: inventaban hechos técnicos que no estaban en el gancho y su español no llegaba al nivel del banco. Con el mismo prompt, GLM-5.3 escribió unas 29 profecías publicables de 36, y gpt-oss-120b, 5.
- **Salida en modo JSON** (`response_format` de tipo `json_object`), sin esquema impuesto: Z.ai no lo admite. El prompt del sistema acaba con la forma exacta del JSON y el Worker la comprueba (sección 5.4). Sin streaming.
- **Contexto para no repetirse:** para cada signo, el gancho y el compatible sorteados y los textos de los **tres días anteriores** que escribió la IA, con la instrucción de no repetir ni la idea ni el giro. Lo que salió del banco no vuelve al prompt (el modelo lo parafrasea), aunque sí está en el filtro de copias.
- **Tamaño de la llamada:** unos 3.200-3.700 tokens de entrada y unos 1.000 de salida, razonamiento incluido: unos 4.500 por llamada.

### 5.3 El prompt del sistema (resumen)

- **Voz:** un bardo pesimista que canta desgracias pequeñas e inevitables y las remata con ironía o resignación: se lee como una profecía, no como un parte de incidencias. Habla a quienes programan en cada lenguaje en segunda persona del plural («os», «vuestro», «tendréis»), nunca de tú, con frases que se entienden a la primera. Español de España correcto, sin anglicismos innecesarios («probar» y no «testear»), salvo los nombres técnicos del propio lenguaje.
- **Conjugación:** el vosotros tiene que estar bien conjugado («pondréis», «crearéis», «enviaréis», «dejasteis», «habéis»; el futuro acaba en «-réis», con tilde) y nunca en imperativo («Compilad», «Incluid»), porque es una profecía. Si el modelo duda, el sujeto pasa a ser la cosa del lenguaje en tercera persona («el compilador», «un NULL», «el unwrap()») y el vosotros se queda en «os» y «vuestro».
- **La profecía se construye alrededor del gancho, que es cierto:** el modelo no añade otros hechos técnicos que no estén en el gancho, salvo que sean de conocimiento general en ese lenguaje y esté seguro de que son ciertos. Es lo que hace el banco: un rasgo real del lenguaje contado como desgracia inevitable.
- **Fidelidad al gancho:** el gancho se cuenta tal cual, sin exagerarlo ni añadirle consecuencias técnicas. Si dice que `map()` se salta los huecos de un array, la profecía no puede decir que el array tendrá menos elementos. La gracia va en la escena y el remate, no en inventar.
- **Forma del texto:** dos frases, la desgracia y un **remate concreto** que cambia de forma de una profecía a otra: una consecuencia absurda, la resignación del bardo o un giro irónico, siempre con algo que se ve, nunca una frase abstracta como «La claridad será una ilusión». El prompt da ese «Mal» pero ningún «Bien» suelto: con un solo remate de ejemplo, el modelo lo copió en las doce profecías («Lo notaréis al…, con…»), así que los remates buenos son los de los ejemplos, cada uno de una forma, y la fórmula «Lo notaréis al…» está vetada.
- **Arranques:** se mezclan el sujeto en tercera persona («Un NULL…», «El compilador…»), el verbo en futuro («Pondréis…»), «Bastará un…» y las subordinadas («Cuando…», «Si…»). Como mucho dos profecías del día empiezan por la misma palabra, también si es «El» o «La», y como mucho cuatro empiezan por un verbo en vosotros, para que el día no suene a plantilla. Las fórmulas de juglar («os lo advierto», «escuchad», «cantan los astros») van en medio o al final, y como mucho en tres profecías del día.
- **«Evita» y el matiz:** «Evita» es lo que conviene evitar hoy, en infinitivo y sin «no» delante, porque se lee tras la etiqueta («Evita: hacer clone() para callarlo»). El matiz cuenta, con gracia y sin faltar a la verdad, cómo o por qué se llevan los dos lenguajes, en **dos a cinco palabras**, sin nombrar ningún lenguaje, porque se lee detrás del nombre del compatible («Go, a regañadientes»), y varía de forma: «a regañadientes», «solo los viernes», «por miedo», «para discutir de tipos», «que también sabe hacer die()». Como mucho tres matices del día empiezan por «que también».
- **Nunca:** personas, colectivos, empresas ni proyectos con nombre propio; burlas de perfiles profesionales (juniors, frontend, QA…); política, religión, salud, dinero real ni despidos; palabrotas; enlaces; emojis (los pone el código); el carácter `@`, tampoco en anotaciones o decoradores.
- **Ejemplos de tono:** el prompt lleva cuatro ejemplos completos (gancho, texto, «Evita», compatible y matiz) con la longitud pedida, arranques distintos (uno con subordinada) y remates de formas distintas (giro, consecuencia, resignación) que no añaden hechos técnicos al gancho, ninguno con una fórmula de juglar al principio. Sus ganchos no están en `data/ganchos.json` y sus textos no están en el banco. Son solo para el tono: el prompt pide que no se copien, y el filtro de copias los vigila (sección 5.4).
- **Longitudes:** el prompt pide el texto y el matiz **en palabras**, porque el modelo no cuenta caracteres: cuando se le pedían textos de 100 a 150 caracteres salían de 170 a 235, y cuando se le pedían matices de 40 como mucho, la mayoría se pasaban. El texto, dos frases y como mucho 24 palabras, con unos 150 caracteres de referencia (las del banco van de 17 a 26 palabras): cuando se le pedían entre 18 y 26, el modelo escribía de 25 a 32 y se pasaba del tope. El matiz, de dos a cinco palabras; «Evita», de 60 caracteres como mucho. El validador sigue contando caracteres: acepta textos de 80 a 180, para no tirar una buena profecía por unos caracteres, y matices de 3 a 40. Las profecías cortas tienen más gracia y caben en tres líneas de la tarjeta.
- **Tamaño:** con dos días de historial, el prompt y el mensaje del día rondan los 3.700 tokens de entrada.

### 5.4 Validación

Como Z.ai no impone el esquema, el Worker comprueba la forma: un JSON legible (también si llega dentro de un bloque de código) con el array `profecias`. Sin eso, o con un signo repetido, se descarta la respuesta entera. Un elemento sin los cuatro campos de texto o con un signo que no es de los doce se ignora, y su signo cuenta como fallido. Después, cada profecía pasa por:
1. **Longitudes** de la sección 5.3.
2. **Lista de palabras vetadas** (insultos y temas sensibles) y nada de URLs ni menciones `@`.
3. **«Evita» sin «no»:** si empieza por «no», se descarta, porque tras la etiqueta se leería al revés.
4. **Repeticiones:** si el texto comparte una secuencia de 6 palabras con cualquier profecía de los últimos 14 días (de cualquier signo), con el banco, con los ejemplos del prompt o con otra profecía ya aceptada ese mismo día, se descarta. Es el filtro de copias de Ficha de Rol. Todas las secuencias van en un solo `Set`, para quedar muy por debajo de los 10 ms de CPU del cron.

**Matiz de reserva:** si lo único que falla de una profecía es la longitud del matiz, no se descarta. Se quedan el texto y el «Evita» de la IA, y el matiz sale de una lista fija de diez matices genéricos (`data/matices.json`: «a regañadientes», «con reservas», «sin mirarse a la cara»…), elegido por un hash de la fecha y el signo, así que el mismo día da siempre el mismo. El resto de la validación se repite con el matiz nuevo. No cuenta como fallo: queda apuntado como `matiz_reserva`, junto con el matiz que se tiró, para revisar el prompt.

Si fallan **3 signos o menos**, esos salen del banco. Si fallan más, se descarta la respuesta y se prueba el modelo de respaldo, si lo hay; sin él, el día sale entero del banco.

### 5.5 Sin moderador

No hay entrada de usuarios, así que no hay inyección de prompt, y el prompt es cerrado. Se valoró pasar los textos por Llama Guard 3 en Workers AI, pero se descarta: daría falsos positivos con el lenguaje trágico del bardo («condenar al servidor», «matar procesos») y añade una dependencia por un beneficio pequeño. Bastan las reglas del prompt y la validación de la sección 5.4.

Si algo se cuela, el día se reemplaza con el banco con un comando de `wrangler d1 execute` (documentado en el README) y el mensaje de Telegram se edita o se borra a mano.

### 5.6 El banco

`data/banco.json`: 7 profecías por signo (84 en total), escritas de antemano y revisadas una a una, con texto, «Evita» y compatible propio. Se elige por un hash de la fecha y el signo, así que el mismo día da siempre la misma. Si la IA cae varios días seguidos, el banco se recicla.

Se usa en tres casos: un signo no pasa la validación, la IA falla en los dos intentos, o no hay fila para hoy (por ejemplo, si D1 no responde). La demo nunca se queda en blanco.

**Un día, una profecía:** cuando el día se publica a medianoche, ya no cambia, aunque haya salido del banco. No se regenera a media mañana.

## 6. Web

- **Renderizada en el Worker (SSR)** con plantillas que escapan todo. La profecía se ve sin JavaScript y cada página tiene su `og:description`.
- **`/`:** los doce signos de hoy en una cuadrícula.
- **`/{signo}`:** la profecía de hoy, la vista previa de la tarjeta y el fragmento para el README con un botón de copiar (sección 8), y enlaces a la API y al canal. Si la profecía sale del banco, lo dice: «Sacado del archivo del Bardo».
- **Alias:** `/js`, `/ts`, `/py` y `/cs` redirigen con 308 a su signo, también en la API.
- **`/h/{fecha}`:** el día completo del archivo, con enlaces al día anterior y al siguiente. Hoy no tiene enlace al día siguiente.
- **Identidad visual:** por definir. Idea de partida: pergamino y letra de imprenta antigua para los títulos, con modo oscuro. Fuentes servidas desde la propia web.
- **Iconos:** emoji por signo (🦀 Rust, 🐍 Python, ☕ Java…). No se usan los logos oficiales, que son marcas registradas.
- **Accesibilidad:** contraste AA, navegación con teclado, `lang="es"` y textos alternativos.

## 7. API pública

| Ruta | Devuelve |
|---|---|
| `GET /api/v1/signos` | Los doce signos: slug, nombre, emoji y alias |
| `GET /api/v1/hoy` | Los doce signos de hoy |
| `GET /api/v1/signos/{signo}` | Un signo hoy; con `?fecha=AAAA-MM-DD`, ese día |
| `GET /api/v1/dias/{fecha}` | Un día completo del archivo |

- **Errores en JSON** (`{ "error": "signo_desconocido", "mensaje": "…" }`) con la voz del Bardo: 404 si el signo no existe, 400 si la fecha está mal escrita, y 404 si es anterior al lanzamiento o futura («El Bardo no ve tan lejos»).
- **CORS** `Access-Control-Allow-Origin: *`, sin credenciales. Solo `GET`, `HEAD` y `OPTIONS`; el resto, 405.
- **`ETag`** en todas las respuestas, con 304 si no ha cambiado.
- **`/openapi.json`** (OpenAPI 3.1), que documenta también el campo `origen`, y una página `/api` con ejemplos de `curl`. Un test comprueba que sus rutas coinciden con las del Worker.
- **Huevo de pascua:** la cabecera `X-Bardo-Consejo` lleva un consejo del día, para quien haga `curl -i`.
- **Rate limit** con el binding `ratelimits` de Workers. Es laxo, pero basta: ninguna petición gasta IA.

### 7.1 Caché

| Qué | `Cache-Control` |
|---|---|
| Hoy (web y API) | `max-age` hasta la medianoche de Madrid, con un tope de una hora |
| Hoy servido del banco porque no hay fila | 60 segundos, para que no se quede pegado |
| Días pasados | Un día. No es `immutable` para poder reemplazar un día si se cuela algo |
| Tarjeta SVG | `no-cache` con `ETag` (sección 8) |

## 8. Tarjeta SVG para el README

El fragmento principal usa `<picture>`, que sigue el tema elegido en GitHub:

```html
<a href="https://bardo.webninja.fyi/rust">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://bardo.webninja.fyi/tarjeta/rust.svg?tema=oscuro">
    <img alt="Horóscopo de Bardo: Rust" src="https://bardo.webninja.fyi/tarjeta/rust.svg?tema=claro">
  </picture>
</a>
```

Y, como alternativa, una línea de Markdown: `[![Horóscopo de Bardo: Rust](https://bardo.webninja.fyi/tarjeta/rust.svg)](https://bardo.webninja.fyi/rust)`. Sin `?tema`, el SVG usa `@media (prefers-color-scheme: dark)`, que sigue al sistema operativo y no al tema de GitHub.

- **Fondo propio:** la tarjeta se lee bien sobre cualquier tema, aunque no coincida.
- **495 px de ancho**, como las tarjetas habituales de los perfiles de GitHub. El texto se parte en líneas en el servidor (SVG no lo hace solo), con un ancho de carácter conservador y corte forzado de las palabras más largas que una línea.
- **Altura calculada** según el número de líneas que salen. Un test usa el texto más largo posible.
- **Fuentes del sistema**, con pesos que existen en Windows, macOS y Linux: GitHub sirve la imagen a través de su proxy (Camo) y una imagen SVG no carga fuentes externas.
- **Caché:** GitHub recomienda que las imágenes que cambian se sirvan con `Cache-Control: no-cache`. Camo revalida en cada visita con el `ETag` y casi siempre recibe un 304.
- **Accesible:** `role="img"` con `<title>` y `<desc>` que contienen la profecía.
- **Seguridad:** todo el texto se escapa como XML; el SVG no lleva scripts y se sirve con `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`.

## 9. Canal de Telegram

- **Canal público** con un bot que es administrador **solo con permiso para publicar**.
- **Mensaje diario** en `parse_mode: HTML`, con todo escapado: la fecha, los doce signos (emoji, nombre y texto) y el enlace a la web. Con las longitudes de la sección 5.3 ocupa unos 2.600 caracteres, por debajo del límite de 4.096; un test lo comprueba con los doce textos al máximo.
- **Sin duplicados:** antes de enviar, el Worker reserva la publicación (`telegram_ms = -1` solo si estaba en `NULL`). Si Telegram falla, la deja otra vez en `NULL` para el reintento; si responde 200, guarda la hora. Así, aunque D1 falle justo después de enviar, el mensaje no se repite.
- **Avisos al administrador:** el bot escribe por privado si el día sale entero del banco o si falla la publicación de las 08:00. El administrador abre una vez un chat con el bot y su id va como secret.
- **El bot solo envía.** No recibe mensajes ni tiene webhook ni comandos en la primera versión, así que no tiene superficie de ataque.

## 10. Coste y topes

| Recurso | Uso | Límite gratis o coste |
|---|---|---|
| Z.ai, GLM-5.3 | 1 llamada al día (~4.500 tokens); otra en el reintento de las 22:00 solo si falla la primera | Sin capa gratuita: se paga por token, unos céntimos al mes |
| Cron Triggers | 1 expresión | 5 por cuenta; 10 ms de CPU por ejecución, sin contar la espera de red |
| D1 | 1 escritura al día; 1-2 lecturas por petición | 5M filas leídas y 100K escritas al día |
| Workers | Las visitas y las revalidaciones de Camo (casi todas 304) | 100K peticiones al día |

**Sin cupos compartidos:** no usa Groq, así que no reserva cupo ni toca el de las otras apps de la factoría. El tope sale de la arquitectura: solo el cron llama a la IA, como mucho dos veces al día, así que no hace falta un contador.

## 11. Seguridad

Según OWASP Top 10 2025 y OWASP LLM Top 10 2025:

- **LLM01, inyección de prompt:** no aplica, porque ningún texto de usuario llega al modelo.
- **LLM05, manejo de la salida:** validación de la sección 5.4 y escape según el destino: HTML, XML (SVG), HTML de Telegram y JSON.
- **LLM10, consumo sin límite:** solo el cron llama a la IA (sección 10).
- **Cabeceras:** CSP estricta en el HTML (sin scripts en línea; el botón de copiar va en un fichero), `X-Content-Type-Options: nosniff` y `Referrer-Policy`.
- **Secretos:** `ZAI_API_KEY`, `TELEGRAM_BOT_TOKEN` y el chat del administrador, como secrets del Worker. El nombre del canal, que es público, va en `vars`.
- **Privacidad:** sin cookies, sin cuentas y sin datos personales. No se guardan IPs.

## 12. Pruebas y verificación

**TDD con Vitest + `@cloudflare/vitest-plugin`**, con D1 de pruebas por migraciones:

- **Fechas:** día de Madrid y fecha objetivo en las cuatro horas del cron, en invierno, en verano y en los cambios de hora de marzo y octubre. Ninguna ruta sirve una fecha posterior a hoy.
- **Sorteo y banco:** deterministas por fecha; cada signo recibe un gancho suyo, y sus quince sin repetir en cada ciclo de quince días; el compatible nunca es el propio signo. Contenido de `data/ganchos.json`: 15 por signo, distintos, de 90 caracteres como mucho, sin `@` ni enlaces.
- **Validación:** signo que falta o se repite, longitudes, palabras vetadas, URLs, «Evita» que empieza por «no» y repeticiones de 6 palabras con otros signos, el banco y el propio día.
- **Cadena:** modelo → respaldo, si lo hay → banco, con `fetch` parcheado; la forma del JSON de Z.ai (bloque de código, campos que faltan, signos desconocidos o repetidos); el matiz de reserva cuando solo falla su longitud, y los parámetros de cada proveedor (razonamiento, modo JSON y URL).
- **Cron:** idempotencia de las cuatro horas, sin duplicar el día ni el mensaje; reserva de Telegram con fallo antes y después de enviar; avisos al administrador.
- **Salida:** escape en HTML, SVG y Telegram con textos maliciosos; partición de líneas y altura de la tarjeta; el mensaje de Telegram con los doce textos al máximo cabe.
- **API:** rutas, alias, errores, CORS, métodos, `ETag` y 304, cabeceras de caché (también la de 60 s del banco) y que `openapi.json` coincide con las rutas.

**Verificación en producción** tras el despliegue: CSP, la tarjeta dentro de un README real de GitHub con `<picture>` en modo claro y oscuro (y que se renueva al día siguiente), el primer mensaje del canal, un aviso de prueba al administrador, la API desde otro origen y el respaldo con la IA caída.

## 13. Fuera de la primera versión (visión)

- Comandos del bot por signo (`/rust`) y suscripción por privado.
- og:image dinámica por signo y día.
- Feed RSS del archivo.
- `/aleatorio` y `?formato=markdown` en la API.
- Un CLI (`npx horoscopo-de-bardo`) que detecte el lenguaje del repo y te dé su profecía antes del `git push`.
- «Efemérides malditas»: el día de un aniversario de un desastre famoso (left-pad, Log4Shell, el efecto 2000), el Bardo lo recuerda.
- Más signos, o que la gente proponga y vote los nuevos.
- El «ascendente»: tu segundo lenguaje.
- La compatibilidad entre dos signos que elijas tú.

## 14. Pendiente

- Nombre del canal de Telegram.
- Identidad visual (sección 6).
