// scripts/og.mjs — npm run og: genera public/og.png (1200×627) con los colores de la web
// El título va en IM Fell English con Pango, que no lee woff2: usa el TTF de Google Fonts que hay en
// scripts/fuentes (licencia OFL). Lo demás, con la serif del sistema en el SVG. Sin emojis: librsvg,
// que usa sharp, no siempre los pinta.
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ANCHO = 1200;
const ALTO = 627;
const C = { fondo: "#f4ead5", sombra: "#e6d4ae", borde: "#b89f74", texto: "#211912", suave: "#5c4a35", acento: "#9e1b1b" };
const fuente = fileURLToPath(new URL("./fuentes/IMFeENrm28P.ttf", import.meta.url));
const salida = fileURLToPath(new URL("../public/og.png", import.meta.url));

// Estrella de ocho puntas para el sello de lacre
function estrella(cx, cy, r1, r2) {
  const puntos = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    puntos.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return puntos.join(" ");
}

const filete = (y) => `<line x1="330" y1="${y}" x2="560" y2="${y}" stroke="${C.borde}" stroke-width="2"/>
<line x1="640" y1="${y}" x2="870" y2="${y}" stroke="${C.borde}" stroke-width="2"/>
<polygon points="${estrella(600, y, 12, 4)}" fill="${C.acento}"/>`;

const fondo = `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
<defs><radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="${C.fondo}"/><stop offset="100%" stop-color="${C.sombra}"/></radialGradient></defs>
<rect width="${ANCHO}" height="${ALTO}" fill="url(#v)"/>
<rect x="26" y="26" width="${ANCHO - 52}" height="${ALTO - 52}" rx="6" fill="none" stroke="${C.borde}" stroke-width="4"/>
<rect x="40" y="40" width="${ANCHO - 80}" height="${ALTO - 80}" rx="3" fill="none" stroke="${C.borde}" stroke-width="1.5"/>
<circle cx="600" cy="112" r="40" fill="${C.acento}"/>
<circle cx="600" cy="112" r="31" fill="none" stroke="${C.fondo}" stroke-opacity=".55" stroke-width="2"/>
<polygon points="${estrella(600, 112, 22, 9)}" fill="${C.fondo}" fill-opacity=".85"/>
${filete(318)}
<text x="600" y="382" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-style="italic" fill="${C.texto}">El horóscopo diario de tu lenguaje, escrito por un bardo pesimista</text>
<text x="600" y="458" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="29" fill="${C.suave}">Rust · JavaScript · Python · Java · C# · Go</text>
<text x="600" y="500" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="29" fill="${C.suave}">PHP · COBOL · TypeScript · SQL · Kotlin · Haskell</text>
<text x="600" y="566" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="2" fill="${C.acento}">bardo.webninja.fyi</text>
</svg>`;

const titulo = await sharp({
  text: { text: `<span foreground="${C.acento}">Horóscopo de Bardo</span>`, font: "IM FELL English 104", fontfile: fuente, rgba: true, dpi: 72 },
})
  .png()
  .toBuffer({ resolveWithObject: true });

await sharp(Buffer.from(fondo))
  .composite([{ input: titulo.data, left: Math.round((ANCHO - titulo.info.width) / 2), top: 292 - titulo.info.height }])
  .png({ compressionLevel: 9 })
  .toFile(salida);
console.log(`public/og.png · título de ${titulo.info.width}×${titulo.info.height}`);
