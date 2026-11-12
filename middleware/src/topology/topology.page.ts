export const topologyHtml = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OSS Lab — Topología</title>
<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.min.js"></script>
<style>
  html, body { margin: 0; height: 100%; background: #0f1419; color: #e6edf3; font-family: system-ui, sans-serif; }
  #header { padding: 12px 16px; border-bottom: 1px solid #263040; display: flex; align-items: center; gap: 12px; }
  #header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  #status { font-size: 12px; color: #8b949e; }
  #cy { position: absolute; top: 49px; left: 0; right: 0; bottom: 0; }
  #legend { position: absolute; bottom: 12px; left: 12px; font-size: 12px; color: #8b949e; background: #161b22; border: 1px solid #263040; border-radius: 6px; padding: 8px 12px; line-height: 1.6; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  #alarms { position: absolute; top: 61px; right: 12px; width: 300px; max-height: calc(40% - 12px); overflow-y: auto; font-size: 12px; }
  #alarms h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #8b949e; margin: 0 0 6px; }
  .alarm { background: #2a1215; border: 1px solid #f85149; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; color: #ffdcd7; }
  .alarm.sev-high { border-color: #f85149; }
  .alarm.sev-low { border-color: #d29922; background: #2b2111; color: #f2e3b3; }
  #alarms.empty { display: none; }
  #detail { position: absolute; bottom: 12px; right: 12px; width: 300px; font-size: 12px; background: #161b22; border: 1px solid #263040; border-radius: 6px; padding: 10px 12px; display: none; }
  #detail.open { display: block; }
  #detail h2 { font-size: 13px; margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; }
  #detail-close { cursor: pointer; color: #8b949e; font-weight: normal; }
  #detail table { width: 100%; border-collapse: collapse; }
  #detail td { padding: 3px 0; vertical-align: top; }
  #detail td:first-child { color: #8b949e; padding-right: 10px; white-space: nowrap; }
</style>
</head>
<body>
  <div id="header">
    <h1>OSS Lab — Topología</h1>
    <span id="status">cargando…</span>
  </div>
  <div id="cy"></div>
  <div id="alarms" class="empty">
    <h2>Alarmas activas (Zabbix)</h2>
    <div id="alarms-list"></div>
  </div>
  <div id="detail">
    <h2><span id="detail-title"></span><span id="detail-close">cerrar ✕</span></h2>
    <table id="detail-table"></table>
  </div>
  <div id="legend">
    <div><span class="dot" style="background:#3fb950"></span>Sitio activo</div>
    <div><span class="dot" style="background:#6e7681"></span>Sitio inactivo</div>
    <div><span class="dot" style="background:#58a6ff"></span>NF arriba</div>
    <div><span class="dot" style="background:#f85149"></span>NF caído / con alarma</div>
    <div style="margin-top:4px">Click en un nodo para ver detalle</div>
  </div>
<script>
  const cy = cytoscape({
    container: document.getElementById('cy'),
    style: [
      { selector: 'node', style: {
        label: 'data(displayLabel)', color: '#e6edf3', 'font-size': 11, 'text-valign': 'bottom', 'text-margin-y': 6,
        width: 36, height: 36,
      }},
      { selector: 'node[type="site"]', style: { shape: 'ellipse', 'background-color': '#6e7681' } },
      { selector: 'node[type="site"][status="active"]', style: { 'background-color': '#3fb950' } },
      { selector: 'node[type="nf"]', style: { shape: 'round-rectangle', 'background-color': '#f85149', width: 60, height: 36 } },
      { selector: 'node[type="nf"][status="up"]', style: { 'background-color': '#58a6ff' } },
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#e6edf3' } },
      { selector: 'edge', style: { 'curve-style': 'bezier', 'line-color': '#30363d', 'target-arrow-color': '#30363d', 'target-arrow-shape': 'triangle', width: 2 } },
    ],
  });

  let firstLoad = true;

  function displayLabel(n) {
    if (n.type === 'nf' && n.metric !== null && n.metric !== undefined) {
      return n.label + ' (' + n.metric + ')';
    }
    return n.label;
  }

  function showDetail(n) {
    document.getElementById('detail-title').textContent = n.label;
    const table = document.getElementById('detail-table');
    table.innerHTML = '';
    for (const [key, value] of Object.entries(n.details || {})) {
      const row = table.insertRow();
      row.insertCell().textContent = key;
      row.insertCell().textContent = value;
    }
    document.getElementById('detail').classList.add('open');
  }

  cy.on('tap', 'node', (evt) => showDetail(evt.target.data()));
  cy.on('tap', (evt) => {
    if (evt.target === cy) document.getElementById('detail').classList.remove('open');
  });
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail').classList.remove('open');
  });

  // Actualiza en vivo sin reiniciar el layout: si ya existe el nodo, solo se refrescan sus
  // datos (para no deshacer si lo moviste a mano); el layout solo corre si hay nodos nuevos.
  function applyTopology(topo) {
    const incomingIds = new Set(topo.nodes.map((n) => n.id));

    cy.nodes().forEach((el) => {
      if (!incomingIds.has(el.id())) el.remove();
    });

    let addedAny = false;
    for (const n of topo.nodes) {
      const data = { id: n.id, label: n.label, displayLabel: displayLabel(n), type: n.type, status: n.status, metric: n.metric, details: n.details };
      const el = cy.getElementById(n.id);
      if (el.nonempty()) {
        el.data(data);
        if (el.selected()) showDetail(data);
      } else {
        cy.add({ data });
        addedAny = true;
      }
    }

    cy.edges().remove();
    cy.add(topo.edges.map((e) => ({ data: { source: e.source, target: e.target } })));

    if (firstLoad || addedAny) {
      cy.layout({ name: 'breadthfirst', directed: true, spacingFactor: 1.2 }).run();
      firstLoad = false;
    }
  }

  function renderAlarms(alarms) {
    const alarmsEl = document.getElementById('alarms');
    const alarmsList = document.getElementById('alarms-list');
    alarmsList.innerHTML = '';
    if (alarms.length === 0) {
      alarmsEl.classList.add('empty');
      return;
    }
    alarmsEl.classList.remove('empty');
    for (const a of alarms) {
      const div = document.createElement('div');
      div.className = 'alarm ' + (a.severity >= 4 ? 'sev-high' : 'sev-low');
      div.textContent = a.name;
      alarmsList.appendChild(div);
    }
  }

  async function refresh() {
    const statusEl = document.getElementById('status');
    try {
      const res = await fetch('/topology');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const topo = await res.json();

      applyTopology(topo);
      renderAlarms(topo.alarms);

      statusEl.textContent = 'actualizado ' + new Date().toLocaleTimeString();
    } catch (err) {
      statusEl.textContent = 'error al leer /topology: ' + err.message;
    }
  }

  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>
`;
