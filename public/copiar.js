// Botones «Copiar» de los fragmentos para el README (sin scripts en línea por la CSP)
const estado = document.getElementById("estado-copia");
for (const boton of document.querySelectorAll("[data-copiar]")) {
  boton.addEventListener("click", async () => {
    const fuente = document.getElementById(boton.dataset.copiar);
    if (!fuente) return;
    try {
      await navigator.clipboard.writeText(fuente.textContent);
      if (estado) estado.textContent = "Copiado. Pégalo en tu README.";
    } catch {
      if (estado) estado.textContent = "No he podido copiarlo: selecciónalo y cópialo a mano.";
    }
  });
}
