// ==========================================
// MÓDULO 1: LISTADO DE LISTAS + MENÚ DE ACCIONES
// ==========================================
// Se carga desde index.html con <script src="modulo1-listas.js"></script>.
// Usa las mismas variables globales que el resto de la app: db, saveDB(),
// m1_renderMatrizLista(), exportarPDF(), etc.
//
// Esto NO toca el motor de cálculo de precios ni el editor de listas — solo
// arma la vista resumen de arriba ("Mis Listas") y el desplegable "Agregar..."
// que muestra/oculta los formularios de creación para no saturar la pantalla.

function m1_mostrarAccion(accion) {
    ['producto', 'lista', 'combo', 'proveedor'].forEach(a => {
        let el = document.getElementById('m1-accion-' + a);
        if (el) el.style.display = (a === accion) ? 'block' : 'none';
    });
}

function m1_renderListadoListas() {
    let cont = document.getElementById('m1-listado-listas');
    if (!cont) return;

    let html = `
    <div class="card-item" style="border-left-color: var(--info);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div><b>🏭 Lista Proveedor</b><br><span style="font-size:11px; color:#888;">Costo base / Descripciones</span></div>
            <div style="display:flex; gap:8px;">
                <button onclick="m1_editarListaDesdeListado('proveedor')" style="background:var(--info); color:white; border:none; border-radius:6px; padding:8px 12px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ Editar</button>
            </div>
        </div>
    </div>`;

    (db.listas || []).forEach(l => {
        html += `
        <div class="card-item" style="border-left-color: var(--success);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div><b>${l.nombre}</b><br><span style="font-size:11px; color:#888;">Margen: ${l.margen}%</span></div>
                <div style="display:flex; gap:8px;">
                    <button onclick="m1_compartirListaDesdeListado('${l.id}')" style="background:var(--success); color:white; border:none; border-radius:6px; padding:8px 12px; font-size:12px; font-weight:bold; cursor:pointer;">📲 Compartir</button>
                    <button onclick="m1_editarListaDesdeListado('${l.id}')" style="background:var(--info); color:white; border:none; border-radius:6px; padding:8px 12px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ Editar</button>
                </div>
            </div>
        </div>`;
    });

    if (!db.listas || db.listas.length === 0) {
        html += '<p style="font-size:11px; color:#888; text-align:center; margin-top:8px;">Todavía no creaste ninguna lista propia. Usá "➕ Agregar" abajo para crear una.</p>';
    }

    cont.innerHTML = html;
}

function m1_editarListaDesdeListado(lid) {
    let sel = document.getElementById('m1-lista-select');
    sel.value = lid;
    m1_renderMatrizLista();
    let destino = document.getElementById('m1-header-edicion');
    if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function m1_compartirListaDesdeListado(lid) {
    let sel = document.getElementById('m1-lista-select');
    sel.value = lid;
    exportarPDF('lista');
}
