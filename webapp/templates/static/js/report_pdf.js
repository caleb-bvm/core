// static/js/report_pdf.js
// PDF (1 página) grande y legible: jsPDF + html2canvas + heatmap real + botón robusto

(function () {
  // ----- namespace opcional para registrar heatmap desde tu app -----
  window.CORE_REPORT = window.CORE_REPORT || {};
  // Llama a esto cuando generes el heatmap: window.CORE_REPORT.registerHeatmap(canvasOImagen)
  window.CORE_REPORT.registerHeatmap = function (source) { window.CORE_REPORT.heatmapSource = source; };
  // O si ya tienes un DataURL listo: window.CORE_REPORT.setHeatmapDataURL('data:image/png;base64,...')
  window.CORE_REPORT.setHeatmapDataURL = function (dataURL) { window.CORE_REPORT.heatmapDataURL = dataURL; };

  // ---------- Helpers ----------
  // Resuelve la URL pública del logo para html2canvas (mismo origen)
function resolveLogoURL(){
  // Si la página ya tiene un <img class="brand-logo">, reutilizamos su src
  const existing = document.querySelector('.brand-logo')?.src;
  if (existing) return existing;

  // Fallback: ruta estática servida por tu app
  // (ajústala si tu static se sirve en otra ruta)
  return new URL('/static/assets/core.png', location.origin).toString(); // fallback
}
// --- Added: robust DataURL helpers for logo ---
async function fetchAsDataURL(url) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

// Tries: existing <img.brand-logo>, window.CORE_REPORT.logoURL, fallback /static/assets/core.png
async function resolveLogoDataURL() {
  // 1) existing <img.brand-logo>
  const existing = document.querySelector('.brand-logo')?.src;
  if (existing) {
    const d1 = await fetchAsDataURL(existing);
    if (d1) return d1;
  }
  // 2) explicit URL provided by backend
  if (window.CORE_REPORT?.logoURL) {
    const d2 = await fetchAsDataURL(window.CORE_REPORT.logoURL);
    if (d2) return d2;
  }
  // 3) fallback static path (adjust if your static is elsewhere)
  const fallback = new URL('/static/assets/core.png', location.origin).toString();
  const d3 = await fetchAsDataURL(fallback);
  return d3; // may be null if not found
}
// --- End added helpers ---
// --- Added: strong resolver to ALWAYS embed logo as DataURL (PNG) ---
async function strongResolveLogoDataURL() {
  // Try the standard path
  let d = await resolveLogoDataURL();
  if (d) return d;

  // Last-ditch: if we have an explicit URL, load via <img> and rasterize to PNG
  try {
    const url = window.CORE_REPORT?.logoURL
      ? window.CORE_REPORT.logoURL
      : new URL('/static/assets/core.png', location.origin).toString();

    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous'; // best effort; same-origin still works
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Logo image failed to load: ' + url));
    });

    // Draw to canvas to force a clean dataURL
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 256;
    c.height = img.naturalHeight || 256;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    d = c.toDataURL('image/png');
    return d;
  } catch (e) {
    console.warn('[CORE_REPORT] strongResolveLogoDataURL failed:', e);
    return null;
  }
}



  const $ = (sel) => document.querySelector(sel);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const fmtPct01 = (x, d = 1) => (x * 100).toFixed(d) + '%';

  async function ensureDataURLFromImageElement(imgEl) {
    return new Promise((resolve) => {
      if (!imgEl || !imgEl.src) return resolve(null);
      if (imgEl.src.startsWith('data:')) return resolve(imgEl.src);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || imgEl.width || 0;
          canvas.height = img.naturalHeight || imgEl.height || 0;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { resolve(imgEl.src); }
      };
      img.onerror = () => resolve(imgEl.src);
      img.src = imgEl.src;
    });
  }

  // ---------- HEATMAP (mejorado) ----------
  async function tryElementToDataURL(el) {
    // Si es canvas
    if (el instanceof HTMLCanvasElement) {
      try { return el.toDataURL('image/png'); } catch { /* tainted? */ }
      // Intento via html2canvas del propio canvas (puede devolver blanco si está tainted)
      try {
        const c = await html2canvas(el, { backgroundColor: null, scale: 1 });
        return c.toDataURL('image/png');
      } catch { return null; }
    }
    // Si es <img>
    if (el instanceof HTMLImageElement) return ensureDataURLFromImageElement(el);
    // Cualquier nodo DOM: snapshot con html2canvas
    try {
      const c = await html2canvas(el, { backgroundColor: null, scale: 1 });
      return c.toDataURL('image/png');
    } catch { return null; }
  }

  async function getHeatmapDataURL() {
    // 1) Prioridad: DataURL registrado
    if (window.CORE_REPORT.heatmapDataURL) return window.CORE_REPORT.heatmapDataURL;

    // 2) Fuente registrada (canvas/imagen/selector)
    const src = window.CORE_REPORT.heatmapSource;
    if (src) {
      if (typeof src === 'string') {
        const el = document.querySelector(src);
        if (el) {
          const url = await tryElementToDataURL(el);
          if (url) return url;
        }
      } else {
        const url = await tryElementToDataURL(src);
        if (url) return url;
      }
    }

    // 3) Búsqueda en DOM (más amplia)
    const selectors = [
      '#xai-heatmap', '#heatmap', '#gradcam',
      '#xai-panel canvas', '.explain-card canvas', 'canvas.heatmap',
      '#xai-items canvas', '#xai-items img.heatmap',
      'img#xai-heatmap', 'img.heatmap', 'img[alt*="heat"]', 'img[src*="heat"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const url = await tryElementToDataURL(el);
      if (url) return url;
    }

    return null; // no encontrado
  }

  // ---------- Extracción de datos ----------
  function extractDetectionsFromList(predListEl) {
    const dets = [];
    if (!predListEl) return dets;
    for (const li of Array.from(predListEl.querySelectorAll('li'))) {
      let id = li.dataset.id || null;
      let label = li.dataset.label || null;
      let score = li.dataset.score ? parseFloat(li.dataset.score) : null;
      let bbox = null;

      if (li.dataset.bbox) {
        bbox = li.dataset.bbox.split(',').map((n) => parseFloat(n));
      } else {
        const txt = li.textContent.trim();
        const scoreMatch = txt.match(/(\d+(\.\d+)?)/);
        const bboxMatch = txt.match(/\[(.+?)\]/);
        if (!label) {
          const m = txt.match(/Prob\.\s*([^\d—\-]+)/i);
          label = (m && m[1]) ? m[1].trim() : txt.split(/\s+/)[0];
        }
        if (score == null && scoreMatch) score = parseFloat(scoreMatch[1]);
        if (!bbox && bboxMatch) bbox = bboxMatch[1].split(',').map((s) => parseFloat(s.trim()));
        if (score && score > 1) score = score / 100;
      }
      if (label && typeof score === 'number') {
        dets.push({ id: id || `H${dets.length + 1}`, label, score: clamp01(score), bbox: Array.isArray(bbox) ? bbox : null, areaPct: null });
      }
    }
    return dets;
  }

  function computeAggregates(dets) {
    const count = dets.length;
    if (!count) return { count: 0, maxScore: 0, meanScore: 0, riesgoAprox: 0 };
    const scores = dets.map((d) => d.score || 0);
    const maxScore = Math.max(...scores);
    const meanScore = scores.reduce((a, b) => a + b, 0) / count;
    const riesgoAprox = Number((0.6 * maxScore + 0.4 * meanScore).toFixed(2));
    return { count, maxScore, meanScore, riesgoAprox };
  }

  function extractChatInsights() {
    const panel = $('#chatbot-panel');
    const chatLog = panel ? panel.querySelector('#chat-log') : null;
    const chatQuick = panel ? panel.querySelector('#chat-quick') : null;
    const findingsBar = $('#findings-bar');

    let lastAssistant = '';
    if (chatLog) {
      const candidates = chatLog.querySelectorAll('.msg.assistant, .assistant, [data-role="assistant"], .bot');
      const last = candidates[candidates.length - 1];
      lastAssistant = last ? last.textContent.trim() : '';
    }
    const quick = chatQuick ? Array.from(chatQuick.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean) : [];
    const chips = findingsBar ? Array.from(findingsBar.querySelectorAll('.finding-chip.selected')).map((c) => c.textContent.trim()) : [];

    const recs = [];
    if (lastAssistant) {
      for (const line of lastAssistant.split('\n')) {
        const t = line.trim();
        if (/^[-•●]/.test(t) || /recom/i.test(t)) recs.push(t.replace(/^[-•●]\s*/, ''));
      }
    }
    return {
      summary: lastAssistant ? lastAssistant.slice(0, 500) : '',
      quickActions: quick.slice(0, 6),
      selectedFindings: chips.slice(0, 8),
      recommendationsFromChat: recs.slice(0, 6),
    };
  }

  // ---------- Build data ----------
  async function buildReportDataFromUI(includeChat = false) {
    const fileInput = $('#file');
    const imgOrig = $('#img-original');
    const imgInfer = $('#img-infer');
    const predList = $('#pred-list');

    const env = window.BUILD_ENV || 'DEMO';
    const fileName = (fileInput?.files && fileInput.files[0]?.name) ? fileInput.files[0].name : 'imagen.jpg';

    const originalDataURL = await ensureDataURLFromImageElement(imgOrig);
    const inferredDataURL = await ensureDataURLFromImageElement(imgInfer);
    const heatmapDataURL = await getHeatmapDataURL();

    
    const logoDataURL = await strongResolveLogoDataURL();
const detections = extractDetectionsFromList(predList);
    const aggregates = computeAggregates(detections);

    const baselineNarrative = detections.length
      ? `Se identificaron ${detections.length} hallazgos (conf. máx ${fmtPct01(aggregates.maxScore)}; riesgo aprox ${aggregates.riesgoAprox}).`
      : `No se detectaron hallazgos con los umbrales actuales.`;

    const chat = includeChat ? extractChatInsights() : { summary: '', quickActions: [], selectedFindings: [], recommendationsFromChat: [] };

    const baseRecs = detections.length
      ? ['Correlacionar con ecografía según criterio clínico.', 'Comparar con estudios previos si están disponibles.']
      : ['Sugerir seguimiento habitual de tamizaje.'];

    const recSet = new Set([...baseRecs, ...chat.recommendationsFromChat]);
    const recommendations = Array.from(recSet).slice(0, 6);

    return {
      caseId: window.CASE_ID || crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      env,
      file: {
        name: fileName,
        width: imgOrig?.naturalWidth || null,
        height: imgOrig?.naturalHeight || null,
      },
      model: {
        arch: 'Faster R-CNN (Detectron2)',
        version: window.MODEL_VERSION || 'v0.1.0',
        thresholds: { score: 0.5, iou: 0.5 }, // ASCII ">= " en HTML
        timings: { preprocessMs: 0, inferMs: 0, totalMs: 0 },
      },
      detections,
      aggregates,
      narrative: baselineNarrative,
      chat,
      images: { original: originalDataURL, heatmap: heatmapDataURL, inferred: inferredDataURL },
      logoDataURL,

      disclaimers: ['Apoyo clínico asistido por IA.', 'No sustituye el criterio clínico.'],
      build: { id: '{{ BUILD_ID or "dev" }}' },
      recommendations,
    };
  }

  // ---------- Plantilla HTML (más grande + chatbox visible) ----------
  function buildReportHTML(data) {
    const maxRows = 6;
    const rows = (data.detections || []).slice(0, maxRows);
    const extra = Math.max(0, (data.detections || []).length - maxRows);
    const detRows = rows.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${d.label}</td>
        <td class="num">${(d.score * 100).toFixed(1)}%</td>
        <td>${Array.isArray(d.bbox) ? `[${d.bbox.join(', ')}]` : '—'}</td>
      </tr>`).join('');

    const findingsList = (data.chat.selectedFindings || []).map((f) => `<li>${f}</li>`).join('');
    const quickList    = (data.chat.quickActions || []).map((q) => `<li>${q}</li>`).join('');
    const recList      = (data.recommendations || []).map((r) => `<li>${r}</li>`).join('');

    const wm = data.env && data.env.toUpperCase() !== 'PROD' ? `<div class="wm">${data.env}</div>` : '';
    const dims = (data.file.width && data.file.height) ? `(${data.file.width}x${data.file.height}px)` : '';
    const logo = data.logoDataURL; 

    const imagesHTML = `
      <div class="images">
        <div class="row two-up">
          <div class="imgblock">
            <small>Original</small>
            ${data.images.original ? `<img src="${data.images.original}" alt="Original">` : '<div class="ph">—</div>'}
          </div>
          <div class="imgblock">
            <small>Heatmap</small>
            ${data.images.heatmap
              ? `<img src="${data.images.heatmap}" alt="Heatmap">`
              : '<div class="ph">—</div>'}
          </div>
        </div>
        <div class="row one-up">
          <div class="imgblock">
            <small>Inferida</small>
            ${data.images.inferred ? `<img src="${data.images.inferred}" alt="Inferida">` : '<div class="ph">—</div>'}
          </div>
        </div>
      </div>`;

    const chatBoxHTML = (data.chat && (data.chat.summary || (data.chat.selectedFindings || []).length || (data.chat.quickActions || []).length))
      ? `
        <div class="chatbox">
          <div class="chatbox-title">Notas del chatbot</div>
          ${data.chat.summary ? `<p class="chatbox-summary">${data.chat.summary}</p>` : ''}
          ${(data.chat.selectedFindings || []).length ? `<p class="chatbox-sub">Hallazgos seleccionados</p><ul>${findingsList}</ul>` : ''}
          ${(data.chat.quickActions || []).length ? `<p class="chatbox-sub">Acciones sugeridas</p><ul>${quickList}</ul>` : ''}
        </div>`
      : '';

return `
<section id="print-root">
  <style>
    :root{
      --rp-fg:#101114; --rp-muted:#3f4752; --rp-th-bg:#f5f5f5; --rp-ph:#888;
      --rp-chat-bg:#fff0b3; --rp-chat-bd:#f0c36d; --rp-chat-accent:#e8a200; --rp-chat-fg:#0b0c0f;
      --rp-wm:#000;
    }
    *{box-sizing:border-box} body{margin:0}
    .page{font:16px/1.5 system-ui,Roboto,Arial; color:var(--rp-fg); padding:8mm; width:1200px; background:#fff}
    header{display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8mm}
    .brand{display:flex; align-items:center; gap:24px; min-width:0}
    /* Force spacing and crisp logo */
    .brand-title{margin-left:32px}
    .brand-logo{border-radius:0 !important; border:none !important; box-shadow:none !important; image-rendering:auto;}

    .brand-logo{height:84px; width:auto; display:block}
    .brand-title{min-width:0; margin-left:48px}
    h1{font-size:26px; margin:0 0 6px}
    h2{font-size:20px; margin:12px 0 8px}
    small,.meta{color:var(--rp-muted); opacity:1}
    .grid-2{display:grid; grid-template-columns:1.15fr .85fr; gap:10mm}
    .block{margin:0}
    .meta-row{display:flex; gap:10px; flex-wrap:wrap; font-size:14px}
    table{width:100%; border-collapse:collapse; font-size:14.5px}
    th,td{border:1px solid #ddd; padding:7px 9px; vertical-align:top}
    th{background:var(--rp-th-bg); text-align:left}
    td.num{text-align:right}

    .images .row{display:grid; gap:8mm}
    .images .two-up{grid-template-columns:1fr 1fr}
    .images .one-up{grid-template-columns:1fr}
    .imgblock small{display:block; margin-bottom:6px; opacity:.9; font-size:14px; color:var(--rp-muted)}
    .imgblock img,.ph{width:100%; height:auto; border:1px solid #ddd; border-radius:8px}
    .ph{aspect-ratio:1.3/1; display:flex; align-items:center; justify-content:center; color:var(--rp-ph)}

    .wm{position:fixed; top:45%; left:50%; transform:translate(-50%,-50%) rotate(-20deg); font-size:78px; font-weight:700; letter-spacing:6px; color:var(--rp-wm); opacity:.06; pointer-events:none}
    .muted{color:var(--rp-muted)}

    /* Chatbox alta visibilidad */
    .chatbox{
      background:var(--rp-chat-bg);
      border:1px solid var(--rp-chat-bd);
      border-left:6px solid var(--rp-chat-accent);
      border-radius:10px; padding:10px 12px; margin-top:10px; color:var(--rp-chat-fg) !important;
    }
    .chatbox-title,.chatbox-summary,.chatbox-sub,.chatbox li,.chatbox *{ color:var(--rp-chat-fg) !important; }

    .block, table, img { page-break-inside: avoid; }
    .page{
  position: relative;         /* 👈 necesario para anclar la firma */
  font:16px/1.5 system-ui,Roboto,Arial;
  color:var(--rp-fg);
  padding:8mm;
  padding-bottom: 40mm;        /* 👈 reserva espacio para que no se solape */
  width:1200px; background:#fff;
}

/* --- Firma --- */
.signature-area{
  position:absolute; left:8mm; bottom:8mm;   /* 👈 abajo-izquierda */
  width: 55%; min-height: 26mm;
  display:flex; flex-direction:column; justify-content:flex-end;
}
.signature-label{ font-size:13.5px; color:var(--rp-muted); margin-bottom:6px; }
.signature-meta{ font-size:12.5px; color:#333; display:flex; gap:12px; flex-wrap:wrap; }
.signature-line{ width:80%; border-top:2px solid #333; margin: 10mm 0 4px; }
.signature-line--md{ width:60%; }
.signature-line--sm{ width:40%; }
.signature-line--xs{ width:25%; }


  </style>
  ${wm}
  <div class="page">
    <header>
      <div class="brand">
        ${logo ? `<img class="brand-logo" src="${logo}" alt="CORE logo" style="border-radius:0!important;border:none!important;box-shadow:none!important;outline:none!important;image-rendering:auto;display:block;max-width:none">` : `<div class="brand-logo ph" title="Logo no disponible" style="border-radius:0!important;border:none!important;box-shadow:none!important">CORE</div>`}
        <div class="brand-title">
          <h1>Reporte de inferencia</h1>
          <div class="meta-row">
            <span><b>Caso:</b> ${data.caseId}</span>
            <span><b>Fecha:</b> ${new Date(data.generatedAt).toLocaleString()}</span>
            <span><b>Archivo:</b> ${data.file.name} ${dims}</span>
            <span><b>Entorno:</b> ${data.env}</span>
            <span><b>Build:</b> Demo</span>
          </div>
        </div>
      </div>
      <div class="meta-row">
        <span><b>Arquitectura:</b> ${data.model.arch}</span>
        <span><b>Versión:</b> ${data.model.version}</span>
        <span><b>Umbrales:</b> score >= ${data.model.thresholds.score}, IoU >= ${data.model.thresholds.iou}</span>
      </div>
    </header>

    <section class="grid-2">
      <div class="block">
        <h2>Resumen</h2>
        <p>${data.narrative}</p>

        <h2>Detecciones</h2>
        ${
          rows.length
            ? `<table>
                 <thead><tr><th>#</th><th>Etiqueta</th><th>Conf.</th><th>BBox</th></tr></thead>
                 <tbody>${detRows}</tbody>
               </table>
               ${extra ? `<div class="muted">… y ${extra} más</div>` : ''}`
            : `<p class="muted">Sin detecciones.</p>`
        }

        ${(data.recommendations || []).length ? `<h2>Recomendaciones</h2><ul>${recList}</ul>` : ''}

        ${chatBoxHTML}

        <h2>Avisos</h2>
        <ul>${data.disclaimers.map((d) => `<li>${d}</li>`).join('')}</ul>
      </div>

      <div class="block">
        <h2>Imágenes</h2>
        ${imagesHTML}
        <h2>Agregados</h2>
        <div class="meta-row">
          <span><b>Hallazgos:</b> ${data.aggregates.count}</span>
          <span><b>Conf. máx:</b> ${(data.aggregates.maxScore * 100).toFixed(1)}%</span>
          <span><b>Conf. media:</b> ${(data.aggregates.meanScore * 100).toFixed(1)}%</span>
          <span><b>Riesgo aprox.:</b> ${data.aggregates.riesgoAprox}</span>
        </div>
      </div>
    </section>
    <!-- === Área de firma (abajo-izquierda) === -->
<div class="signature-area">
<div class="signature-line signature-line--sm"></div><br><br>
  <div class="signature-meta">
    <span> Médico </span>
    <span>${ (window.CORE_REPORT?.doctor?.name || '______________________________________') }</span>

    </div>
</div>

  </div>
</section>`;
  }

  // ---------- Exportar a PDF (1 sola página, grande) ----------
  async function exportReportPDF({ includeChat = false } = {}) {
    const data = await buildReportDataFromUI(includeChat);
    const html = buildReportHTML(data);

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1200px', // más ancho lógico => elementos más grandes
      opacity: '0.01',
      pointerEvents: 'none',
      background: '#fff',
      zIndex: '0',
    });
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    const el = wrapper.querySelector('#print-root');

    // Esperar imágenes
    const imgs = Array.from(el.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));

    // Render a canvas (alta nitidez)
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });

    const margin = 6; // mm
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;

    const imgWpx = canvas.width;
    const imgHpx = canvas.height;
    const ratio = imgHpx / imgWpx;

    let wMM = maxW;
    let hMM = maxW * ratio;
    if (hMM > maxH) {
      hMM = maxH;
      wMM = hMM / ratio;
    }

    const x = (pageW - wMM) / 2;
    const y = (pageH - hMM) / 2;

    const dataURL = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(dataURL, 'JPEG', x, y, wMM, hMM);
    pdf.save(`Reporte_CORE_${data.caseId}.pdf`);

    wrapper.remove();
  }

  // ---------- Inicialización ----------
  document.addEventListener('DOMContentLoaded', () => {
    const printBtn = $('#btn-print');
    const includeChatCb = $('#include-chat');

    function isVisible(el) {
      if (!el) return false;
      if (el.hidden) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    function recomputeAvailability() {
      const resultsGrid = $('#results');
      const predContainer = $('#pred-container');
      const predList = $('#pred-list');
      const imgOrig = $('#img-original');
      const imgInfer = $('#img-infer');

      const hasImages = (imgOrig && imgOrig.src) || (imgInfer && imgInfer.src);
      const resultsVisible = resultsGrid ? isVisible(resultsGrid) : false;
      const predsVisible = predContainer ? isVisible(predContainer) : false;
      const hasPredItems = predList ? (predList.children?.length || 0) > 0 : false;

      const enable = hasImages || resultsVisible || (predsVisible && hasPredItems);
      if (printBtn) printBtn.disabled = !enable;
    }

    const mo = new MutationObserver(recomputeAvailability);
    for (const id of ['results', 'pred-container', 'pred-list']) {
      const el = document.getElementById(id);
      if (el) {
        mo.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'], childList: true, subtree: true });
      }
    }

    const clearBtn = $('#btn-clear');
    clearBtn?.addEventListener('click', () => { if (printBtn) printBtn.disabled = true; });

    printBtn?.addEventListener('click', async () => {
      try {
        await exportReportPDF({ includeChat: !!includeChatCb?.checked });
      } catch (e) {
        console.error(e);
        alert('No se pudo generar el PDF.');
      }
    });

    recomputeAvailability();
    setTimeout(recomputeAvailability, 300);
    setTimeout(recomputeAvailability, 1000);
  });
})();
