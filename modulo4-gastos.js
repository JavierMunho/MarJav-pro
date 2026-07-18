// ==========================================
// MÓDULO 4: FINANZAS
// ==========================================
// Este archivo se carga desde index.html con <script src="modulo4-gastos.js"></script>.
// Usa las mismas variables globales que el resto de la app: db, saveDB(), nav(), etc.
//
// Los INGRESOS de Ventas y Consignaciones se toman solos de esos módulos.
// Además se puede cargar a mano cualquier Gasto u Otro Ingreso suelto (ej: un
// cobro atrasado, un reintegro) con los botones ➖ Gasto / ➕ Ingreso.
//
// db.gastos guarda TODOS los movimientos manuales (gastos e ingresos sueltos),
// cada uno con un campo "tipo": 'Egreso' o 'Ingreso'. Los que no tienen ese
// campo (cargados antes de este cambio) se tratan como 'Egreso' para no perder
// nada de lo que ya habías cargado.

let m4_tipoMovimientoActual = 'Egreso';

function initM4() {
    let hoy = new Date().toISOString().split('T')[0];
    let inputDesde = document.getElementById('m4-fecha-desde');
    let inputHasta = document.getElementById('m4-fecha-hasta');
    if (!inputDesde.value) {
        let primerDiaMes = hoy.slice(0, 8) + '01';
        inputDesde.value = primerDiaMes;
    }
    if (!inputHasta.value) inputHasta.value = hoy;
    document.getElementById('m4-form-rapido').style.display = 'none';
    m4_renderResumen();
}

// Convierte fechas en formato "D/M/YYYY" (las que arma toLocaleDateString) a un objeto Date.
// Las fechas que ya vienen en formato ISO "YYYY-MM-DD" (como las de Ventas y movimientos
// manuales) se parsean directo, sin pasar por acá.
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

function m4_formatearFechaHora(fechaStr) {
    let f = m4_parsearFechaLocal(fechaStr);
    if (!f) return fechaStr;
    return f.toLocaleDateString('es-AR');
}

// Arma la lista unificada de movimientos (ingresos y egresos) a partir de
// Ventas, Consignaciones y los cargados a mano (Gasto / Ingreso).
function m4_obtenerTodosLosMovimientos() {
    let movs = [];

    (db.ventas || []).forEach(v => {
        if (v.pago === 'Pagado') {
            movs.push({
                fecha: v.fecha, titulo: 'Cobro Pedido', detalle: `${v.cliente} — $${v.total}`, tipo: 'Ingreso',
                medio: v.medioPago || 'Efectivo', monto: parseFloat(v.total) || 0,
                origen: 'venta', id: v.id
            });
        }
    });

    (db.historial_consignacion || []).forEach(h => {
        let cli = db.clientes.find(c => c.id === h.clienteId);
        let nombreCliente = cli ? cli.nombre : '(local borrado)';
        if (h.tipo === 'pago') {
            movs.push({
                fecha: h.fecha, titulo: 'Cobro Deuda Consig.', detalle: `Pago atrasado: ${nombreCliente}`, tipo: 'Ingreso',
                medio: h.medioPago || 'Efectivo', monto: parseFloat(h.monto) || 0,
                origen: 'consignacion', id: h.id
            });
        } else if (h.cobrado > 0) {
            movs.push({
                fecha: h.fecha, titulo: 'Venta Consig.', detalle: nombreCliente, tipo: 'Ingreso',
                medio: h.medioPago || 'Efectivo', monto: parseFloat(h.cobrado) || 0,
                origen: 'consignacion', id: h.id
            });
        }
    });

    (db.gastos || []).forEach(g => {
        let tipo = g.tipo === 'Ingreso' ? 'Ingreso' : 'Egreso'; // compatibilidad con gastos viejos sin "tipo"
        movs.push({
            fecha: g.fecha, titulo: tipo === 'Ingreso' ? 'Otro Ingreso' : 'Gasto', detalle: g.descripcion, tipo: tipo,
            medio: g.medioPago || 'Efectivo', monto: parseFloat(g.monto) || 0,
            origen: 'manual', id: g.id
        });
    });

    return movs;
}

function m4_editarSaldoInicial() {
    let efeStr = prompt("Saldo inicial en EFECTIVO (lo que ya tenías antes de usar la app):", db.saldoInicialEfectivo || 0);
    if (efeStr === null) return;
    let cuentaStr = prompt("Saldo inicial en CUENTA/TRANSFERENCIA:", db.saldoInicialCuenta || 0);
    if (cuentaStr === null) return;

    let efe = parseFloat(efeStr);
    let cue = parseFloat(cuentaStr);
    if (isNaN(efe) || isNaN(cue)) return alert("⚠️ Ingresá números válidos.");

    db.saldoInicialEfectivo = efe;
    db.saldoInicialCuenta = cue;
    saveDB();
    m4_renderResumen();
}

// --- Formulario rápido de Gasto / Ingreso ---
function m4_registrarMovimiento(tipo) {
    m4_tipoMovimientoActual = tipo;
    let form = document.getElementById('m4-form-rapido');
    let btnConfirmar = document.getElementById('m4-form-confirmar');
    form.style.display = 'block';
    if (tipo === 'Egreso') {
        btnConfirmar.style.background = 'var(--danger)';
        btnConfirmar.innerText = 'Guardar Gasto';
    } else {
        btnConfirmar.style.background = 'var(--success)';
        btnConfirmar.innerText = 'Guardar Ingreso';
    }
    document.getElementById('m4-mov-desc').focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function m4_cancelarMovimiento() {
    document.getElementById('m4-form-rapido').style.display = 'none';
    document.getElementById('m4-mov-desc').value = '';
    document.getElementById('m4-mov-monto').value = '';
}

function m4_confirmarMovimiento() {
    let desc = document.getElementById('m4-mov-desc').value.trim();
    let monto = parseFloat(document.getElementById('m4-mov-monto').value);
    let medioRadio = document.querySelector('input[name="m4-medio"]:checked');
    let medioPago = medioRadio ? medioRadio.value : 'Efectivo';
    let fecha = new Date().toISOString().split('T')[0];

    if (!desc) return alert("⚠️ Ingresá una descripción.");
    if (isNaN(monto) || monto <= 0) return alert("⚠️ Ingresá un monto válido.");

    if (!db.gastos) db.gastos = [];
    db.gastos.unshift({
        id: Date.now().toString(),
        fecha: fecha,
        descripcion: desc,
        monto: monto,
        tipo: m4_tipoMovimientoActual,
        categoria: 'General',
        medioPago: medioPago
    });

    saveDB();
    m4_cancelarMovimiento();
    m4_renderResumen();
}

function m4_borrarMovimientoManual(id) {
    if (!confirm("¿Borrar este movimiento? No se puede deshacer.")) return;
    db.gastos = db.gastos.filter(g => g.id !== id);
    saveDB();
    m4_renderResumen();
}

function m4_renderResumen() {
    let desde = document.getElementById('m4-fecha-desde').value;
    let hasta = document.getElementById('m4-fecha-hasta').value;

    let todosMovs = m4_obtenerTodosLosMovimientos();

    // --- CAJA: saldo acumulado de TODA la historia (no depende del filtro de fechas) ---
    let efectivoAcum = parseFloat(db.saldoInicialEfectivo) || 0;
    let cuentaAcum = parseFloat(db.saldoInicialCuenta) || 0;
    todosMovs.forEach(m => {
        let signo = m.tipo === 'Ingreso' ? 1 : -1;
        if (m.medio === 'Efectivo') efectivoAcum += signo * m.monto;
        else cuentaAcum += signo * m.monto;
    });
    let caja = efectivoAcum + cuentaAcum;

    // --- GANANCIA NETA: ingresos menos gastos, solo del período filtrado ---
    let movsFiltrados = todosMovs.filter(m => m4_enRango(m.fecha, desde, hasta));
    let ingresosPeriodo = 0, egresosPeriodo = 0;
    movsFiltrados.forEach(m => { if (m.tipo === 'Ingreso') ingresosPeriodo += m.monto; else egresosPeriodo += m.monto; });
    let gananciaNeta = ingresosPeriodo - egresosPeriodo;

    document.getElementById('m4-tarjetas-container').innerHTML = `
        <div class="grid-2">
            <div style="background:#eafaf1; border:2px solid var(--success); border-radius:12px; padding:18px 10px; text-align:center;">
                <div style="font-size:12px; font-weight:bold; color:var(--success); text-transform:uppercase; letter-spacing:0.5px;">Caja</div>
                <div style="font-size:26px; font-weight:900; color:var(--success); margin-top:6px; word-break:break-all;">$${caja.toFixed(0)}</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">Cobros − Gastos</div>
            </div>
            <div style="background:#eaf2fb; border:2px solid var(--info); border-radius:12px; padding:18px 10px; text-align:center;">
                <div style="font-size:12px; font-weight:bold; color:var(--info); text-transform:uppercase; letter-spacing:0.5px;">Ganancia Neta</div>
                <div style="font-size:26px; font-weight:900; color:var(--info); margin-top:6px; word-break:break-all;">$${gananciaNeta.toFixed(0)}</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">Período seleccionado</div>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; font-size:11px; color:#666;">
            <div style="flex:1; min-width:110px; background:#f4f6f7; border-radius:8px; padding:8px; text-align:center;">💵 Efectivo<br><b style="font-size:14px;">$${efectivoAcum.toFixed(0)}</b></div>
            <div style="flex:1; min-width:110px; background:#f4f6f7; border-radius:8px; padding:8px; text-align:center;">🏦 Cuenta<br><b style="font-size:14px;">$${cuentaAcum.toFixed(0)}</b></div>
        </div>
    `;

    // --- Lista de movimientos (respeta el filtro de fechas) ---
    movsFiltrados.sort((a, b) => {
        let fa = m4_parsearFechaLocal(a.fecha), fb = m4_parsearFechaLocal(b.fecha);
        if (!fa || !fb) return 0;
        return fb - fa;
    });

    let contMov = document.getElementById('m4-movimientos-container');
    if (movsFiltrados.length === 0) {
        contMov.innerHTML = '<p style="text-align:center; font-size:12px; color:#888;">No hay movimientos en este rango de fechas.</p>';
        return;
    }

    let html = '';
    movsFiltrados.forEach(m => {
        let esIngreso = m.tipo === 'Ingreso';
        let colorBorde = esIngreso ? 'var(--success)' : 'var(--danger)';
        let colorMonto = esIngreso ? 'var(--success)' : 'var(--danger)';
        let signo = esIngreso ? '+' : '-';
        let btnBorrar = m.origen === 'manual' ? `<button onclick="m4_borrarMovimientoManual('${m.id}')" style="background:none; border:none; color:#bbb; font-size:13px; padding:2px 4px; cursor:pointer;">🗑️</button>` : '';

        html += `
        <div class="card-item" style="border-left-color: ${colorBorde}; padding:12px 15px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <b style="font-size:14px;">${m.titulo}</b>
                    <div style="font-size:11px; color:#888; margin-top:2px;">${m4_formatearFechaHora(m.fecha)} | ${m.detalle}</div>
                    <div style="font-size:10px; color:#aaa; margin-top:2px;">${m.medio === 'Efectivo' ? '💵' : '🏦'} ${m.medio}</div>
                </div>
                <div style="text-align:right; white-space:nowrap; display:flex; align-items:center; gap:4px;">
                    <span style="font-size:16px; font-weight:900; color:${colorMonto};">${signo}$${m.monto.toFixed(0)}</span>
                    ${btnBorrar}
                </div>
            </div>
        </div>`;
    });
    contMov.innerHTML = html;
}

function m4_exportarPDFMovimientos() {
    try {
        let desde = document.getElementById('m4-fecha-desde').value;
        let hasta = document.getElementById('m4-fecha-hasta').value;
        let movs = m4_obtenerTodosLosMovimientos().filter(m => m4_enRango(m.fecha, desde, hasta));
        movs.sort((a, b) => {
            let fa = m4_parsearFechaLocal(a.fecha), fb = m4_parsearFechaLocal(b.fecha);
            if (!fa || !fb) return 0;
            return fb - fa;
        });

        if (movs.length === 0) return alert("⚠️ No hay movimientos en este rango de fechas.");

        const { jsPDF } = window.jspdf; const doc = new jsPDF();

        doc.setFillColor(44, 62, 80);
        doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.text("marJav Pro", 15, 14);
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        doc.text("Movimientos — Ingresos y Egresos", 15, 22);
        doc.text(`${desde || '...'} al ${hasta || '...'}`, doc.internal.pageSize.getWidth() - 15, 22, { align: "right" });
        doc.setTextColor(0, 0, 0);

        let totalIngresos = 0, totalEgresos = 0;
        let bodyData = movs.map(m => {
            if (m.tipo === 'Ingreso') totalIngresos += m.monto; else totalEgresos += m.monto;
            return [m4_formatearFechaHora(m.fecha), `${m.titulo} — ${m.detalle}`, m.medio, m.tipo === 'Ingreso' ? `+$${m.monto}` : `-$${m.monto}`];
        });

        doc.autoTable({
            startY: 36, head: [['Fecha', 'Descripción', 'Medio', 'Monto']], body: bodyData, theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 90 }, 2: { halign: 'center' }, 3: { halign: 'right', fontStyle: 'bold' } }
        });

        let finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.setTextColor(39, 174, 96);
        doc.text(`Ingresos: $${totalIngresos.toFixed(0)}`, 15, finalY);
        doc.setTextColor(192, 57, 43);
        doc.text(`Egresos: $${totalEgresos.toFixed(0)}`, 90, finalY);
        doc.setTextColor(44, 62, 80);
        doc.text(`Neto: $${(totalIngresos - totalEgresos).toFixed(0)}`, 150, finalY);

        doc.setFontSize(9); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120);
        doc.text("Contacto: Javier 1138988346 | Marcela 1157081322", 15, doc.internal.pageSize.getHeight() - 12);

        doc.save(`Movimientos_${(desde || 'inicio')}_${(hasta || 'hoy')}.pdf`);
    } catch(e) { alert("⚠️ Error PDF: " + e.message); }
}
