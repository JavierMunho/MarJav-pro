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

// --- Costo real de lo vendido (para calcular la Ganancia Neta de verdad) ---

// Costo de un remito (Módulo 3): usa el costo base del producto y el peso/cantidad
// vendida. Para productos por peso, el peso viene en el nombre del ítem, ej:
// "Mix Tropical (500g)" — lo mismo que arma m3_agregarItemDesdeAcordeon.
function m4_costoVenta(v) {
    let costoTotal = 0;
    (v.items || []).forEach(item => {
        let producto = db.productos.find(p => p.id === item.id);
        if (!producto) return; // producto borrado: no podemos saber el costo, lo omitimos

        if (producto.familia === '🎁 Combos y Ofertas') {
            // Los combos guardan su costo real (contenido + envase) al crearlos.
            let costoUnitCombo = (producto.costoReal !== undefined) ? producto.costoReal : 0;
            costoTotal += costoUnitCombo * (item.cant || 0);
            return;
        }

        if (producto.esUnidad) {
            costoTotal += (producto.costo || 0) * (item.cant || 0);
        } else {
            let match = (item.nombre || '').match(/\(([\d.,]+)\s*(kg|g)\)/i);
            let gramos = 0;
            if (match) {
                let num = parseFloat(match[1].replace(',', '.'));
                gramos = match[2].toLowerCase() === 'kg' ? num * 1000 : num;
            }
            costoTotal += ((producto.costo || 0) / 1000) * gramos * (item.cant || 0);
        }
    });
    return costoTotal;
}

// Costo de una visita de consignación: la planilla ya guarda "vend" (cantidad
// vendida) por producto, en la misma unidad de referencia que usa ese módulo
// (100g para productos por peso, unidad para el resto).
function m4_costoConsignacion(h) {
    let costoTotal = 0;
    (h.planilla || []).forEach(item => {
        let producto = db.productos.find(p => p.id === item.pid);
        if (!producto) return;
        let costoUnitario = producto.esUnidad ? (producto.costo || 0) : ((producto.costo || 0) / 10);
        costoTotal += costoUnitario * (item.vend || 0);
    });
    return costoTotal;
}

function m4_editarCajaActual() {
    let todosMovs = m4_obtenerTodosLosMovimientos();
    let efectivoActual = parseFloat(db.saldoInicialEfectivo) || 0;
    let cuentaActual = parseFloat(db.saldoInicialCuenta) || 0;
    todosMovs.forEach(m => {
        let signo = m.tipo === 'Ingreso' ? 1 : -1;
        if (m.medio === 'Efectivo') efectivoActual += signo * m.monto;
        else cuentaActual += signo * m.monto;
    });

    let nuevoEfeStr = prompt(`Efectivo actual calculado: $${efectivoActual.toFixed(0)}\n\n¿Cuál es el valor real de Efectivo?`, efectivoActual.toFixed(0));
    if (nuevoEfeStr === null) return;
    let nuevoCuentaStr = prompt(`Cuenta actual calculada: $${cuentaActual.toFixed(0)}\n\n¿Cuál es el valor real de Cuenta?`, cuentaActual.toFixed(0));
    if (nuevoCuentaStr === null) return;

    let nuevoEfe = parseFloat(nuevoEfeStr);
    let nuevoCuenta = parseFloat(nuevoCuentaStr);
    if (isNaN(nuevoEfe) || isNaN(nuevoCuenta)) return alert("⚠️ Ingresá números válidos.");

    let difEfe = nuevoEfe - efectivoActual;
    let difCuenta = nuevoCuenta - cuentaActual;
    let fecha = new Date().toISOString().split('T')[0];

    if (!db.gastos) db.gastos = [];
    if (Math.abs(difEfe) > 0.01) {
        db.gastos.unshift({ id: Date.now().toString() + 'a', fecha: fecha, descripcion: 'Ajuste de saldo', monto: Math.abs(difEfe), tipo: difEfe > 0 ? 'Ingreso' : 'Egreso', categoria: 'Ajuste', medioPago: 'Efectivo' });
    }
    if (Math.abs(difCuenta) > 0.01) {
        db.gastos.unshift({ id: Date.now().toString() + 'b', fecha: fecha, descripcion: 'Ajuste de saldo', monto: Math.abs(difCuenta), tipo: difCuenta > 0 ? 'Ingreso' : 'Egreso', categoria: 'Ajuste', medioPago: 'Transferencia' });
    }

    saveDB();
    m4_renderResumen();
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

function m4_renderPendientes() {
    // Pedidos sin cobrar (Módulo 3)
    let pedidosSinCobrar = (db.ventas || []).filter(v => v.pago !== 'Pagado');
    let totalSinCobrar = pedidosSinCobrar.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);

    // Pedidos sin entregar (Módulo 3)
    let pedidosSinEntregar = (db.ventas || []).filter(v => v.estado !== 'Entregado');
    let totalSinEntregar = pedidosSinEntregar.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);

    // Deuda de consignación (Módulo 2), solo locales con deuda > 0
    let localesConDeuda = (db.clientes || []).filter(c => (parseFloat(c.deuda) || 0) > 0);
    let totalDeudaConsignacion = localesConDeuda.reduce((s, c) => s + (parseFloat(c.deuda) || 0), 0);

    // Stock distribuido en consignación, valorizado al precio de venta vigente en cada local
    let stockPorArticulo = {}; // pid -> { cant, valor, costo }
    let localesConStock = 0;
    (db.clientes || []).forEach(c => {
        let stockCliente = db.stock_consignacion ? db.stock_consignacion[c.id] : null;
        if (!stockCliente) return;
        let tieneStock = false;
        for (let pid in stockCliente) {
            let s = stockCliente[pid];
            if (!s || !s.cant || s.cant <= 0) continue;
            tieneStock = true;
            let producto = db.productos.find(p => p.id === pid);
            let costoUnitario = producto ? (producto.esUnidad ? (producto.costo || 0) : (producto.costo || 0) / 10) : 0;
            if (!stockPorArticulo[pid]) stockPorArticulo[pid] = { cant: 0, valor: 0, costo: 0 };
            stockPorArticulo[pid].cant += s.cant;
            stockPorArticulo[pid].valor += s.cant * (s.pV || 0);
            stockPorArticulo[pid].costo += s.cant * costoUnitario;
        }
        if (tieneStock) localesConStock++;
    });
    let totalValorConsignacion = 0;
    let cantidadArticulosDistintos = 0;
    for (let pid in stockPorArticulo) { totalValorConsignacion += stockPorArticulo[pid].valor; cantidadArticulosDistintos++; }

    let filaPendiente = (icono, titulo, cantidad, total, filasDetalle) => {
        let colorMonto = cantidad === 0 ? '#aaa' : 'var(--accent)';
        return `
        <details class="familia-collapse" style="margin-bottom:8px;">
            <summary>
                <span>${icono} ${titulo} (${cantidad})</span>
                <b style="color:${colorMonto}; margin-right:8px;">$${total.toFixed(0)}</b>
            </summary>
            <div style="padding:10px;">${filasDetalle}</div>
        </details>`;
    };

    let detalleSinCobrar = pedidosSinCobrar.map(v =>
        `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
            <span>${v.cliente} <span style="color:#999;">(${v.fecha})</span></span><b>$${v.total}</b>
        </div>`
    ).join('') || '<p style="font-size:11px; color:#999;">Nada pendiente.</p>';

    let detalleSinEntregar = pedidosSinEntregar.map(v =>
        `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
            <span>${v.cliente} <span style="color:#999;">(${v.fecha})</span></span><b>$${v.total}</b>
        </div>`
    ).join('') || '<p style="font-size:11px; color:#999;">Nada pendiente.</p>';

    let detalleConsignacion = localesConDeuda.map(c =>
        `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
            <span>${c.nombre}</span><b>$${c.deuda}</b>
        </div>`
    ).join('') || '<p style="font-size:11px; color:#999;">Nada pendiente.</p>';

    // Detalle de stock valorizado, con el mismo formato de tabla que usan las planillas
    // (agrupado por familia, con fila de encabezado de categoría).
    let filasHtmlStock = "";
    (db.familias || []).forEach(f => {
        let prods = (db.productos || []).filter(p => p.familia === f && stockPorArticulo[p.id]);
        if (prods.length === 0) return;
        let filasFam = prods.map(p => {
            let d = stockPorArticulo[p.id];
            let margen = d.valor - d.costo;
            return `<tr>
                <td style="text-align:left; padding:6px 4px; border-bottom:1px solid #eee; font-size:12px;">${p.nombre}</td>
                <td style="text-align:center; padding:6px 4px; border-bottom:1px solid #eee; font-size:12px;">${d.cant}</td>
                <td style="text-align:right; padding:6px 4px; border-bottom:1px solid #eee; font-size:12px; color:#888;">$${d.costo.toFixed(0)}</td>
                <td style="text-align:right; padding:6px 4px; border-bottom:1px solid #eee; font-size:12px; font-weight:bold;">$${d.valor.toFixed(0)}</td>
                <td style="text-align:right; padding:6px 4px; border-bottom:1px solid #eee; font-size:12px; font-weight:bold; color:var(--success);">$${margen.toFixed(0)}</td>
            </tr>`;
        }).join('');
        filasHtmlStock += `<tr class="fam-row"><td colspan="5" style="background:#d1d5db; color:#333; font-weight:bold; text-align:center; padding:6px; font-size:11px; text-transform:uppercase;">${f}</td></tr>${filasFam}`;
    });

    let detalleStockConsignacion = cantidadArticulosDistintos > 0
        ? `<div class="table-responsive"><table class="tabla-consignacion" style="width:100%;">
            <thead><tr>
                <th style="text-align:left; padding:6px 4px; font-size:10px;">Producto</th>
                <th style="padding:6px 4px; font-size:10px;">Cant.</th>
                <th style="text-align:right; padding:6px 4px; font-size:10px;">Costo</th>
                <th style="text-align:right; padding:6px 4px; font-size:10px;">Venta</th>
                <th style="text-align:right; padding:6px 4px; font-size:10px;">Margen</th>
            </tr></thead>
            <tbody>${filasHtmlStock}</tbody>
           </table></div>`
        : '<p style="font-size:11px; color:#999;">No hay stock distribuido en consignación.</p>';

    document.getElementById('m4-pendientes-container').innerHTML = `
        <div style="background:#fff; border:1px solid #eee; border-radius:12px; padding:12px; margin-top:12px;">
            <div style="font-size:12px; font-weight:bold; color:#856404; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">⏳ Pendientes</div>
            ${filaPendiente('📦', 'Pedidos sin cobrar', pedidosSinCobrar.length, totalSinCobrar, detalleSinCobrar)}
            ${filaPendiente('🚚', 'Pedidos sin entregar', pedidosSinEntregar.length, totalSinEntregar, detalleSinEntregar)}
            ${filaPendiente('🏪', 'Deuda en consignación', localesConDeuda.length, totalDeudaConsignacion, detalleConsignacion)}
            ${filaPendiente('🏷️', 'Stock en consignación (valorizado a venta)', localesConStock, totalValorConsignacion, detalleStockConsignacion)}
        </div>
    `;
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

    // --- GANANCIA NETA: ingresos, menos el costo de lo vendido, menos gastos — solo del período filtrado ---
    let movsFiltrados = todosMovs.filter(m => m4_enRango(m.fecha, desde, hasta));
    let ingresosPeriodo = 0, egresosPeriodo = 0;
    movsFiltrados.forEach(m => { if (m.tipo === 'Ingreso') ingresosPeriodo += m.monto; else egresosPeriodo += m.monto; });

    let costoVendidoPeriodo = 0;
    (db.ventas || []).forEach(v => {
        if (v.pago === 'Pagado' && m4_enRango(v.fecha, desde, hasta)) costoVendidoPeriodo += m4_costoVenta(v);
    });
    (db.historial_consignacion || []).forEach(h => {
        if (h.tipo !== 'pago' && m4_enRango(h.fecha, desde, hasta)) costoVendidoPeriodo += m4_costoConsignacion(h);
    });

    let gananciaNeta = ingresosPeriodo - costoVendidoPeriodo;

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
                <div style="font-size:11px; color:#888; margin-top:4px;">Cobrado − Costo</div>
            </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; font-size:11px; color:#666;">
            <div style="flex:1; min-width:110px; background:#f4f6f7; border-radius:8px; padding:8px; text-align:center;">💵 Efectivo<br><b style="font-size:14px;">$${efectivoAcum.toFixed(0)}</b></div>
            <div style="flex:1; min-width:110px; background:#f4f6f7; border-radius:8px; padding:8px; text-align:center;">🏦 Cuenta<br><b style="font-size:14px;">$${cuentaAcum.toFixed(0)}</b></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; font-size:10px; color:#888; text-align:center;">
            <div style="flex:1; min-width:90px;">Ingresos<br><b style="color:var(--success);">$${ingresosPeriodo.toFixed(0)}</b></div>
            <div style="flex:1; min-width:90px;">Costo vendido<br><b style="color:var(--danger);">-$${costoVendidoPeriodo.toFixed(0)}</b></div>
            <div style="flex:1; min-width:90px;">Gastos (aparte)<br><b style="color:var(--danger);">-$${egresosPeriodo.toFixed(0)}</b></div>
        </div>
        <p style="font-size:9px; color:#aaa; margin:4px 0 0 0; text-align:center;">Los gastos afectan la Caja pero no la Ganancia Neta (que es Cobrado − Costo).</p>
        <button onclick="m4_editarCajaActual()" style="width:100%; margin-top:10px; background:none; border:1px dashed #ccc; color:#888; font-size:11px; padding:8px; border-radius:8px; cursor:pointer;">✏️ Corregir valor actual de Efectivo/Cuenta</button>
    `;

    try { m4_renderPendientes(); } catch(e) { console.warn('Error mostrando pendientes:', e); }

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
