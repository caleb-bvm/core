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

  const show = (el, ok=true)=>{ if(el) el.style.display = ok? '' : 'none'; };
  const resetResults = ()=>{
    if (statusEl) statusEl.textContent='';
    show(results,false); show(predContainer,false);
    if (imgOriginal) imgOriginal.src=''; if (imgInfer) imgInfer.src='';
    if (predList) predList.innerHTML='';
    // Reset del hilo del chat clínico
    window.ChatClinical?.reset();
  };
  const setBusy = (busy)=>{
    try { if (progress) { progress.closed = !busy; progress.indeterminate = busy; } } catch {}
    const hasFile = !!fileEl?.files?.length;
    if (btnSubmit) btnSubmit.disabled = busy || !hasFile;
    if (pickBtn)   pickBtn.disabled   = busy;
    if (btnClear)  btnClear.disabled  = busy;
  };

  async function postPredict(fd){
    const r = await fetch('/api/v1/predict', { method:'POST', body:fd });
    const j = await r.json();
    if (!r.ok || j.status!=='success') throw new Error(j.message || 'Error de inferencia');
    return j.data; // { original_image, inferred_image, ground_truth_image?, predictions }
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
    { id: "explain", label: "Explicar hallazgos", prompt: "Explica en lenguaje clínico claro los hallazgos seleccionados y su relevancia." },
    { id: "birads",  label: "Sugerir BI-RADS",   prompt: "Sugiere una categoría BI-RADS probable y justifica en 3-4 oraciones." },
    { id: "diff",    label: "Diferencial",       prompt: "Da un breve diagnóstico diferencial y qué hallazgos lo orientan." },
    { id: "next",    label: "Estudios extra",    prompt: "¿Qué vistas/estudios complementarios recomendarías y por qué?" },
    { id: "report",  label: "Resumen (5 bullets)", prompt: "Resume en 5 viñetas accionables para el reporte." }
  ];

  // ---------- STATE ----------
  let lastPredSignature = null; // firma del subset enviado al servidor
  let conversationId = localStorage.getItem("bcd_conversation_id") || null;
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
  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = (chatInput?.value || "").trim();
    if (!prompt) return;
    appendToLog("user", escapeHTML(prompt));
    if (chatInput) chatInput.value = "";
    try {
      const subset = selectedFindingIds.length
        ? (window.lastDetections || []).filter(p => selectedFindingIds.includes(p.id))
        : (window.lastDetections || []);
      const reply = await askChatbot(prompt, subset);
      renderChatReply(reply, subset.map(s => s.id));
    } catch (err) {
      renderChatReply("Error: " + err.message, []);
    }
  });
  renderQuickActions();

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
  async function askWithContext(basePrompt) {
    const sel = selectedFindingIds;
    const preds = window.lastDetections || [];
    const subset = sel.length ? preds.filter(p => sel.includes(p.id)) : preds;

    // Reinicia conversación si cambian hallazgos (para que el server reinyecte predictions)
    const signature = JSON.stringify(subset.map(d => ({ id: d.id, c: d.class, s: Math.round((d.score||0)*100)/100 })));
    if (signature !== lastPredSignature) {
      lastPredSignature = signature;
      localStorage.removeItem("bcd_conversation_id");
      conversationId = null;
    }

    const structuredHint = `
Responde primero con un **resumen breve y profesional** (máx. 6 líneas), redactado en lenguaje médico claro y conciso.  
Al final, agrega un bloque **JSON válido** entre triple backticks, siguiendo estrictamente el formato descrito.  
Los valores deben derivarse de los datos reales de "predictions" (usa sus campos: id, label, score, bbox).  
NO copies ni repitas el ejemplo literal, genera valores calculados en cada respuesta.

Formato esperado (ejemplo ilustrativo — NO lo repitas literalmente):
{
  "birads": "4B",                 // Usa SOLO uno de: "3","4A","4B","5". Si no hay datos concluyentes, usar "NA".
  "riesgo_aprox": 0.72,           // Número entre 0 y 1 con dos decimales. Calcula a partir de los 'score' (ej: máximo o promedio ponderado de hallazgos).
  "hallazgos_clave": [
    "H1: masa espiculada, score 0.91, cuadrante superoexterno",
    "H3: microcalcificaciones agrupadas, score 0.78"
  ],
  "recomendaciones": [
    "Biopsia con aguja gruesa para H1",
    "Ecografía dirigida para H3"
  ]
}

Reglas obligatorias:
- NO incluyas “3|4A|4B|5|NA” como texto; selecciona SOLO uno.
- Si no hay hallazgos, usa:  
  "birads": "NA", "riesgo_aprox": null, "hallazgos_clave": [], "recomendaciones": [].
- "hallazgos_clave" debe describir brevemente cada lesión con id, tipo y ubicación aproximada.
- "recomendaciones" debe ser SIEMPRE un array (vacío si no aplica).
- El bloque JSON debe estar bien formateado y ser parseable.
- El texto introductorio NO debe repetir el JSON ni explicar el formato; debe ser una interpretación clínica breve.
`;

    const prompt = `${basePrompt}
Ten en cuenta únicamente los hallazgos seleccionados: ${sel.length ? sel.join(", ") : "ninguno"}.
${structuredHint}`;

    try {
      const { text, struct, suggestions, evidenceIds, cached } = await askChatbot(prompt, subset);

      // 1) Texto (y evidencia usada si llega)
      const evid = (evidenceIds && evidenceIds.length)
        ? `<div style="opacity:.7;font-size:.85em;margin:.25rem 0">Basado en: ${evidenceIds.join(", ")}</div>`
        : (sel.length ? `<div style="opacity:.7;font-size:.85em;margin:.25rem 0">Basado en: ${sel.join(", ")}</div>` : "");
      const cacheTag = cached ? "<div style='opacity:.6'>⚡ desde caché</div>" : "";

      const cleanText = stripJsonBlocks(text);
      appendToLog("assistant", evid + escapeHTMLExceptCode(cleanText) + cacheTag);

      // 2) Tarjeta si viene estructura
      if (struct) renderStructuredCard(struct);

      // 3) Sugerencias clicables
      if (Array.isArray(suggestions) && suggestions.length) {
        renderSuggestions(suggestions);
      }
    } catch (err) {
      appendToLog("assistant", "Error: " + sanitize(err.message || err));
    }
  }

  // (B.1) Cliente robusto: soporta formato nuevo (text/struct/suggested_prompts/evidence_ids)
  // y retrocompatibilidad (response con bloque ```json```).
  async function askChatbot(prompt, findingsSubset){
    const payload = {
      prompt,
      predictions: (findingsSubset && findingsSubset.length) ? findingsSubset : (window.lastDetections || []),
      conversation_id: conversationId || undefined
    };

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

    // Formato nuevo
    let text = data?.text ??
               data?.response ??
               data?.choices?.[0]?.message?.content ??
               data?.message ?? "";

    // Intentar obtener struct: preferir data.struct; si no, extraer de bloque ```json```
    let struct = data?.struct ?? extractJsonBlock(text);

    const suggestions = Array.isArray(data?.suggested_prompts) ? data.suggested_prompts : [];
    const evidenceIds = Array.isArray(data?.evidence_ids) ? data.evidence_ids : [];
    const cached = !!data?.cached;

    if (!conversationId && data?.conversation_id) {
      conversationId = data.conversation_id;
      localStorage.setItem("bcd_conversation_id", conversationId);
    }

    return { text: String(text), struct, suggestions, evidenceIds, cached };
  }

  // (B.2) Sugerencias clicables bajo el último mensaje
  function renderSuggestions(list){
    if (!chatLog || !list?.length) return;
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexWrap = "wrap";
    wrap.style.gap = "8px";
    wrap.style.margin = "6px 0 10px 0";
    list.slice(0,4).forEach(s=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "finding-chip";
      b.textContent = s;
      b.onclick = ()=> askWithContext(s);
      wrap.appendChild(b);
    });
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // Compatibilidad: mantener parseador de bloques ```json``` (usado por B.1)
  function extractJsonBlock(text){
    if (typeof text !== "string") return null;
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  }

 function renderStructuredCard(obj){
  const card = document.createElement("div");
  card.className = "xai-card";

  // Claves alternativas y tipado robusto
  const birads = sanitize(obj?.birads ?? obj?.BI_RADS ?? obj?.bi_rads ?? "NA");
  const riesgo = sanitize(obj?.riesgo_aprox ?? obj?.risk ?? obj?.prob_risk ?? "NA");

  const hallRaw = obj?.hallazgos_clave ?? obj?.key_findings ?? obj?.findings ?? [];
  const hall = Array.isArray(hallRaw) ? hallRaw : (hallRaw && hallRaw !== "NA" ? [hallRaw] : []);
  const recsRaw = obj?.recomendaciones ?? obj?.recommendations ?? obj?.recs ?? [];
  const recs = Array.isArray(recsRaw) ? recsRaw : (recsRaw && recsRaw !== "NA" ? [recsRaw] : []);

  // Leyenda de hallazgos desde las predicciones actuales (id → label/score)
  let legendHtml = "";
  if (Array.isArray(window.lastDetections) && window.lastDetections.length){
    const items = window.lastDetections.map(d => {
      const id = sanitize(d.id || "");
      const lbl = sanitize(d.label ?? (d.class === 1 ? "Masa" : "Hallazgo"));
      const sc  = (typeof d.score === "number") ? d.score.toFixed(2) : (d.score ?? "—");
      return `<li><b>${id}</b>: ${lbl} (score ${sc})</li>`;
    }).join("");
    legendHtml = `
      <b>Leyenda de hallazgos</b>
      <ul>${items}</ul>
    `;
  }

  card.innerHTML = `
    <div class="row">
      <div><b>BI-RADS</b><div>${birads}</div></div>
      <div><b>Riesgo aprox.</b><div>${riesgo}</div></div>
    </div>

    ${legendHtml}

    <b>Hallazgos clave</b>
    <ul>${(hall.length ? hall.map(li => `<li>${sanitize(li)}</li>`).join("") : "<li>NA</li>")}</ul>

    <b>Recomendaciones</b>
    <ul>${(recs.length ? recs.map(li => `<li>${sanitize(li)}</li>`).join("") : "<li>NA</li>")}</ul>

    <div style="display:flex; gap:8px; margin-top:8px">
      <button type="button" class="copy-card">Copiar</button>
    </div>
  `;
  card.querySelector(".copy-card")?.addEventListener("click", () => {
    navigator.clipboard.writeText(card.innerText.trim());
  });

  document.getElementById("chat-log")?.appendChild(card);
  const log = document.getElementById("chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}


  // Utilidad para añadir mensajes al log (si no existía en tu versión)
  function appendToLog(role, htmlContent) {
    if (!chatLog) return;
    const d = document.createElement("div");
    d.className = "msg " + (role === "user" ? "user" : "assistant");
    d.innerHTML = `<b>${role === "user" ? "Tú" : "Asistente"}:</b> ${htmlContent}`;
    chatLog.appendChild(d);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function resetChatThread() {
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

  function stripJsonBlocks(t){
    if (typeof t !== "string") return "";
    // elimina bloques marcados como json
    let out = t.replace(/```json[\s\S]*?```/gi, "");
    // elimina bloques de triple comilla que empiezan con { o [
    out = out.replace(/```[\t ]*[\{\[][^\0]*?```/g, "");
    return out.trim();
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