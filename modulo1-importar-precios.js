// ==========================================
// IMPORTADOR DE PRECIOS DEL PROVEEDOR (desde PDF)
// ==========================================
// Se carga desde index.html con <script src="modulo1-importar-precios.js"></script>.
// Usa las mismas variables globales que el resto de la app: db, saveDB(), etc.
//
// Cómo funciona:
// 1. El usuario sube el PDF (o pega el texto copiado del PDF).
// 2. Buscamos cada línea que tenga un precio ($...) y probamos matchear el
//    nombre del producto contra los que ya existen en db.productos.
// 3. Cada línea puede traer VARIOS precios (Original, 5kg, 1kg, 500gr...).
//    En vez de adivinar por posición de columna (poco confiable si el
//    proveedor deja alguna celda vacía), elegimos el precio MÁS PARECIDO al
//    costo actual del producto — los precios no suelen saltar de golpe de
//    una semana a otra, así que es una forma robusta de acertar la columna
//    "1kg" sin depender de la posición exacta.
// 4. Se muestra una tabla Actual/Nuevo editable con checkbox. Nada se
//    actualiza hasta que el usuario toca "Aplicar Precios Seleccionados".

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let m1_resultadosRevisionPrecios = [];

// --- Lectura del PDF ---
async function m1_procesarPDFProveedor(event) {
    let file = event.target.files[0];
    if (!file) return;

    try {
        let arrayBuffer = await file.arrayBuffer();
        let pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let lineas = await m1_extraerLineasDePDF(pdf);
        document.getElementById('m1-texto-proveedor').value = lineas.join('\n');
        m1_analizarTextoProveedor();
    } catch(e) {
        alert("⚠️ No se pudo leer el PDF directamente. Probá la Opción 2: mantené presionado sobre el PDF, 'Seleccionar todo', 'Copiar', y pegalo en el cuadro de texto.");
        console.warn('Error leyendo PDF:', e);
    }
}

// Agrupa los fragmentos de texto del PDF en "líneas" según su posición vertical (Y),
// y dentro de cada línea los ordena de izquierda a derecha (X). Así reconstruimos
// filas de tabla aunque el PDF no tenga una estructura de tabla real.
async function m1_extraerLineasDePDF(pdfDoc) {
    let lineas = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
        let page = await pdfDoc.getPage(p);
        let content = await page.getTextContent();
        let items = content.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
        items.sort((a, b) => b.y - a.y || a.x - b.x);

        let filas = [];
        let filaActual = [];
        let yActual = null;
        items.forEach(it => {
            if (yActual === null || Math.abs(it.y - yActual) < 4) {
                filaActual.push(it);
                if (yActual === null) yActual = it.y;
            } else {
                filas.push(filaActual);
                filaActual = [it];
                yActual = it.y;
            }
        });
        if (filaActual.length) filas.push(filaActual);

        filas.forEach(fila => {
            fila.sort((a, b) => a.x - b.x);
            let texto = fila.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
            if (texto) lineas.push(texto);
        });
    }
    return lineas;
}

// --- Parseo de una línea de texto: nombre del producto + lista de precios detectados ---
function m1_parsearLineaProducto(linea) {
    let montos = [];
    let regexMonto = /\$\s?([\d]{1,3}(?:\.\d{3})*|\d+)/g;
    let m;
    while ((m = regexMonto.exec(linea)) !== null) {
        let valorStr = m[1].replace(/\./g, '');
        let valor = parseInt(valorStr, 10);
        if (!isNaN(valor) && valor > 0) montos.push(valor);
    }
    if (montos.length === 0) return null;

    let posPrimerMonto = linea.indexOf('$');
    let textoAntes = posPrimerMonto > -1 ? linea.slice(0, posPrimerMonto) : linea;

    // Sacamos la presentación ("X 5KG", "x 25KG", "X30KG", "X 12u...") del nombre
    let nombre = textoAntes
        .replace(/x\s?\d+[.,]?\d*\s?kg/gi, '')
        .replace(/x\s?\d+\s?u\b.*$/gi, '')
        .trim();
    // Sacamos la descripción entre paréntesis para quedarnos con el nombre limpio
    let nombreLimpio = nombre.replace(/\(.*?\)/g, '').replace(/\(.*$/g, '').trim();

    if (nombreLimpio.length < 3) return null; // muy corto para ser un nombre de producto real

    return { nombre: nombreLimpio, montos: montos };
}

// --- Analiza todo el texto pegado/extraído y arma la lista de coincidencias ---
function m1_analizarTextoProveedor() {
    let texto = document.getElementById('m1-texto-proveedor').value;
    if (!texto.trim()) return alert("⚠️ Subí un PDF o pegá el texto primero.");

    let lineas = texto.split('\n');
    let resultados = [];
    let idsEncontrados = {};

    lineas.forEach(linea => {
        let parsed = m1_parsearLineaProducto(linea);
        if (!parsed) return;

        let nombreNorm = parsed.nombre.toLowerCase().trim();
        if (nombreNorm.length < 3) return;

        let producto = db.productos.find(p => p.nombre.toLowerCase().trim() === nombreNorm);
        if (!producto) {
            producto = db.productos.find(p => {
                let pn = p.nombre.toLowerCase().trim();
                return pn.length > 4 && (nombreNorm.includes(pn) || pn.includes(nombreNorm));
            });
        }
        if (!producto) return;
        if (idsEncontrados[producto.id]) return; // evitar duplicados si matchea dos veces
        idsEncontrados[producto.id] = true;

        let costoActual = producto.costo || 0;
        let mejor = parsed.montos[0];
        let mejorDif = Math.abs(mejor - costoActual);
        parsed.montos.forEach(monto => {
            let dif = Math.abs(monto - costoActual);
            if (dif < mejorDif) { mejor = monto; mejorDif = dif; }
        });

        resultados.push({
            id: producto.id, nombre: producto.nombre,
            costoActual: costoActual, costoSugerido: mejor,
            montosDetectados: parsed.montos
        });
    });

    resultados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    m1_renderRevisionPrecios(resultados);
}

function m1_renderRevisionPrecios(resultados) {
    m1_resultadosRevisionPrecios = resultados;
    let cont = document.getElementById('m1-revision-precios');

    if (resultados.length === 0) {
        cont.innerHTML = '<p style="font-size:12px; color:#888;">No se encontraron productos coincidentes. Revisá que el texto se haya pegado bien, o probá subiendo el PDF directamente.</p>';
        return;
    }

    let html = `<p style="font-size:12px; color:#555;">Se encontraron <b>${resultados.length}</b> producto(s). El precio "Nuevo" es una sugerencia (el valor más parecido al que ya tenías) — revisalo, editalo si hace falta, y confirmá con el check cuáles aplicar. Si subió mucho, tocá "👁️ Ver impacto" antes de aplicar para ver cómo queda en cada lista.</p>
    <div class="table-responsive"><table>
        <thead><tr><th>Producto</th><th>Actual</th><th>Nuevo</th><th>✓</th><th></th></tr></thead>
        <tbody>`;

    resultados.forEach((r, idx) => {
        let cambio = r.costoSugerido !== r.costoActual;
        let colorTexto = cambio ? (r.costoSugerido > r.costoActual ? 'color:var(--danger);' : 'color:var(--success);') : '';
        let otrosMontos = r.montosDetectados.length > 1 ? `<div style="font-size:9px; color:#999;">Otros detectados: ${r.montosDetectados.filter(m => m !== r.costoSugerido).map(m => '$' + m).join(', ')}</div>` : '';

        html += `<tr>
            <td style="text-align:left; font-size:11px;">${r.nombre}${otrosMontos}</td>
            <td style="font-size:11px; color:#888;">$${r.costoActual}</td>
            <td><input type="number" class="input-sm" id="m1-rev-precio-${idx}" value="${r.costoSugerido}" style="${colorTexto} font-weight:bold;"></td>
            <td><input type="checkbox" id="m1-rev-check-${idx}" ${cambio ? 'checked' : ''} style="width:18px; height:18px;"></td>
            <td><button onclick="m1_verImpactoListas(${idx})" style="background:none; border:1px solid var(--info); color:var(--info); border-radius:6px; padding:5px 8px; font-size:10px; cursor:pointer; white-space:nowrap;">👁️ Impacto</button></td>
        </tr>
        <tr id="m1-impacto-fila-${idx}" style="display:none;">
            <td colspan="5" style="padding:8px; background:#f8f9fa;"><div id="m1-impacto-${idx}"></div></td>
        </tr>`;
    });

    html += `</tbody></table></div>
    <button class="btn btn-success" onclick="m1_aplicarPreciosProveedor()">✅ Aplicar Precios Seleccionados</button>`;
    cont.innerHTML = html;
}

// Muestra, para un producto de la revisión, cómo quedaría el precio final en CADA
// lista (por cada presentación) si se aplica el precio "Nuevo" que está cargado
// en ese momento — así se puede ver el impacto antes de confirmar nada.
function m1_verImpactoListas(idx) {
    let r = m1_resultadosRevisionPrecios[idx];
    if (!r) return;

    let fila = document.getElementById(`m1-impacto-fila-${idx}`);
    let cont = document.getElementById(`m1-impacto-${idx}`);
    if (!fila || !cont) return;

    // Si ya está abierta, la cerramos (funciona como toggle)
    if (fila.style.display !== 'none') { fila.style.display = 'none'; return; }

    let inputPrecio = document.getElementById(`m1-rev-precio-${idx}`);
    let nuevoCosto = parseFloat(inputPrecio.value);
    if (isNaN(nuevoCosto) || nuevoCosto <= 0) { alert("⚠️ Ingresá un precio nuevo válido primero."); return; }

    let producto = db.productos.find(p => p.id === r.id);
    if (!producto) { cont.innerHTML = '<p style="font-size:11px; color:#999;">Producto no encontrado.</p>'; fila.style.display = 'table-row'; return; }

    let filasHtml = '';
    let huboAlerta = false;
    let seEncontroEnAlgunaLista = false;

    (db.listas || []).forEach(l => {
        if (l.ocultos && l.ocultos.includes(r.id)) return; // producto oculto en esta lista

        (l.columnas || []).forEach(c => {
            if ((producto.esUnidad && c !== 'unidad') || (!producto.esUnidad && c === 'unidad')) return;
            let keyCelda = `${r.id}_${c}`;
            if (l.celdasOcultas && l.celdasOcultas.includes(keyCelda)) return;

            seEncontroEnAlgunaLista = true;
            let colName = (l.nombresCols && l.nombresCols[c]) ? l.nombresCols[c] : c;
            let keyPres = `${l.id}_${r.id}_${c}`;
            let nombrePres = db.pres_manuales[keyPres] || colName;
            let costoEnvase = (l.costosEnvase && l.costosEnvase[c]) ? l.costosEnvase[c] : 0;
            let manual = db.precios_manuales[keyPres];

            let precioActualCalc = calcularPrecioBase(r.costoActual, c, producto.esUnidad, l.margen, nombrePres, costoEnvase);
            let precioNuevoCalc = calcularPrecioBase(nuevoCosto, c, producto.esUnidad, l.margen, nombrePres, costoEnvase);
            let esManual = manual !== undefined;
            let precioActual = esManual ? manual : precioActualCalc;

            // Para las celdas fijadas a mano, "precioNuevoCalc" es lo que SERÍA si se recalculara
            // con el costo nuevo — no se aplica solo, pero el usuario lo quiere ver para decidir
            // si actualiza también ese precio fijo.
            let variacionPct = precioActual > 0 ? ((precioNuevoCalc - precioActual) / precioActual * 100) : 0;
            let esAumentoFuerte = variacionPct >= 15;
            if (esAumentoFuerte) huboAlerta = true;
            let colorFila = esAumentoFuerte ? 'background:#fdf2f2;' : '';
            let colorVar = esAumentoFuerte ? 'var(--danger)' : (variacionPct > 0 ? '#e67e22' : (variacionPct < 0 ? 'var(--success)' : '#888'));

            let celdaNuevo = esManual
                ? `$${manual} <span style="display:block; font-size:9px; color:#888; font-weight:normal;">🔒 fijo — recalculado sería $${precioNuevoCalc}</span>`
                : `$${precioNuevoCalc}`;

            filasHtml += `<tr style="${colorFila}">
                <td style="text-align:left; padding:4px; font-size:11px;">${l.nombre}${esManual ? ' <span title="Precio fijado a mano en esta lista: no se mueve solo" style="color:#e67e22;">🔒</span>' : ''}</td>
                <td style="text-align:center; padding:4px; font-size:11px;">${nombrePres}</td>
                <td style="text-align:center; padding:4px; font-size:11px; color:#888;">$${precioActual}</td>
                <td style="text-align:center; padding:4px; font-size:11px; font-weight:bold;">${celdaNuevo}</td>
                <td style="text-align:center; padding:4px; font-size:11px; font-weight:bold; color:${colorVar};">${variacionPct >= 0 ? '+' : ''}${variacionPct.toFixed(0)}%</td>
            </tr>`;
        });
    });

    if (!seEncontroEnAlgunaLista) {
        cont.innerHTML = '<p style="font-size:11px; color:#999;">Este producto no está visible en ninguna de tus listas todavía.</p>';
    } else {
        let aviso = huboAlerta ? '<p style="font-size:11px; color:var(--danger); font-weight:bold; margin:0 0 6px 0;">⚠️ Hay presentaciones con 15% o más de aumento — revisalas antes de aplicar.</p>' : '';
        let notaCandado = '<p style="font-size:10px; color:#999; margin:6px 0 0 0;">🔒 = precio fijado a mano en esa lista puntual: no se va a mover solo al aplicar el costo nuevo, aunque acá te mostramos cuánto sería si lo recalcularas. Si querés actualizarlo también, hacelo a mano en el editor de esa lista.</p>';
        cont.innerHTML = `${aviso}<div class="table-responsive"><table style="width:100%; border-collapse:collapse;">
            <thead><tr>
                <th style="text-align:left; font-size:10px; padding:4px;">Lista</th>
                <th style="font-size:10px; padding:4px;">Present.</th>
                <th style="font-size:10px; padding:4px;">Actual</th>
                <th style="font-size:10px; padding:4px;">Nuevo</th>
                <th style="font-size:10px; padding:4px;">Var.</th>
            </tr></thead>
            <tbody>${filasHtml}</tbody>
        </table></div>${notaCandado}`;
    }

    fila.style.display = 'table-row';
}

function m1_aplicarPreciosProveedor() {
    let aplicados = 0;
    let idsAplicados = [];
    m1_resultadosRevisionPrecios.forEach((r, idx) => {
        let check = document.getElementById(`m1-rev-check-${idx}`);
        if (!check || !check.checked) return;
        let inputPrecio = document.getElementById(`m1-rev-precio-${idx}`);
        let nuevoPrecio = parseFloat(inputPrecio.value);
        if (isNaN(nuevoPrecio) || nuevoPrecio <= 0) return;

        let producto = db.productos.find(p => p.id === r.id);
        if (producto) { producto.costo = nuevoPrecio; aplicados++; idsAplicados.push(producto.id); }
    });

    if (aplicados === 0) return alert("⚠️ No seleccionaste ningún producto para actualizar.");

    saveDB();

    // Revisamos si algún precio fijado a mano quedó corto de margen con el costo nuevo.
    let alertasMargen = [];
    idsAplicados.forEach(pid => {
        let producto = db.productos.find(p => p.id === pid);
        if (!producto) return;
        (db.listas || []).forEach(l => {
            if (l.ocultos && l.ocultos.includes(pid)) return;
            (l.columnas || []).forEach(c => {
                if ((producto.esUnidad && c !== 'unidad') || (!producto.esUnidad && c === 'unidad')) return;
                let keyCelda = `${pid}_${c}`;
                if (l.celdasOcultas && l.celdasOcultas.includes(keyCelda)) return;
                let keyPres = `${l.id}_${pid}_${c}`;
                let manual = db.precios_manuales[keyPres];
                if (manual === undefined) return; // no es precio fijo: ya se actualizó solo, no hace falta avisar

                let colName = (l.nombresCols && l.nombresCols[c]) ? l.nombresCols[c] : c;
                let nombrePres = db.pres_manuales[keyPres] || colName;
                let costoEnvase = (l.costosEnvase && l.costosEnvase[c]) ? l.costosEnvase[c] : 0;
                let recomendado = calcularPrecioBase(producto.costo, c, producto.esUnidad, l.margen, nombrePres, costoEnvase);

                if (recomendado > manual) {
                    alertasMargen.push({ lista: l.nombre, producto: producto.nombre, presentacion: nombrePres, actual: manual, recomendado: recomendado, dif: recomendado - manual });
                }
            });
        });
    });

    document.getElementById('m1-texto-proveedor').value = '';
    document.getElementById('m1-pdf-proveedor').value = '';
    m1_resultadosRevisionPrecios = [];
    if (typeof initM1 === 'function') initM1();
    let listaSel = document.getElementById('m1-lista-select');
    if (listaSel && listaSel.value && typeof m1_renderMatrizLista === 'function') m1_renderMatrizLista(true);

    if (alertasMargen.length > 0) {
        m1_mostrarAlertaMargen(alertasMargen, aplicados);
    } else {
        document.getElementById('m1-revision-precios').innerHTML = '';
        alert(`✅ Se actualizaron ${aplicados} precio(s) base. Todas las listas recalculan solas a partir de estos costos (salvo los precios que hayas fijado a mano en alguna lista puntual — y en este caso ninguno quedó corto de margen).`);
    }
}

// Muestra, después de aplicar los costos nuevos, SOLO los precios fijados a mano que
// quedaron por debajo del margen esperado — para responder directo "¿qué tengo que
// tocar en mis listas de venta para no perder margen?"
function m1_mostrarAlertaMargen(alertas, aplicados) {
    alertas.sort((a, b) => b.dif - a.dif);
    let filas = alertas.map(a => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
            <span>${a.lista} — ${a.producto} <span style="color:#999;">(${a.presentacion})</span></span>
            <span style="white-space:nowrap; margin-left:8px;">$${a.actual} → <b style="color:var(--danger);">$${a.recomendado}</b></span>
        </div>`).join('');

    document.getElementById('m1-revision-precios').innerHTML = `
        <div style="background:#fdf2f2; border:1px solid #f5c6cb; border-radius:10px; padding:14px;">
            <b style="color:var(--danger); font-size:13px;">⚠️ ${alertas.length} precio(s) fijado(s) a mano quedaron cortos de margen</b>
            <p style="font-size:11px; color:#555; margin:8px 0;">Ya actualizamos ${aplicados} costo(s) base. Estos precios de venta están fijados a mano en sus listas y, con el costo nuevo, ya no te dejan el margen configurado para esa lista — te conviene subirlos:</p>
            ${filas}
            <p style="font-size:10px; color:#888; margin-top:8px;">Para actualizarlos, entrá a cada lista (Módulo 1 → Editar) y cambiá el precio de esa celda puntual.</p>
        </div>`;
}
