// CORE · JS
document.addEventListener('DOMContentLoaded', () => {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const byId = (id) => document.getElementById(id);

  /* ===== Reveal on scroll ===== */
  try {
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if (e.isIntersecting){ e.target.classList.add('seen'); io.unobserve(e.target); }
      });
    },{threshold:.12});
    $$('[data-reveal]').forEach(el=>io.observe(el));
  } catch {}

  /* ===== Charts (Chart.js) ===== */
  if (typeof Chart !== 'undefined') {
    const c1 = byId('chart1');
    if (c1) new Chart(c1.getContext('2d'), {
      type:'doughnut',
      data:{ labels:['Aceptación','Neutral','Rechazo'], datasets:[{ data:[56,28,16], borderWidth:0 }] },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });

    const c2 = byId('chart2');
    if (c2) new Chart(c2.getContext('2d'), {
      type:'bar',
      data:{ labels:['2019','2025'], datasets:[{ data:[20,36], borderRadius:6 }] },
      options:{ plugins:{ legend:{ display:false } }, responsive:true }
    });

    const c3 = byId('chart3');
    if (c3) new Chart(c3.getContext('2d'), {
      type:'pie',
      data:{ labels:['Con IA','Sin IA'], datasets:[{ data:[92,8] }] },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });

    const c4 = byId('chart4');
    if (c4) new Chart(c4.getContext('2d'), {
      type:'bar',
      data:{ labels:['Sur América','Asia-Pacífico','M.O./África','Norteamérica','Europa'], datasets:[{ data:[64,64,63,47,45], borderRadius:6 }] },
      options:{ plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, max:80 } } }
    });
  }

  /* ===== Métricas del modelo (demo) ===== */
  const prmap = byId('chart-prmap');
  if (prmap) new Chart(prmap.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Precision', 'Recall', 'mAP@[.5:.95]'],
      datasets: [{ data: [0.93, 0.91, 0.89], borderRadius: 8 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 1 } },
      responsive: true
    }
  });

  const latency = byId('chart-latency');
  if (latency) new Chart(latency.getContext('2d'), {
    type: 'line',
    data: {
      labels: ['CPU', 'GPU (FP32)', 'GPU (FP16)'],
      datasets: [{ label: 'ms/imagen', data: [180, 42, 28], tension: .35 }]
    },
    options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } }, responsive: true }
  });

  const conf = byId('chart-confidence');
  if (conf) new Chart(conf.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['>0.9', '0.7-0.9', '0.5-0.7', '<0.5'],
      datasets: [{ data: [46, 32, 16, 6], borderWidth: 0 }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  /* ===== Upload + predicciones (REAL API) ===== */
  const form          = byId('upload-form');
  const statusEl      = byId('upload-status');
  const progress      = byId('progress');
  const results       = byId('results');
  const imgOriginal   = byId('img-original');
  const imgInfer      = byId('img-infer');
  const predContainer = byId('pred-container');
  const predList      = byId('pred-list');
  const btnClear      = byId('btn-clear');
  const pickBtn       = byId('pick-image');
  const fileEl        = byId('file');              // <input type="file" id="file">
  const btnSubmit     = byId('btn-submit');

  
// BEGIN XAI · SIZE SYNC (match heatmap to "Inferida")
function syncXaiSizes(){
  if (!imgInfer) return;

  const _commonAncestor = (typeof commonAncestor === 'function')
    ? commonAncestor
    : (a,b)=>{ const s=new Set(); let n=a; while(n){s.add(n); n=n.parentElement;}
               n=b; while(n){ if(s.has(n)) return n; n=n.parentElement; } return null; };

  const row = (imgOriginal && imgInfer && _commonAncestor(imgOriginal, imgInfer))
              || imgInfer.parentElement;
  if (!row) return;

  const w = imgInfer.naturalWidth  || imgInfer.clientWidth;
  const h = imgInfer.naturalHeight || imgInfer.clientHeight;
  if (w && h) {
    row.style.setProperty('--xai-aspect', `${w}/${h}`); // ya lo tenías
    row.style.setProperty('--xai-h',      `${imgInfer.clientHeight || 360}px`); // NUEVO: altura real
  }
}


// recalcular cuando cargue la imagen "Inferida" y cuando cambie el layout
imgInfer?.addEventListener('load', syncXaiSizes);
window.addEventListener('resize', syncXaiSizes);
// END XAI · SIZE SYNC

  // BEGIN XAI · HEATMAP MANDATORY (auto insert + auto generate)
function commonAncestor(a,b){
  const s=new Set(); let n=a; while(n){s.add(n); n=n.parentElement;}
  n=b; while(n){ if(s.has(n)) return n; n=n.parentElement; }
  return null;
}

function ensureXaiSlot(){
  if (document.getElementById('xai-col')) return;

  // 1) La fila correcta (idealmente el contenedor #results que ya usas)
  const row = (imgOriginal && imgInfer && commonAncestor(imgOriginal, imgInfer))
              || results
              || imgInfer?.parentElement
              || document.body;

  // 2) Activa la rejilla de 3 columnas
  row.classList.add('xai-grid-3'); // ← añade la tercera columna en la misma fila

  // 3) Columnas existentes
  const origCol  = imgOriginal?.closest('figure, .col, .tile, .thumb, .card, .panel, .item, div') || imgOriginal?.parentElement || row;
  const inferCol = imgInfer?.closest   ('figure, .col, .tile, .thumb, .card, .panel, .item, div') || imgInfer?.parentElement  || row;

  // 4) Crea la 3ª columna con el MISMO card (.thumb)
  const col = document.createElement('div');
  col.id = 'xai-col';
  col.className = 'xai-cell xai-cell--xai';
col.innerHTML = `
  <div class="thumb">
    <h4>Heatmap (Grad-CAM)</h4>
    <div id="xai-loading" class="xai-loading" style="display:flex; align-items:center; gap:8px;">
      <span class="ring"></span><span>Generando…</span>
    </div>
    <img id="xai-img" alt="Mapa de activación" loading="lazy" />
  </div>
`;

  // 5) Inserta a la DERECHA de “Inferida”
  if (inferCol && inferCol.parentElement === row) {
    inferCol.after(col);
  } else if (inferCol?.parentElement) {
    inferCol.parentElement.insertBefore(col, inferCol.nextSibling);
  } else {
    row.appendChild(col);
  }
}



// BEGIN XAI · HEATMAP (generate + size sync)
async function generateHeatmapMandatory(imageB64){
  ensureXaiSlot();

  const col     = document.getElementById('xai-col');
  const img     = document.getElementById('xai-img');
  const loading = document.getElementById('xai-loading');
  if (!col || !img) return;

  try {
    if (loading) loading.style.display = 'flex';
    const res = await requestExplainViaProxy(imageB64);
    const b64 = res?.activation_map_b64;
    if (!b64) throw new Error('Respuesta sin activation_map_b64');

    img.onload = () => {
      if (loading) loading.style.display = 'none';
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  } catch (err) {
    if (loading) loading.innerHTML = `<span class="ring"></span><span>${(err?.message || 'No se pudo generar heatmap')}</span>`;
    console.error('[XAI] error', err);
  }
}

// END XAI · HEATMAP (generate + size sync)



  const show = (el, ok=true)=>{ if(el) el.style.display = ok? '' : 'none'; };

const resetResults = ()=>{
  if (statusEl) statusEl.textContent='';
  show(results,false); show(predContainer,false);
  if (imgOriginal) imgOriginal.src=''; 
  if (imgInfer)    imgInfer.src='';
  if (predList)    predList.innerHTML='';

  // Reset del hilo del chat clínico
  window.ChatClinical?.reset();

  // ---- XAI: limpiar imagen + ocultar loader y estado 'loading'
  const xaiCol  = document.getElementById('xai-col');
  const xaiImg  = document.getElementById('xai-img');
  const xaiLoad = document.getElementById('xai-loading');

  if (xaiImg)  xaiImg.src = '';
  if (xaiCol)  xaiCol.classList.remove('loading');
  if (xaiLoad){
    xaiLoad.style.display = 'none'; // ⟵ importante: no mostrar "Generando…" en idle
    xaiLoad.innerHTML = '<span class="ring"></span><span>Generando…</span>'; // texto por defecto para la próxima vez
  }
  show(document.getElementById('xai-col'), false);
};

  const setBusy = (busy)=>{
    try { if (progress) { progress.closed = !busy; progress.indeterminate = busy; } } catch {}
    const hasFile = !!fileEl?.files?.length;
    if (btnSubmit) btnSubmit.disabled = busy || !hasFile;
    if (pickBtn)   pickBtn.disabled   = busy;
    if (btnClear)  btnClear.disabled  = busy;
  };

// GATILLA SIEMPRE EL TYPING, AUNQUE EL INTERCEPT NO ENGANCHE
async function postPredict(fd){
  // 🔔 start
  window.dispatchEvent(new CustomEvent('chat:predict:start'));
  try {
    const r = await fetch('/api/v1/predict', { method:'POST', body: fd });
    const j = await r.json();
    if (!r.ok || j.status!=='success') throw new Error(j.message || 'Error de inferencia');
    return j.data; // { original_image, inferred_image, ground_truth_image?, predictions }
  } finally {
    // 🔔 end — pase lo que pase
    window.dispatchEvent(new CustomEvent('chat:predict:end'));
  }
}


  // Abrir selector
  pickBtn?.addEventListener('click', (ev)=>{
    ev.preventDefault(); ev.stopImmediatePropagation();
    fileEl?.click();
  }, { capture:true });

  // Guardar base64 al seleccionar archivo (sirve para XAI si aún no se hace submit)
  fileEl?.addEventListener('change', (ev)=>{
    ev.stopImmediatePropagation();
    const has = !!fileEl?.files?.length;
    if (btnSubmit) btnSubmit.disabled = !has;
    if (statusEl)  statusEl.textContent = has ? 'Listo para analizar.' : '';

    const f = fileEl?.files?.[0];
    if (f){
      const fr = new FileReader();
      fr.onload = ()=>{ window.lastUploadedImageB64 = fr.result; }; // data-uri
      fr.readAsDataURL(f);
      // metadata de caso para el chat
      window.ChatClinical?.setCaseMeta?.(`Caso: ${f.name}`);
      window.ChatClinical?.reset?.();
    }
  }, { capture:true });

  // Reset
  btnClear?.addEventListener('click', (ev)=>{
    ev.stopImmediatePropagation();
    form?.reset(); resetResults();
    if (btnSubmit) btnSubmit.disabled = true;
    window.lastUploadedImageB64 = undefined;
  }, { capture:true });

  // Submit → API real
  form?.addEventListener('submit', async (ev)=>{
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (!fileEl?.files?.length) return;

    setBusy(true);
    if (statusEl) statusEl.textContent='Procesando…';

    try{
      const fd = new FormData(form);
      const data = await postPredict(fd);

      // Imágenes devueltas por Flask en base64
      if (imgOriginal) imgOriginal.src = data.original_image ? `data:image/jpeg;base64,${data.original_image}` : '';
      if (imgInfer)    imgInfer.src    = data.inferred_image ? `data:image/jpeg;base64,${data.inferred_image}` : '';
      syncXaiSizes(); // ← recalcula el aspect-ratio para alinear las 3 columnas

            // === HEATMAP OBLIGATORIO ===
      const base64ForXai = window.lastUploadedImageB64
        || (data?.original_image ? `data:image/jpeg;base64,${data.original_image}` : null);
      if (base64ForXai) { 
        generateHeatmapMandatory(base64ForXai); 
      }
      // === FIN HEATMAP OBLIGATORIO ===


      // Actualiza el buffer para XAI con la imagen original si no está
      if (!window.lastUploadedImageB64 && data.original_image) {
        window.lastUploadedImageB64 = `data:image/jpeg;base64,${data.original_image}`;
      }

      // Lista de predicciones
      if (predList) predList.innerHTML = '';
      if (Array.isArray(data.predictions) && predList){
        data.predictions.forEach((d,i)=>{
          const label = d.label ?? d.class ?? d.category_id ?? 'lesión';
          const score = d.score ?? d.confidence ?? d.prob;
          const box   = d.bbox ?? d.box ?? d.bbox_xywh;
          const li = document.createElement('li');
          li.textContent = `#${i+1} ${label} — score ${typeof score==='number'?score.toFixed(2):score} — bbox ${JSON.stringify(box)}`;
          predList.appendChild(li);
        });
      }



      show(results, Boolean(imgOriginal?.src || imgInfer?.src));
      show(predContainer, !!predList?.children.length);
      if (statusEl) statusEl.textContent='Listo';

      // BEGIN CHATBOT · EMIT (después de pintar la lista de predicciones)
      window.lastDetections = Array.isArray(data.predictions) ? data.predictions : [];
      window.dispatchEvent(new CustomEvent('chat:predictions-updated', { detail: window.lastDetections }));
      // END CHATBOT · EMIT

      // === Integración con el chatbot clínico ===
      window.ChatClinical?.updateDetections?.(Array.isArray(data.predictions) ? data.predictions : []);
      window.ChatClinical?.autoExplain?.(); // auto-explicación inicial (opcional)
    }catch(err){
      console.error(err);
      if (statusEl) statusEl.textContent=`Error: ${err.message}`;
    }finally{
      setBusy(false);
    }
  }, { capture:true });

  

  /* ===== Explainable AI (Grad-CAM sobre detector) ===== */
  // ==== XAI: proxy del repo (/xai/gradcam) → un solo heatmap ====
  async function requestExplainViaProxy(imageB64){
    const res = await fetch("/xai/gradcam", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ image_b64: imageB64 })
    });
    if(!res.ok){
      const t = await res.text();
      throw new Error(`XAI proxy HTTP ${res.status}: ${t}`);
    }
    return res.json(); // { activation_map_b64: "<base64>" }
  }

  // escucha al botón (ojo si está dentro de un form)
  document.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('#btn-xai'); 
    if(!btn) return;
    ev.preventDefault(); 
    ev.stopPropagation();

    try{
      // de dónde tomamos la imagen
      let imgB64 = window.lastUploadedImageB64;
      const imgOriginal = document.getElementById('img-original');
      if(!imgB64 && imgOriginal?.src?.startsWith('data:image/')) imgB64 = imgOriginal.src;
      if(!imgB64) throw new Error('No hay imagen cargada. Sube una y pulsa Analizar.');

      console.log('[XAI] POST /xai/gradcam…');
      const data = await requestExplainViaProxy(imgB64); // {activation_map_b64}

      const panel = document.getElementById('xai-panel');
      const list  = document.getElementById('xai-items');
      if (!panel || !list) throw new Error('Faltan #xai-panel o #xai-items en el DOM.');

      // render: un solo heatmap
      const b64 = data.activation_map_b64;
      if(!b64) throw new Error('Respuesta sin activation_map_b64');

      list.innerHTML = `
        <div class="tile">
          <div class="tile-media">
            <img class="xai-overlay" style="width:100%;height:auto;border-radius:12px"
                 src="data:image/jpeg;base64,${b64}"
                 alt="Mapa de activación" loading="lazy" />
          </div>
          <div class="tile-text">
            <h4 class="micro-title">Regiones con mayor atención del clasificador</h4>
            <p class="caption">Apoyo visual; no sustituye el criterio clínico.</p>
          </div>
        </div>
      `;
      panel.hidden = false;

      // slider de opacidad (opcional)
      const slide = document.getElementById('xai-opacity');
      if (slide) {
        const apply = ()=>{
          const v = Number(slide.value || 100);
          document.querySelectorAll('.xai-overlay').forEach(img => img.style.opacity = String(v/100));
        };
        slide.oninput = apply;
        apply();
      }

      console.log('[XAI] OK');
    }catch(err){
      console.error(err);
      alert('No se pudo generar la explicación: ' + err.message);
    }
  });

  /* ===== Toggle de tema desde el rail + persistencia ===== */
  const THEME_KEY = 'core-theme';

  function setThemeAttr(mode){
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_KEY, mode);
  }

  async function applyThemeAnimated(nextMode){
    const root = document.documentElement;
    if (document.startViewTransition) {
      root.classList.add('theme-animating');
      await document.startViewTransition(() => setThemeAttr(nextMode)).finished.catch(()=>{});
      root.classList.remove('theme-animating');
      return;
    }
    root.classList.add('theme-animating');
    setThemeAttr(nextMode);
    setTimeout(() => root.classList.remove('theme-animating'), 320);
  }

  (function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) setThemeAttr(saved);
    else {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
      setThemeAttr(prefersDark ? 'dark' : 'light');
    }
  })();

  byId('rail-theme-toggle')?.addEventListener('click', ()=>{
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyThemeAnimated(next);
  });

}); // DOMContentLoaded

/* ===== Accordion: abrir uno cierra los demás en #faq ===== */
document.querySelector('#faq')?.addEventListener('toggle', (e) => {
  const t = e.target;
  if (t.tagName === 'DETAILS' && t.open) {
    const siblings = t.closest('.section-grid')?.querySelectorAll('details.faq-item') || [];
    siblings.forEach(d => { if (d !== t) d.open = false; });
  }
});

/* ========================================================================== */
/* =====================  CHAT CLÍNICO (XAI conversacional) ================= */
/* ========================================================================== */

(() => {
  // ---------- CONFIG ----------
  const CHAT_API = "/api/v1/chatbot"; // o "http://127.0.0.1:33518/generate-response"
  const QUICK_ACTIONS = [
  ];

  // ---------- STATE ----------
  let lastPredSignature = null; // firma del subset enviado al servidor
  let conversationId = localStorage.getItem("bcd_conversation_id") || null;
  let renderedStructForSignature = null; // evita repetir tarjeta en la misma mamografía
  let selectedFindingIds = [];         // p.ej. ["H1", "H2"]
  window.lastDetections = window.lastDetections || []; // arreglo de detecciones actual

  // ---------- DOM HELPERS ----------
  const $ = (id) => document.getElementById(id);
  const chatFab   = $("chat-fab");
  const chatPanel = $("chat-panel");
  const chatLog   = $("chat-log");
  const chatQuick = $("chat-quick");
  const chatForm  = $("chat-form");
  const chatInput = $("chat-input");
  const caseMeta  = $("case-meta");
  const findingsBar = $("findings-bar");

  if (!chatPanel || !chatLog) {
    console.warn("[ChatClinical] Panel no encontrado en DOM; se ejecutará en modo 'headless'.");
  }

  // ---------- INIT UI ----------
  chatFab?.addEventListener("click", () => chatPanel.classList.toggle("open"));
  // BEGIN PATCH · CHAT FORM → usa el flujo unificado que limpia JSON
chatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = (chatInput?.value || "").trim();
  if (!prompt) return;

  appendToLog("user", escapeHTML(prompt));
  if (chatInput) {
    chatInput.value = "";
    // si tienes autosize: dispara para reencoger el textarea
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  try {
    // 🚀 NUEVO: este camino ya hace strip del JSON y pinta struct/suggestions aparte
    await askWithContext(prompt);
  } catch (err) {
    appendToLog("assistant", "Error: " + sanitize(err.message || err));
  }
});
// END PATCH


  // ---------- PUBLIC API ----------
  window.ChatClinical = {
    updateDetections,   // ChatClinical.updateDetections(dets)
    reset: resetChatThread,
    autoExplain: autoExplainOnce,
    selectFinding: (id) => selectFinding(id),
    ask: (p) => askWithContext(p),
    setCaseMeta: (text) => { if (caseMeta) caseMeta.textContent = text; }
  };

   // ---------- CORE FUNCTIONS ----------
  function ensureIds(dets) {
    const out = (dets || []).map((d, i) => ({ ...d }));
    out.forEach((d, i) => { if (!d.id) d.id = `H${i + 1}`; });
    return out;
  }

  function updateDetections(dets) {
    window.lastDetections = ensureIds(dets);
    renderFindingChips(window.lastDetections);
  }

  function renderFindingChips(dets) {
    if (!findingsBar) return;
    findingsBar.innerHTML = "";
    (dets || []).forEach(d => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "finding-chip";
      b.dataset.id = d.id;
      const lbl = d.label || (d.class === 1 ? "Masa" : "Hallazgo");
      const score = typeof d.score === "number" ? d.score.toFixed(2) : (d.score ?? "—");
      b.textContent = `${d.id} · ${lbl} · ${score}`;
      b.onclick = () => toggleFindingSelection(d.id, b);
      findingsBar.appendChild(b);
    });
  }

  function toggleFindingSelection(id, btn) {
    const idx = selectedFindingIds.indexOf(id);
    if (idx >= 0) {
      selectedFindingIds.splice(idx, 1);
      btn?.classList.remove("selected");
    } else {
      selectedFindingIds = [id]; // selección única recomendada
      findingsBar?.querySelectorAll(".finding-chip")?.forEach(x => x.classList.remove("selected"));
      btn?.classList.add("selected");
    }
  }

  function selectFinding(id) {
    const btn = findingsBar?.querySelector(`.finding-chip[data-id="${CSS.escape(id)}"]`);
    if (btn) toggleFindingSelection(id, btn);
  }

  function renderQuickActions() {
    if (!chatQuick) return;
    chatQuick.innerHTML = "";
    QUICK_ACTIONS.forEach(a => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = a.label;
      b.onclick = () => askWithContext(a.prompt);
      chatQuick.appendChild(b);
    });
  }

  // (B.2) Flujo unificado: arma prompt con hint, decide subset, resetea conversación si cambió selección,
  // llama al backend, y pinta texto + tarjeta + sugerencias.
  // Reemplaza COMPLETO en tu script.js
async function askWithContext(basePrompt) {
  const preds = window.lastDetections || [];
  const sel   = selectedFindingIds || [];

  // Usamos SIEMPRE todas las predicciones para el contexto (análisis global)
  const subset = preds;

  // Reinicia la conversación si cambian las predicciones (firma global)
  const signature = JSON.stringify(preds.map(d => ({
    id: d.id, c: d.class, s: Math.round((d.score||0)*100)/100
  })));
  if (signature !== lastPredSignature) {
    lastPredSignature = signature;
    localStorage.removeItem("bcd_conversation_id");
    conversationId = null;
    evidenceBannerShown = false; // muestra "Basado en: ..." solo 1 vez por apertura del panel
    renderedStructForSignature = null; // <- IMPORTANTE: permite mostrar tarjeta una vez para el nuevo set
  }

  // Mensaje de contexto: si hay selección, PRIORIZA esos hallazgos pero SIEMPRE analiza toda la mamografía
  const idsAll = preds.map(p=>p.id).filter(Boolean).join(", ") || "sin IDs";
  const idsSel = sel.join(", ");
  const selectionNote = sel.length
    ? `Hay hallazgos seleccionados (${idsSel}); priorízalos en la interpretación PERO incluye una valoración GLOBAL del estudio.`
    : `No hay hallazgos seleccionados; realiza una interpretación GLOBAL usando todos los hallazgos disponibles (${idsAll}).`;

  const structuredHint = `
Responde primero con un resumen breve y profesional (máx. 10 líneas), en lenguaje médico claro.
Al final, añade un bloque JSON válido entre triple backticks con este esquema y valores REALES (no repitas el ejemplo):
{
  "birads": "4B",                 // SOLO uno de: "3","4A","4B","5"; usa "NA" si no es posible estimar.
  "riesgo_aprox": 0.72,           // número 0..1 (2 decimales) derivado de los 'score'.
  "hallazgos_clave": [
    "H1: masa espiculada, score 0.91, cuadrante superoexterno",
    "H3: microcalcificaciones agrupadas, score 0.78"
  ],
  "recomendaciones": [
    "Biopsia con aguja gruesa para H1",
    "Ecografía dirigida para H3"
  ]
}
Reglas: no pongas "3|4A|4B|5|NA" como valor; elige uno. "recomendaciones" siempre array (o []).`;

  // Guía clínica breve para evitar respuestas genéricas
  const clinicalGuide = `Si BI-RADS = 3 → seguimiento corto; 4A/4B → considerar biopsia; 5 → biopsia recomendada. Ajusta recomendaciones a los hallazgos.`;

  const prompt = `${basePrompt}
${selectionNote}
${clinicalGuide}
${structuredHint}`;

  try {
    const { text, struct, suggestions, evidenceIds, cached } = await askChatbot(prompt, subset);

    // Construir banner solo si AÚN NO se mostró en esta apertura
    const usedIds = (Array.isArray(evidenceIds) && evidenceIds.length)
      ? evidenceIds
      : preds.map(p=>p.id).filter(Boolean);

    const evidOnce = (!evidenceBannerShown && usedIds.length)
      ? `<div style="opacity:.7;font-size:.85em;margin:.25rem 0">Basado en: ${usedIds.join(", ")}</div>`
      : "";

    const cacheTag = cached ? "<div style='opacity:.6'>⚡ desde caché</div>" : "";
    const cleanText = stripJsonBlocks(text);

    appendToLog("assistant", evidOnce + escapeHTMLExceptCode(cleanText) + cacheTag);

    // A partir de ahora, ya no mostrar el banner en esta apertura
    evidenceBannerShown = true;

    if (shouldRenderStructOnce(struct)) {
      renderStructuredCard(struct);
    }
    if (Array.isArray(suggestions) && suggestions.length) {
      renderSuggestions(suggestions);
    }
  } catch (err) {
    appendToLog("assistant", "Error: " + sanitize(err.message || err));
  }
}

// (B.1) Cliente robusto con retry si el conversation_id no sirve
//  + eventos de stream para mostrar/ocultar "Procesando…" en el chat
async function askChatbot(prompt, findingsSubset){
  const basePayload = {
    prompt,
    predictions: (findingsSubset && findingsSubset.length) ? findingsSubset : (window.lastDetections || []),
    // conversation_id se añade en el primer intento si existe
  };

  async function doRequest(payload){
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await res.json();
    } catch {
      const raw = await res.text();
      console.error("[chatbot] respuesta no-JSON:", raw);
      throw new Error(`Respuesta no-JSON del servidor`);
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    // ---- Parseo de respuesta (formato nuevo + compat) ----
    let text = data?.text ??
               data?.response ??
               data?.choices?.[0]?.message?.content ??
               data?.message ?? "";

    let struct = data?.struct ?? extractJsonBlock(text);
    const suggestions = Array.isArray(data?.suggested_prompts) ? data.suggested_prompts : [];
    const evidenceIds = Array.isArray(data?.evidence_ids) ? data.evidence_ids : [];
    const cached = !!data?.cached;

    // Actualiza SIEMPRE el conversation_id si llega
    if (data?.conversation_id) {
      conversationId = String(data.conversation_id);
      localStorage.setItem("bcd_conversation_id", conversationId);
    }

    return { text: String(text), struct, suggestions, evidenceIds, cached };
  }

  // 🔔 Mostrar “procesando…” para el flujo de CHAT
  window.dispatchEvent(new CustomEvent('chatbot:stream:start'));
  try {
    // ---- Intento 1: con conversation_id (si tenemos)
    try {
      const payload1 = { ...basePayload, conversation_id: conversationId || undefined };
      return await doRequest(payload1);
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();

      // ❗ Si el server dice que el ID es inválido, resetea y reintenta SIN ID
      if (msg.includes("invalid conversation") || (msg.includes("conversation id") && msg.includes("invalid"))) {
        try {
          localStorage.removeItem("bcd_conversation_id");
          conversationId = null;
        } catch {}
        const payload2 = { ...basePayload }; // sin conversation_id
        return await doRequest(payload2);
      }

      // Otros errores: re-lanzar
      throw err;
    }
  } finally {
    // 🔔 Ocultar “procesando…” pase lo que pase
    window.dispatchEvent(new CustomEvent('chatbot:stream:end'));
  }
}


 // REEMPLAZA COMPLETO
function renderSuggestions(list){
  if (!chatLog || !list?.length) return;

  // Encuentra la última burbuja del asistente
  const cands = chatLog.querySelectorAll('.chat-msg.assistant, .assistant, .xai-card, .pred-card, article, section');
  const target = cands[cands.length - 1] || chatLog;

  // Evita duplicar: limpia contenedor previo de sugerencias en esa burbuja
  target.querySelectorAll('.chat-actions[data-kind="suggestions"]').forEach(n => n.remove());

  const wrap = document.createElement("div");
  wrap.className = "chat-actions";
  wrap.dataset.kind = "suggestions";

  list.slice(0, 4).forEach(s=>{
    const b = document.createElement("button");
    b.type = "button";
    b.className = "suggestion-chip";
    b.textContent = s;
    b.onclick = ()=> askWithContext(s);
    wrap.appendChild(b);
  });

  target.appendChild(wrap);

  // Auto-scroll y notificación
  chatLog.scrollTop = chatLog.scrollHeight;
  window.dispatchEvent(new CustomEvent("chatbot:update"));
}


  // Compatibilidad: mantener parseador de bloques ```json``` (usado por B.1)
  // Extrae el JSON de la respuesta, ya sea dentro de ``` ``` o como objeto pegado al final
function extractJsonBlock(text){
  if (typeof text !== "string") return null;

  // a) Bloque fenceado
  let m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }

  // b) Objeto JSON al final sin fences (con claves clínicas comunes)
  const tail = text.match(/\{\s*"?(?:birads|riesgo_aprox|hallazgos_clave|recomendaciones)"?[\s\S]*\}\s*$/i);
  if (tail) {
    try { return JSON.parse(tail[0]); } catch {}
  }

  return null;
}


 // REEMPLAZA COMPLETO
function renderStructuredCard(obj){
  const card = document.createElement("div");
  // 👉 la volvemos burbuja del asistente
  card.className = "xai-card chat-msg assistant";

  // Claves alternativas y tipado robusto
  const birads = sanitize(obj?.birads ?? obj?.BI_RADS ?? obj?.bi_rads ?? "NA");
  const riesgo = sanitize(obj?.riesgo_aprox ?? obj?.risk ?? obj?.prob_risk ?? "NA");

  const hallRaw = obj?.hallazgos_clave ?? obj?.key_findings ?? obj?.findings ?? [];
  const hall = Array.isArray(hallRaw) ? hallRaw : (hallRaw && hallRaw !== "NA" ? [hallRaw] : []);
  const recsRaw = obj?.recomendaciones ?? obj?.recommendations ?? obj?.recs ?? [];
  const recs = Array.isArray(recsRaw) ? recsRaw : (recsRaw && recsRaw !== "NA" ? [recsRaw] : []);

  // Leyenda desde predicciones actuales
  let legendHtml = "";
  if (Array.isArray(window.lastDetections) && window.lastDetections.length){
    const items = window.lastDetections.map(d => {
      const id  = sanitize(d.id || "");
      const lbl = sanitize(d.label ?? (d.class === 1 ? "Masa" : "Hallazgo"));
      const sc  = (typeof d.score === "number") ? d.score.toFixed(2) : (d.score ?? "—");
      return `<li><b>${id}</b>: ${lbl} (score ${sc})</li>`;
    }).join("");
    legendHtml = `<b>Leyenda de hallazgos</b><ul>${items}</ul>`;
  }

  card.innerHTML = `
    <div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
      <div><b>BI-RADS</b><div>${birads}</div></div>
      <div><b>Riesgo aprox.</b><div>${riesgo}</div></div>
    </div>
    ${legendHtml}
    <b>Hallazgos clave</b>
    <ul>${(hall.length ? hall.map(li => `<li>${sanitize(li)}</li>`).join("") : "<li>NA</li>")}</ul>
    <b>Recomendaciones</b>
    <ul>${(recs.length ? recs.map(li => `<li>${sanitize(li)}</li>`).join("") : "<li>NA</li>")}</ul>
    <div class="chat-actions">
      <button type="button" class="copy-card">Copiar</button>
    </div>
  `;
  card.querySelector(".copy-card")?.addEventListener("click", () => {
    navigator.clipboard.writeText(card.innerText.trim());
  });

  document.getElementById("chat-log")?.appendChild(card);
  const log = document.getElementById("chat-log");
  if (log) log.scrollTop = log.scrollHeight;

  // 👉 avisa para que el layout homogeneice (por si hay otros bloques)
  window.dispatchEvent(new CustomEvent("chatbot:update"));
}



  function appendToLog(role, htmlContent) {
  if (!chatLog) return;
  const d = document.createElement("div");
  d.className = `msg chat-msg ${role === "user" ? "user" : "assistant"}`;
  d.innerHTML = `<b>${role === "user" ? "Tú" : "Asistente"}:</b> ${htmlContent}`;
  chatLog.appendChild(d);

  // Auto-scroll y homogeneización (usa los hooks que ya tienes)
  chatLog.scrollTop = chatLog.scrollHeight;
  window.dispatchEvent(new CustomEvent('chatbot:update'));
}


  function resetChatThread() {
    renderedStructForSignature = null;
    localStorage.removeItem("bcd_conversation_id");
    conversationId = null;
    if (chatLog) chatLog.innerHTML = "";
    selectedFindingIds = [];
    findingsBar?.querySelectorAll(".finding-chip")?.forEach(x => x.classList.remove("selected"));
  }

  async function autoExplainOnce() {
    if (!window.lastDetections?.length) return;
    try {
      await askWithContext("Explica los hallazgos y el nivel de riesgo en términos claros.");
    } catch {}
  }

  // ---------- UTILIDADES ----------
  function sanitize(val) {
    return (val == null) ? "" : String(val).replace(/[<>&"']/g, s => ({
      "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&#39;"
    }[s]));
  }
  function escapeHTMLExceptCode(str) {
    const parts = String(str).split(/```/);
    return parts.map((seg, i) => (i % 2 === 1) ? `<pre><code>${sanitize(seg)}</code></pre>` : sanitize(seg)).join("");
  }
  function toast(msg){
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;bottom:80px;right:20px;background:#333;color:#fff;padding:8px 10px;border-radius:8px;opacity:.95;z-index:99999";
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 1500);
  }

  // Quita del texto cualquier bloque JSON (con ``` ``` o pegado al final sin fences)
  function stripJsonBlocks(t){
    if (typeof t !== "string") return "";
    let out = t;

    // a) Bloques con triple backticks
    out = out.replace(/```json[\s\S]*?```/gi, "");
    out = out.replace(/```[\t ]*[\{\[][^\0]*?```/g, "");

    // b) JSON no “fenceado” al final (objeto con claves típicas)
    const tailObj = /\{\s*"?(?:birads|riesgo_aprox|hallazgos_clave|recomendaciones)"?[\s\S]*\}\s*$/i;
    if (tailObj.test(out)) {
      out = out.replace(tailObj, "");
    }

    return out.trim();
  }

  function shouldRenderStructOnce(struct){
  if (!struct) return false;
  // firmamos por contenido + firma de predicciones para detectar “nuevo estudio”
  const sig = JSON.stringify({
    birads: struct?.birads ?? null,
    risk: struct?.riesgo_aprox ?? null,
    predSig: lastPredSignature || "nopreds"
  });
  if (sig === renderedStructForSignature) return false; // ya la mostramos
  renderedStructForSignature = sig;
  return true;
}

  
  // Botón de prueba (si existe)
  document.getElementById("btn-ping")?.addEventListener("click", async () => {
    try {
      await askWithContext("Responde 'ok' y devuelve un JSON de ejemplo con recomendaciones como array.");
    } catch (e) {
      appendToLog("assistant", "Error de ping: " + sanitize(e.message || e));
    }
  });

})();

// BEGIN CHATBOT · SCRIPT (drawer derecha + a11y + persistencia)
(() => {
  const TAB_ID = 'chatbot-tab';
  const PANEL_ID = 'chatbot-panel';
  const BACKDROP_ID = 'chatbot-backdrop';
  const LS_KEY = 'chatbotPanelOpen';           // "1" | "0"

  const tab = document.getElementById(TAB_ID);
  const panel = document.getElementById(PANEL_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  const chevron = tab?.querySelector('.chevron');

  if (!tab || !panel) return; // defensa si no existe en alguna página

  // Helpers
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  const setArrowForState = (open) => {
    // Drawer a la DERECHA:
    // - CERRADO  => flecha ← (rotate 180deg sobre chevron_right)
    // - ABIERTO  => flecha → (rotate 0deg)
    if (chevron) {
      chevron.style.transition = `transform var(--chatbot-dur,300ms) var(--chatbot-ease,cubic-bezier(.2,.8,.2,1))`;
      chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  };

  const setAttrsForState = (open) => {
    tab.setAttribute('aria-expanded', open ? 'true' : 'false');
    tab.setAttribute('aria-label', open ? 'Cerrar chatbot' : 'Abrir chatbot');
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    panel.classList.toggle('is-open', open);
    backdrop?.classList.toggle('is-open', open && isMobile());
    if (isMobile()) backdrop?.toggleAttribute('hidden', !open);
    localStorage.setItem(LS_KEY, open ? '1' : '0');
    setArrowForState(open);
  };

  // Focus trap básico dentro del panel
  const focusableSelector = [
    'a[href]','area[href]','input:not([disabled])','select:not([disabled])',
    'textarea:not([disabled])','button:not([disabled])','iframe','object','embed',
    '[contenteditable]','[tabindex]:not([tabindex="-1"])'
  ].join(',');

  let lastFocused = null;

  function openPanel(){
    lastFocused = document.activeElement;
    setAttrsForState(true);
    // En la próxima pintura, intenta enfocar el primer elemento o el contenedor
    requestAnimationFrame(() => {
      const first = panel.querySelector(focusableSelector);
      (first || panel).focus({ preventScroll: true });
    });
  }
  function closePanel(){
    setAttrsForState(false);
    // Devuelve el foco a la pestaña
    requestAnimationFrame(() => tab.focus({ preventScroll: true }));
  }
  function togglePanel(){ (panel.classList.contains('is-open') ? closePanel : openPanel)(); }

  // Eventos: click/tab key
  tab.addEventListener('click', togglePanel);
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); togglePanel(); }
  });

  // Esc para cerrar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
  });

  // Backdrop (mobile)
  backdrop?.addEventListener('click', () => { if (isMobile()) closePanel(); });

  // Focus trap dentro del panel cuando está abierto
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !panel.classList.contains('is-open')) return;
    const focusables = Array.from(panel.querySelectorAll(focusableSelector))
      .filter(el => el.offsetParent !== null || el === panel);
    if (!focusables.length) { e.preventDefault(); panel.focus(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // Restaurar estado previo
  try {
    const saved = localStorage.getItem(LS_KEY);
    const open = saved === '1';
    setAttrsForState(open);
  } catch { setAttrsForState(false); }
})();
// END CHATBOT · SCRIPT

// BEGIN CHATBOT · MIGRATION LAYER (intercept /api/v1/predict + adoptar legacy)
(() => {
  const panel   = document.getElementById('chatbot-panel');
  const root    = document.getElementById('chatbot-root');
  const tabBtn  = document.getElementById('chatbot-tab');

  if (!panel || !root || !tabBtn) return;

  // === 1) Helpers ===
  const openDrawer = () => {
    if (!panel.classList.contains('is-open')) tabBtn.click(); // usa tu toggle existente
  };
  const ensureMountedCard = (msgHtml = '') => {
    if (!root.children.length) {
      root.innerHTML = `
        <md-outlined-card class="pred-card" style="margin:12px">
          <div class="pred-head">
            <strong>Chat clínico</strong>
            <md-icon class="material-symbols-rounded" style="color:var(--md-sys-color-tertiary,#0a7)">chat</md-icon>
          </div>
          <div class="body">${msgHtml || 'Listo para recibir resultados…'}</div>
        </md-outlined-card>
      `;
    }
  };
  const emitPreds = (preds) => {
    window.lastDetections = Array.isArray(preds) ? preds : [];
    window.dispatchEvent(new CustomEvent('chat:predictions-updated', { detail: window.lastDetections }));
    window.dispatchEvent(new CustomEvent('chatbot:update', { detail: { predictions: window.lastDetections }}));
    if (window.ChatClinical?.onPredictions) {
      try { window.ChatClinical.onPredictions(window.lastDetections); } catch(e){ console.warn('[Chatbot] onPredictions error', e); }
    }
  };

  // === 2) Adoptar contenedores/acciones legacy si existen ===
  // Ajusta la lista si tu viejo chat usaba otra id/clase.
  const LEGACY = {
    containers: ['chat-panel','chatbot','chat-ui','chatbox','drawer-chat','side-chat'],
    openButtons: ['btn-chat','open-chat','toggle-chat','btn-xai']
  };

  function adoptLegacyContainerOnce() {
    if (!root) return;
    for (const id of LEGACY.containers) {
      const el = document.getElementById(id);
      if (el && el !== root && el.parentElement !== root) {
        // Mueve su contenido al nuevo root (no rompemos referencias del nodo raíz legacy)
        while (el.firstChild) root.appendChild(el.firstChild);
        el.style.display = 'none';
        console.info('[Chatbot] Legacy container adoptado:', `#${id}`);
        break;
      }
    }
    for (const id of LEGACY.openButtons) {
      const b = document.getElementById(id);
      if (b) { b.style.display = 'none'; console.info('[Chatbot] Oculto botón legacy:', `#${id}`); }
    }
  }
  // intenta adoptar ahora y cuando lleguen nuevos nodos
  adoptLegacyContainerOnce();
  new MutationObserver(() => adoptLegacyContainerOnce())
    .observe(document.documentElement, {childList:true, subtree:true});

    const _fetch = window.fetch;
  window.fetch = async function(input, init) {
    // 🔧 detectar path con URL() (funciona con string o Request)
    let urlStr = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
    try { urlStr = new URL(urlStr, location.href).href; } catch {} // normaliza a absoluto
    const method = (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const pathname = (() => {
      try { return new URL(urlStr).pathname; } catch { return urlStr; }
    })();

    // ▶️ match robusto: .../api/v1/predict y también con trailing slash
    const isPredict = method === 'POST' && /\/api\/v1\/predict\/?$/.test(pathname);

    if (isPredict) {
      // 🔔 start (intercept)
      window.dispatchEvent(new CustomEvent('chat:predict:start'));
      // (debug opcional)
      // console.debug('[intercept] start', method, pathname);
    }

    try {
      const resp = await _fetch(input, init);

      if (isPredict) {
        // leer sin consumir el stream
        const cloned = resp.clone();
        let data = null;
        try { data = await cloned.json(); } catch {}
        if (data && data.status === 'success' && data.data) {
          const preds = data.data.predictions || [];
          // abre drawer + emite eventos “update”
          document.getElementById('chatbot-tab')?.click?.();
          window.lastDetections = Array.isArray(preds) ? preds : [];
          window.dispatchEvent(new CustomEvent('chat:predictions-updated', { detail: window.lastDetections }));
          window.dispatchEvent(new CustomEvent('chatbot:update', { detail: { predictions: window.lastDetections }}));
        }
      }
      return resp;
    } catch (e) {
      throw e;
    } finally {
      if (isPredict) {
        // 🔔 end (intercept)
        window.dispatchEvent(new CustomEvent('chat:predict:end'));
        // console.debug('[intercept] end', method, pathname);
      }
    }
  };


  // === 4) Si tu flujo legacy ya disparaba un evento propio, lo puenteamos ===
  // Ejemplos comunes: 'inference:done', 'predictions:ready', etc.
  const LEGACY_EVENTS = ['inference:done', 'predictions:ready', 'xai:ready'];
  LEGACY_EVENTS.forEach(evName => {
    window.addEventListener(evName, (ev) => {
      const preds = ev?.detail?.predictions || ev?.detail || [];
      openDrawer();
      ensureMountedCard(`<span style="opacity:.8">Resultados listos.</span>`);
      emitPreds(preds);
    });
  });

  // === 5) Al abrir el drawer (nuevo botón), sincroniza estado por si ya había predicciones ===
  window.addEventListener('chatbot:open', () => {
    ensureMountedCard();
    if (Array.isArray(window.lastDetections) && window.lastDetections.length) {
      emitPreds(window.lastDetections);
    }
  });
})();
/// END CHATBOT · MIGRATION LAYER

// BEGIN CHATBOT · UI POLISH (layout + autoscroll + typing indicator)
(() => {
  const panel = document.getElementById('chatbot-panel');
  const root  = document.getElementById('chatbot-root');
  if (!panel || !root) return;

  // 1) Estructura: viewport (scroll) + wrap (máximo ancho) + footer fijo
  function ensureLayout() {
    if (!root.closest('.chat-viewport')) {
      const viewport = document.createElement('div');
      viewport.className = 'chat-viewport';
      const wrap = document.createElement('div');
      wrap.className = 'chat-wrap';
      root.parentNode.insertBefore(viewport, root);
      viewport.appendChild(wrap);
      wrap.appendChild(root);
    }
    if (!panel.querySelector('.chat-footer')) {
      const footer = document.createElement('div');
      footer.className = 'chat-footer';
      // Si tu widget ya renderiza su propio input, lo podemos “anclar” aquí.
      // Dejamos un slot para que lo muevas/inyectes:
      footer.innerHTML = `
        <slot id="chat-input-slot"></slot>
        <md-filled-tonal-button id="chat-send-proxy" type="button">
          <md-icon class="material-symbols-rounded">send</md-icon>
        </md-filled-tonal-button>
      `;
      panel.appendChild(footer);

      // Proxy opcional: si hay un input dentro de #chatbot-root, intenta “enter”
      const sendBtn = footer.querySelector('#chat-send-proxy');
      sendBtn?.addEventListener('click', () => {
        const candidate = root.querySelector('button[type="submit"], md-filled-button[type="submit"], [data-send]');
        if (candidate) candidate.click();
      });
    }
  }

  // 2) Auto-scroll al final cuando llegan mensajes/predicciones
  function scrollToBottom() {
    const viewport = panel.querySelector('.chat-viewport');
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }

  // 3) Indicador “escribiendo/stream”
  let typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'chat-typing';
    typingEl.innerHTML = `<span>Procesando</span><span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    // Lo insertamos al final del flujo
    root.appendChild(typingEl);
    scrollToBottom();
  }
  function hideTyping() {
    typingEl?.remove();
    typingEl = null;
  }

  // 4) Normalizar burbujas legacy: envolvemos textos largos en .chat-msg
  function normalizeBubbles() {
    // Heurística: cualquier .pred-card / .xai-card o bloques de respuesta se envuelve
    const blocks = root.querySelectorAll('.pred-card, .xai-card, .md3-card, .assistant, .message, article, section');
    blocks.forEach(b => {
      if (!b.classList.contains('chat-msg')) b.classList.add('chat-msg','assistant');
      b.style.whiteSpace = 'normal';
      b.style.wordWrap = 'break-word';
      b.style.overflowWrap = 'anywhere';
    });
    // Mensajes del usuario (si existen)
    root.querySelectorAll('.user, .outgoing').forEach(b => {
      b.classList.add('chat-msg','user');
    });
  }

  // 5) Quitar botones fijos duplicados (si el legacy los inserta)
  function removeFixedGlobalActions(){
    panel.querySelectorAll('.chat-actions-fixed,[data-global-actions],.sticky-actions')
      .forEach(el => el.remove());
  }

  // ---- Hooks con tus eventos existentes ----
  window.addEventListener('chatbot:open', () => {
    ensureLayout();
    setTimeout(scrollToBottom, 30);
  });
  window.addEventListener('chatbot:update', () => {
    normalizeBubbles();
    removeFixedGlobalActions();
    setTimeout(scrollToBottom, 30);
  });

  // Cuando interceptamos /predict: muestra “typing”
  window.addEventListener('chat:predict:start', showTyping);
  window.addEventListener('chat:predict:end',   () => { hideTyping(); scrollToBottom(); });

  // Por si tu widget emite eventos de streaming:
  window.addEventListener('chatbot:stream:start', showTyping);
  window.addEventListener('chatbot:stream:end',   () => { hideTyping(); scrollToBottom(); });

  // Inicial
  ensureLayout();
  normalizeBubbles();
  removeFixedGlobalActions();
})();
// END CHATBOT · UI POLISH

// BEGIN CHATBOT · INPUT UX (autosize + enter submit + focus)
(() => {
  const form  = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const panel = document.getElementById('chatbot-panel');
  const viewport = panel?.querySelector('.chat-viewport');

  if (!form || !input) return;

  function autosize(){
    input.style.height = '0px';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    // mantener a la vista lo último
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }
  input.addEventListener('input', autosize);
  // enviar con Enter (Shift+Enter = salto de línea)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      form.requestSubmit();
    }
  });
  // foco al abrir el drawer
  window.addEventListener('chatbot:open', () => setTimeout(() => input.focus(), 120));

  // primer ajuste por si tiene valor inicial
  autosize();
})();
// END CHATBOT · INPUT UX

// BEGIN CHATBOT · HOMOGENIZE STREAM (move quick actions, findings & typing)
(() => {
  const log       = document.getElementById('chat-log');
  const quick     = document.getElementById('chat-quick');
  const findings  = document.getElementById('findings-bar');
  const typing    = document.getElementById('chat-typing');
  if (!log) return;

  // Encuentra la última “burbuja” del asistente donde colgaremos todo
  function lastAssistantBubble(){
    const cands = log.querySelectorAll(
      '.chat-msg.assistant, .assistant, .md3-card, .pred-card, article, section'
    );
    return cands[cands.length - 1] || log.lastElementChild || null;
  }

  // Normaliza bloques a burbuja si vienen “sueltos”
  function normalizeBubbles(){
    const blocks = log.querySelectorAll('.md3-card, .pred-card, .xai-card, article, section');
    blocks.forEach(b => { if (!b.classList.contains('chat-msg')) b.classList.add('chat-msg','assistant'); });
  }

  // Mueve “acciones rápidas”, “hallazgos” y “procesando” bajo la última burbuja
  function unify(){
    normalizeBubbles();
    const target = lastAssistantBubble();
    if (!target) return;

    // Acciones rápidas
    if (quick && quick.parentElement !== target && quick.childElementCount){
      quick.classList.add('chat-actions');
      target.appendChild(quick);
    }
    // Hallazgos como chips bajo la respuesta
    if (findings && findings.parentElement !== target && findings.childElementCount){
      findings.classList.add('chat-actions');
      target.appendChild(findings);
    }
    // “Procesando…” dentro del flujo, no suelto abajo
    if (typing && typing.parentElement !== log){
      log.appendChild(typing);
    }
    // Autoscroll al final (suave)
    const viewport = document.querySelector('.chat-viewport');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }

  // Cuando haya nueva info o streaming, re-unificar
  window.addEventListener('chatbot:update', unify);
  window.addEventListener('chat:predictions-updated', unify);
  window.addEventListener('chatbot:open', unify);

  // Indicador de procesamiento coherente en el flujo
  window.addEventListener('chat:predict:start', () => { if (typing){ typing.hidden = false; unify(); } });
  window.addEventListener('chat:predict:end',   () => { if (typing){ typing.hidden = true;  unify(); } });
  window.addEventListener('chatbot:stream:start', () => { if (typing){ typing.hidden = false; unify(); } });
  window.addEventListener('chatbot:stream:end',   () => { if (typing){ typing.hidden = true;  unify(); } });

  // Primera pasada
  unify();
})();
// END CHATBOT · HOMOGENIZE STREAM

// BEGIN CHATBOT · DISABLE FINDINGS SELECTOR (inert + cleanup)
(() => {
  const findings = document.getElementById('findings-bar');
  if (!findings) return;

  // Limpia cualquier chip existente y ocúltalo
  findings.replaceChildren();
  findings.style.display = 'none';

  // Si algún código intenta volver a llenarlo, lo vaciamos al instante
  const findingsObserver = new MutationObserver(() => {
    if (findings.childElementCount) findings.replaceChildren();
  });
  findingsObserver.observe(findings, { childList: true });

  // Por si nuestra función de “unificar” intentaba moverlo bajo la última burbuja:
  window.addEventListener('chatbot:update', () => findings.replaceChildren());
  window.addEventListener('chat:predictions-updated', () => findings.replaceChildren());

  // Stub opcional (evita errores si algún módulo llama API de findings)
  window.ChatClinical = window.ChatClinical || {};
  window.ChatClinical.findings = window.ChatClinical.findings || {
    add(){}, set(){}, clear(){}, mount(){}, visible: false
  };
})();
// END CHATBOT · DISABLE FINDINGS SELECTOR

// BEGIN CHATBOT · TYPING CONTROLLER (robust inflight counter + failsafe)
(() => {
  const typing = document.getElementById('chat-typing');
  if (!typing) return;

  // Fuente única de verdad
  window.__CHATBOT_INFLIGHT__ = window.__CHATBOT_INFLIGHT__ || 0;
  let hideTimer = null;

  function render() {
    const open = window.__CHATBOT_INFLIGHT__ > 0;
    typing.hidden = !open;
    // console.debug('[typing] inflight=', window.__CHATBOT_INFLIGHT__, 'visible=', !typing.hidden);
  }

  function start() {
    window.__CHATBOT_INFLIGHT__++;
    if (window.__CHATBOT_INFLIGHT__ > 99) window.__CHATBOT_INFLIGHT__ = 1; // cap defensivo
    clearTimeout(hideTimer);
    render();
  }

  function end() {
    window.__CHATBOT_INFLIGHT__ = Math.max(0, window.__CHATBOT_INFLIGHT__ - 1);
    clearTimeout(hideTimer);
    // Failsafe: si algún flujo de streaming no emite 'end', oculta a los 8s
    if (window.__CHATBOT_INFLIGHT__ === 0) {
      hideTimer = setTimeout(() => { window.__CHATBOT_INFLIGHT__ = 0; render(); }, 8000);
    }
    render();
  }

  // Quita handlers anteriores si existían (evita duplicados)
  try {
    if (window.__OLD_TYPING_START__) window.removeEventListener('chat:predict:start', window.__OLD_TYPING_START__);
    if (window.__OLD_TYPING_END__)   window.removeEventListener('chat:predict:end',   window.__OLD_TYPING_END__);
  } catch {}

  // Handlers nuevos (predict y stream)
  const onStart = () => start();
  const onEnd   = () => end();

  window.addEventListener('chat:predict:start', onStart);
  window.addEventListener('chat:predict:end',   onEnd);
  window.addEventListener('chatbot:stream:start', onStart);
  window.addEventListener('chatbot:stream:end',   onEnd);

  // Cuando llegan datos concretos, ocultamos por seguridad
  window.addEventListener('chatbot:update', () => { window.__CHATBOT_INFLIGHT__ = 0; render(); });
  window.addEventListener('chat:predictions-updated', () => { window.__CHATBOT_INFLIGHT__ = 0; render(); });

  // Al abrir el drawer, sincroniza
  window.addEventListener('chatbot:open', render);

  // Estado inicial
  render();
})();
// END CHATBOT · TYPING CONTROLLER

// BEGIN CHATBOT · CHAT SUBMIT HIJACK (usa askWithContext y limpia JSON)
(() => {
  const form  = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  if (!form || !input) return;

  // Handler propio en CAPTURE para adelantarnos a cualquier listener viejo
  function onSubmitCapture(ev){
    ev.preventDefault();
    ev.stopImmediatePropagation(); // anula handlers en bubble que usan el flujo viejo
    const prompt = (input.value || '').trim();
    if (!prompt) return;

    appendToLog('user', escapeHTML(prompt));
    input.value = '';
    // si tienes autosize del textarea, dispara para reencoger
    input.dispatchEvent(new Event('input', { bubbles: true }));

    askWithContext(prompt).catch(err => {
      appendToLog('assistant', 'Error: ' + (err?.message || err));
    });
  }
  // Registramos en capture (nos ejecutamos antes que los existentes)
  form.addEventListener('submit', onSubmitCapture, { capture: true });
})();
// END CHATBOT · CHAT SUBMIT HIJACK

// BEGIN CHATBOT · SAFE renderChatReply (sanitiza y renderiza struct/suggestions)
(() => {
  // Conserva la referencia previa si existía (por si quieres depurar)
  const prev = window.renderChatReply;

  window.renderChatReply = function(result){
    try{
      let text = '';
      let struct = null;
      let suggestions = [];

      if (typeof result === 'string') {
        text = result;
        struct = extractJsonBlock(text);
      } else if (result && typeof result === 'object') {
        text = result.text ?? result.response ?? '';
        struct = result.struct ?? extractJsonBlock(text);
        suggestions = Array.isArray(result.suggestions || result.suggested_prompts)
          ? (result.suggestions || result.suggested_prompts) : [];
      }

      // 🧹 quita cualquier JSON del cuerpo
      const cleanText = stripJsonBlocks(String(text || ''));
      appendToLog('assistant', escapeHTMLExceptCode(cleanText));

      // Tarjeta estructurada aparte (si viene)
      if (shouldRenderStructOnce(struct)) {
        renderStructuredCard(struct);
      }
      if (suggestions.length) {
        renderSuggestions(suggestions);
      }

      // Notifica al layout para reubicar acciones/typing bajo la última burbuja
      window.dispatchEvent(new CustomEvent('chatbot:update'));
    } catch (e) {
      // fallback duro
      appendToLog('assistant', 'Error al renderizar respuesta.');
      console.warn('[renderChatReply patched] fallo:', e);
      if (typeof prev === 'function') try { prev(result); } catch {}
    }
  };
})();
// END CHATBOT · SAFE renderChatReply

// BEGIN CHATBOT · MSG CLASS NORMALIZER (por si se inyectan .msg legacy)
(() => {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const fix = (el) => {
    if (el?.classList && el.classList.contains('msg') && !el.classList.contains('chat-msg')) {
      el.classList.add('chat-msg');
    }
  };
  // Arregla los existentes
  log.querySelectorAll('.msg').forEach(fix);
  // Arregla los nuevos
  new MutationObserver((muts) => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1) {
        fix(n);
        n.querySelectorAll?.('.msg').forEach(fix);
      }
    }));
  }).observe(log, { childList: true, subtree: true });
})();
// END CHATBOT · MSG CLASS NORMALIZER
