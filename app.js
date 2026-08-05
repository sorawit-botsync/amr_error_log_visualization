/* ==============================
   AMR Error Log Visualizer JS
   ============================== */

// Grass-green palette — industrial design system
const PAL = [
  '#6B9E5A','#2E7D32','#a9cec1','#406659','#d0ed9a','#b5d081',
  '#c2ecdb','#8fb88a','#4e8c3d','#3a6e54','#7db56e','#5a9a48',
  '#9abf8c','#62a84f','#1e6b26','#3d7a32','#84b374','#4f9940',
  '#2a5e21','#6b9e5a',
];

const FILES = [];
let rawData = [], filteredData = [], charts = {};

function populateFileSelect(sel, list) {
  list.forEach(fname => {
    if (!FILES.includes(fname)) {
      FILES.push(fname);
      sel.appendChild(new Option(fname, fname));
    }
  });
  sel.options[0].text = FILES.length
    ? `-- select a file (${FILES.length} found) --`
    : '-- no CSV files found in datas/ --';
}

// ── Init ────────────────────────────────────────────────────────────────────

window.onload = () => {
  const sel = document.getElementById('file-select');

  // 1. Try files.json manifest (works on Vercel & all static hosts)
  // 2. Fall back to HTML directory listing (Python local dev server)
  fetch('datas/files.json')
    .then(r => { if (!r.ok) throw new Error('no manifest'); return r.json(); })
    .then(list => populateFileSelect(sel, list))
    .catch(() =>
      fetch('datas/')
        .then(r => r.text())
        .then(html => {
          const matches = [...html.matchAll(/href="([^"]+\.csv)"/gi)];
          const list = matches.map(m => decodeURIComponent(m[1].replace(/^.*\//, '')));
          populateFileSelect(sel, list);
        })
        .catch(() => { sel.options[0].text = '-- upload a file manually --'; })
    );

  // Drag-and-drop
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });
};

// ── File loading ─────────────────────────────────────────────────────────────

function loadSelected() {
  const v = document.getElementById('file-select').value;
  if (!v) return alert('Select a file first.');
  fetch('datas/' + v)
    .then(r => {
      if (!r.ok) throw new Error('Cannot fetch ' + v + '.\nOpen via local server: python3 -m http.server 8765');
      return r.text();
    })
    .then(t => { document.getElementById('file-label').textContent = v; parseCSV(t); })
    .catch(e => alert(e.message));
}

function handleUpload(inp) {
  const f = inp.files[0];
  if (f) readFile(f);
}

function readFile(f) {
  document.getElementById('file-label').textContent = f.name;
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(f);
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const hdr = splitLine(lines[0]);
  rawData = [];
  for (let i = 1; i < lines.length; i++) {
    const v = splitLine(lines[i]);
    if (v.length < 5) continue;
    const row = {};
    hdr.forEach((h, j) => row[h.trim()] = (v[j] || '').trim());
    rawData.push(row);
  }
  buildFilterUI();
  filteredData = [...rawData];
  renderAll();
  document.getElementById('filter-toggle').style.display = '';
  document.getElementById('reset-btn').style.display = '';
  document.getElementById('drop-zone').style.display = 'none';
}

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Filters ──────────────────────────────────────────────────────────────────

function uniq(key) {
  return [...new Set(rawData.map(r => r[key]).filter(Boolean))].sort();
}

function makeChecks(containerId, values) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  values.forEach(v => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${v}" checked onchange="applyFilter()"> ${v}`;
    el.appendChild(lbl);
  });
}

function buildFilterUI() {
  makeChecks('robot-checks', uniq('Robot Name'));
  makeChecks('code-checks', uniq('Error Code'));
  makeChecks('map-checks', uniq('Map Name'));
  makeChecks('status-checks', uniq('status'));

  // Set time range from data min/max
  const times = rawData.map(r => parseTS(r['Time Stamp'])).filter(Boolean).sort((a, b) => a - b);
  if (times.length) {
    document.getElementById('time-from').value = toLocalInput(times[0]);
    document.getElementById('time-to').value   = toLocalInput(times[times.length - 1]);
  }
}

function parseTS(s) {
  if (!s) return null;
  // Format: "2026-08-04 21:57:27 +07:00"
  const m = s.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})/);
  return m ? new Date(m[1] + 'T' + m[2]) : null;
}

function toLocalInput(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getChecked(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(i => i.value);
}

function applyFilter() {
  const robots   = getChecked('robot-checks');
  const codes    = getChecked('code-checks');
  const maps     = getChecked('map-checks');
  const statuses = getChecked('status-checks');
  const from = document.getElementById('time-from').value ? new Date(document.getElementById('time-from').value) : null;
  const to   = document.getElementById('time-to').value   ? new Date(document.getElementById('time-to').value)   : null;

  filteredData = rawData.filter(r => {
    if (!robots.includes(r['Robot Name']))  return false;
    if (!codes.includes(r['Error Code']))   return false;
    if (!maps.includes(r['Map Name']))      return false;
    if (!statuses.includes(r['status']))    return false;
    const ts = parseTS(r['Time Stamp']);
    if (from && ts && ts < from) return false;
    if (to   && ts && ts > to)   return false;
    return true;
  });
  renderAll();
}

function resetAll() {
  buildFilterUI();
  filteredData = [...rawData];
  renderAll();
}

function toggleFilters() {
  const p = document.getElementById('filter-panel');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function cnt(arr, key) {
  const c = {};
  arr.forEach(r => { const v = r[key] || '?'; c[v] = (c[v] || 0) + 1; });
  return c;
}

function topN(obj, n = 20) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function baseOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#414845', font: { size: 11, family: 'Hanken Grotesk' } } } },
    scales: {
      x: { ticks: { color: '#717975', font: { size: 11, family: 'Hanken Grotesk' } }, grid: { color: 'rgba(0,0,0,0.06)', dash: [4,4] } },
      y: { ticks: { color: '#717975', font: { size: 11, family: 'Hanken Grotesk' } }, grid: { color: 'rgba(0,0,0,0.06)', dash: [4,4] } },
    },
  };
}

function mkChart(id, cfg) {
  const canvas = document.getElementById(id);
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(canvas, cfg);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll() {
  document.getElementById('status-msg').style.display = 'none';
  document.getElementById('dashboard').style.display = '';

  // --- Stat cards ---
  const tot   = filteredData.length;
  const res   = filteredData.filter(r => r['status'] === 'RESOLVED').length;
  const codes = new Set(filteredData.map(r => r['Error Code'])).size;
  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card"><div class="lbl">Total Errors</div><div class="val">${tot}</div></div>
    <div class="stat-card c-green"><div class="lbl">Resolved</div><div class="val">${res}</div></div>
    <div class="stat-card c-error"><div class="lbl">Unresolved</div><div class="val">${tot - res}</div></div>
    <div class="stat-card c-teal"><div class="lbl">Unique Error Codes</div><div class="val">${codes}</div></div>`;

  // --- Error Code histogram ---
  const ecTop = topN(cnt(filteredData, 'Error Code'), 20);
  mkChart('chart-error-code', {
    type: 'bar',
    data: {
      labels: ecTop.map(([k]) => k),
      datasets: [{
        label: 'Count',
        data: ecTop.map(([, v]) => v),
        backgroundColor: ecTop.map((_, i) => PAL[i % PAL.length] + 'cc'),
        borderColor:     ecTop.map((_, i) => PAL[i % PAL.length]),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...baseOpts(),
      plugins: {
        ...baseOpts().plugins,
        tooltip: {
          callbacks: {
            afterLabel: ctx => {
              const key = ecTop[ctx.dataIndex][0];
              const row = filteredData.find(r => r['Error Code'] === key);
              return row ? row['Title'] : '';
            },
          },
        },
      },
    },
  });

  // --- Errors per Robot ---
  const robTop = topN(cnt(filteredData, 'Robot Name'));
  mkChart('chart-robot', {
    type: 'bar',
    data: {
      labels: robTop.map(([k]) => k),
      datasets: [{ label: 'Errors', data: robTop.map(([, v]) => v), backgroundColor: '#6B9E5A', borderColor: '#2E7D32', borderWidth: 1, borderRadius: 2 }],
    },
    options: baseOpts(),
  });

  // --- Errors per Map ---
  const mapTop = topN(cnt(filteredData, 'Map Name'));
  mkChart('chart-map', {
    type: 'doughnut',
    data: {
      labels: mapTop.map(([k]) => k),
      datasets: [{ data: mapTop.map(([, v]) => v), backgroundColor: PAL, borderWidth: 2, borderColor: '#f3f4ef' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#414845', font: { size: 12, family: 'Hanken Grotesk' } } } } },
  });

  // --- Status Distribution ---
  const stMap = cnt(filteredData, 'status');
  mkChart('chart-status', {
    type: 'pie',
    data: {
      labels: Object.keys(stMap),
      datasets: [{ data: Object.values(stMap), backgroundColor: ['#2E7D32', '#ba1a1a', '#406659'], borderWidth: 2, borderColor: '#f3f4ef' }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#414845', font: { size: 12, family: 'Hanken Grotesk' } } } } },
  });

  // --- Resolution Time Distribution ---
  const edges  = [0, 10, 30, 60, 120, 300, 600, 1200, 3600, 7200];
  const blabels = ['0-10s', '10-30s', '30-60s', '1-2m', '2-5m', '5-10m', '10-20m', '20-60m', '1-2h'];
  const bdata  = new Array(blabels.length).fill(0);
  filteredData.forEach(r => {
    const t = parseInt(r['Resolution Time (s)'] || '');
    if (isNaN(t) || t <= 0 || t >= 7200) return;
    for (let i = 0; i < edges.length - 1; i++) {
      if (t >= edges[i] && t < edges[i + 1]) { bdata[i]++; break; }
    }
  });
  mkChart('chart-restime', {
    type: 'bar',
    data: {
      labels: blabels,
      datasets: [{ label: 'Count', data: bdata, backgroundColor: '#6B9E5Acc', borderColor: '#6B9E5A', borderWidth: 1, borderRadius: 2 }],
    },
    options: baseOpts(),
  });

  // --- Errors Over Time (hourly) ---
  const hourly = {};
  filteredData.forEach(r => {
    const m = (r['Time Stamp'] || '').match(/(\d{4}-\d{2}-\d{2} \d{2})/);
    if (m) { const k = m[1] + ':00'; hourly[k] = (hourly[k] || 0) + 1; }
  });
  const sorted = Object.entries(hourly).sort((a, b) => a[0].localeCompare(b[0]));
  mkChart('chart-timeline', {
    type: 'line',
    data: {
      labels: sorted.map(([k]) => k.replace(' ', '\n')),
      datasets: [{
        label: 'Errors/hour',
        data: sorted.map(([, v]) => v),
        borderColor: '#6B9E5A',
        backgroundColor: 'rgba(107,158,90,0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#6B9E5A',
        pointBorderColor: '#2E7D32',
        pointBorderWidth: 1,
      }],
    },
    options: {
      ...baseOpts(),
      scales: {
        ...baseOpts().scales,
        x: { ...baseOpts().scales.x, ticks: { maxRotation: 45, color: '#8892b0', font: { size: 10 } } },
      },
    },
  });
}

// ── Save chart image ──────────────────────────────────────────────────────────

function saveChart(canvasId, name) {
  const canvas = document.getElementById(canvasId);
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  // Composite onto a white-background offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width  = canvas.width;
  offscreen.height = canvas.height;
  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(canvas, 0, 0);

  const a = document.createElement('a');
  a.href     = offscreen.toDataURL('image/png');
  a.download = `outputs/${name}_${ts}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  const toast = document.getElementById('toast');
  toast.textContent = `✅ Saved: ${name}_${ts}.png`;
  toast.style.opacity = '1';
  setTimeout(() => toast.style.opacity = '0', 2500);
}
