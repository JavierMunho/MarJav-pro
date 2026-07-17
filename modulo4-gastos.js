// ==========================================
// MÓDULO 4: FINANZAS (Gastos + Resumen automático)
// ==========================================
// Este archivo se carga desde index.html con <script src="modulo4-gastos.js"></script>.
// Usa las mismas variables globales que el resto de la app: db, saveDB(), nav(), etc.
// Los INGRESOS no se cargan a mano acá: se calculan solos a partir de lo que ya
// está registrado en Ventas (Módulo 3) y Consignaciones (Módulo 2).

function initM4() {
    let hoy = new Date().toISOString().split('T')[0];
    let inputDesde = document.getElementById('m4-fecha-desde');
    let inputHasta = document.getElementById('m4-fecha-hasta');
    if (!inputDesde.value) {
        // Por defecto arrancamos mostrando el mes actual completo
        let primerDiaMes = hoy.slice(0, 8) + '01';
        inputDesde.value = primerDiaMes;
    }
    if (!inputHasta.value) inputHasta.value = hoy;
    if (!document.getElementById('m4-gasto-fecha').value) {
        document.getElementById('m4-gasto-fecha').value = hoy;
    }
    m4_renderResumen();
    m4_renderListaGastos();
}

// Convierte fechas en formato "D/M/YYYY" (las que arma toLocaleDateString) a un objeto Date.
// Las fechas que ya vienen en formato ISO "YYYY-MM-DD" (como las de Ventas y Gastos) se
// parsean directo, sin pasar por acá.
function m4_parsearFechaLocal(str) {
    if (!str) return null;
    if (str.includes('-')) return new Date(str + 'T00:00:00');
    let partes = str.split('/');
    if (partes.length !== 3) return null;
    let dia = parseInt(partes[0]), mes = parseInt(partes[1]), anio = parseInt(partes[2]);
    if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return null;
    return new Date(anio, mes - 1, dia);
}

function m4_enRango(fechaStr, desde, hasta) {
    let f = m4_parsearFechaLocal(fechaStr);
    if (!f) return true; // si no se puede interpretar la fecha, la incluimos para no perder datos
    f.setHours(0, 0, 0, 0);
    if (desde) { let d = new Date(desde + 'T00:00:00'); if (f < d) return false; }
    if (hasta) { let h = new Date(hasta + 'T00:00:00'); if (f > h) return false; }
    return true;
}

function m4_renderResumen() {
    let desde = document.getElementById('m4-fecha-desde').value;
    let hasta = document.getElementById('m4-fecha-hasta').value;
    let cont = document.getElementById('m4-resumen-container');

    let ingresosVentas = 0;
    let ventasPendientes = 0;
    (db.ventas || []).forEach(v => {
        if (!m4_enRango(v.fecha, desde, hasta)) return;
        let total = parseFloat(v.total) || 0;
        if (v.pago === 'Pagado') ingresosVentas += total;
        else ventasPendientes += total;
    });

    let ingresosConsignacion = 0;
    (db.historial_consignacion || []).forEach(h => {
        if (!m4_enRango(h.fecha, desde, hasta)) return;
        if (h.tipo === 'pago') ingresosConsignacion += (parseFloat(h.monto) || 0);
        else ingresosConsignacion += (parseFloat(h.cobrado) || 0);
    });

    let totalGastos = 0;
    let gastosEnRango = (db.gastos || []).filter(g => m4_enRango(g.fecha, desde, hasta));
    gastosEnRango.forEach(g => totalGastos += (parseFloat(g.monto) || 0));

    let totalIngresos = ingresosVentas + ingresosConsignacion;
    let balance = totalIngresos - totalGastos;
    let colorBalance = balance >= 0 ? 'var(--success)' : 'var(--danger)';

    let deudaTotalConsignacion = 0;
    (db.clientes || []).forEach(c => deudaTotalConsignacion += (parseFloat(c.deuda) || 0));

    cont.innerHTML = `
        <div style="background:#f8f9fa; border-radius:10px; padding:15px; border:1px solid #eee;">
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e9ecef;">
                <span style="color:#555;">💵 Ventas cobradas</span><b style="color:var(--success);">$${ingresosVentas.toFixed(0)}</b>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e9ecef;">
                <span style="color:#555;">🏪 Cobros de consignación</span><b style="color:var(--success);">$${ingresosConsignacion.toFixed(0)}</b>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e9ecef;">
                <span style="color:#2c3e50; font-weight:bold;">Total Ingresos</span><b style="color:var(--success); font-size:15px;">$${totalIngresos.toFixed(0)}</b>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e9ecef;">
                <span style="color:#555;">💸 Gastos (${gastosEnRango.length})</span><b style="color:var(--danger);">-$${totalGastos.toFixed(0)}</b>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; margin-top:6px;">
                <span style="font-size:16px; font-weight:900; color:#2c3e50;">BALANCE</span>
                <span style="font-size:22px; font-weight:900; color:${colorBalance};">$${balance.toFixed(0)}</span>
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; font-size:11px; color:#666;">
            <div style="flex:1; min-width:150px; background:#fff3cd; border-radius:8px; padding:10px; text-align:center;">
                <div>Ventas pendientes de cobro</div>
                <b style="font-size:15px; color:#856404;">$${ventasPendientes.toFixed(0)}</b>
            </div>
            <div style="flex:1; min-width:150px; background:#fdf2f2; border-radius:8px; padding:10px; text-align:center;">
                <div>Deuda total en consignación</div>
                <b style="font-size:15px; color:var(--danger);">$${deudaTotalConsignacion.toFixed(0)}</b>
            </div>
        </div>
        <p style="font-size:10px; color:#999; margin-top:8px;">Los ingresos se calculan solos a partir de Ventas y Consignaciones. Solo los Gastos se cargan a mano.</p>
    `;
}

function m4_registrarGasto() {
    let fecha = document.getElementById('m4-gasto-fecha').value;
    let monto = parseFloat(document.getElementById('m4-gasto-monto').value);
    let desc = document.getElementById('m4-gasto-desc').value.trim();
    let categoria = document.getElementById('m4-gasto-categoria').value;

    if (!fecha) return alert("⚠️ Elegí una fecha.");
    if (!desc) return alert("⚠️ Ingresá una descripción.");
    if (isNaN(monto) || monto <= 0) return alert("⚠️ Ingresá un monto válido.");

    if (!db.gastos) db.gastos = [];
    db.gastos.unshift({
        id: Date.now().toString(),
        fecha: fecha,
        descripcion: desc,
        monto: monto,
        categoria: categoria
    });

    saveDB();
    alert("✅ Gasto registrado.");
    document.getElementById('m4-gasto-desc').value = '';
    document.getElementById('m4-gasto-monto').value = '';
    m4_renderResumen();
    m4_renderListaGastos();
}

function m4_borrarGasto(id) {
    if (!confirm("¿Borrar este gasto? No se puede deshacer.")) return;
    db.gastos = db.gastos.filter(g => g.id !== id);
    saveDB();
    m4_renderResumen();
    m4_renderListaGastos();
}

function m4_renderListaGastos() {
    let cont = document.getElementById('m4-gastos-container');
    let gastos = (db.gastos || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    if (gastos.length === 0) {
        cont.innerHTML = '<p style="text-align:center; font-size:12px; color:#888;">Todavía no cargaste ningún gasto.</p>';
        return;
    }

    let html = '';
    gastos.forEach(g => {
        html += `
        <div class="card-item" style="border-left-color: var(--accent);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <b style="font-size:14px;">${g.descripcion}</b><br>
                    <span style="font-size:11px; color:#888;">${g.fecha} · ${g.categoria || 'General'}</span>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:16px; font-weight:900; color:var(--danger);">-$${g.monto}</span><br>
                    <button onclick="m4_borrarGasto('${g.id}')" style="background:none; border:none; color:var(--danger); text-decoration:underline; font-size:10px; padding:0; margin-top:4px; cursor:pointer;">🗑️ Borrar</button>
                </div>
            </div>
        </div>`;
    });
    cont.innerHTML = html;
}
