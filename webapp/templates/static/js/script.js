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

    // ===== Métricas del modelo (demo) =====
  const prmap = byId('chart-prmap');
  if (prmap) new Chart(prmap.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Precision', 'Recall', 'mAP@[.5:.95]'],
      datasets: [{
        data: [0.93, 0.91, 0.89], // <-- coloca aquí tus valores reales si los tienes
        borderRadius: 8
      }]
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
      datasets: [{
        label: 'ms/imagen',
        data: [180, 42, 28], // demo
        tension: .35
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
      responsive: true
    }
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
  const form = byId('upload-form');
  const statusEl = byId('upload-status');
  const progress = byId('progress');
  const results = byId('results');
  const imgOriginal = byId('img-original');
  const imgInfer = byId('img-infer');
  const predContainer = byId('pred-container');
  const predList = byId('pred-list');
  const btnClear = byId('btn-clear');
  const pickBtn = byId('pick-image');
  const fileEl = byId('file');

  const show = (el, ok=true)=>{ if(el) el.style.display = ok? '' : 'none'; };
  const resetResults = ()=>{
    if (statusEl) statusEl.textContent='';
    show(results,false); show(predContainer,false);
    if (imgOriginal) imgOriginal.src=''; if (imgInfer) imgInfer.src='';
    if (predList) predList.innerHTML='';
  };
  const setBusy = (busy)=>{
    if (!pickBtn || !btnClear) return;
    try { progress.closed = !busy; progress.indeterminate = busy; } catch {}
    const hasFile = !!fileEl?.files?.length;
    byId('btn-submit').disabled = busy || !hasFile;
    pickBtn.disabled   = busy;
    btnClear.disabled  = busy;
  };

  async function postPredict(fd){
    const r = await fetch('/api/v1/predict', { method:'POST', body:fd });
    const j = await r.json();
    if (!r.ok || j.status!=='success') throw new Error(j.message || 'Error de inferencia');
    return j.data; // { original_image, inferred_image, ground_truth_image?, predictions }
  }

  // Abrir selector
  byId('pick-image')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    ev.stopImmediatePropagation();
    fileEl?.click();
  }, { capture:true });

  // Habilitar submit cuando hay archivo
  fileEl?.addEventListener('change', (ev)=>{
    ev.stopImmediatePropagation();
    const has = !!fileEl?.files?.length;
    byId('btn-submit').disabled = !has;
    if (statusEl) statusEl.textContent = has ? 'Listo para analizar.' : '';
  }, { capture:true });

  // Reset
  btnClear?.addEventListener('click', (ev)=>{
    ev.stopImmediatePropagation();
    form?.reset(); resetResults();
    byId('btn-submit').disabled = true;
  }, { capture:true });

  // Submit → API real
  form?.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!fileEl?.files?.length) return;

    setBusy(true);
    if (statusEl) statusEl.textContent='Procesando…';

    try{
      const fd = new FormData(form);
      const data = await postPredict(fd);

      // Imágenes devueltas por Flask en base64
      if (imgOriginal) imgOriginal.src = data.original_image ? `data:image/jpeg;base64,${data.original_image}` : '';
      if (imgInfer)    imgInfer.src    = data.inferred_image ? `data:image/jpeg;base64,${data.inferred_image}` : '';

      // Lista de predicciones
      predList.innerHTML = '';
      if (Array.isArray(data.predictions)){
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
      show(predContainer, predList.children.length>0);
      if (statusEl) statusEl.textContent='Listo';
    }catch(err){
      console.error(err);
      if (statusEl) statusEl.textContent=`Error: ${err.message}`;
    }finally{
      setBusy(false);
    }
  }, { capture:true });


  // Toggle de tema desde el rail + persistencia
  const THEME_KEY = 'core-theme';

  function setThemeAttr(mode){
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_KEY, mode);
  }

  async function applyThemeAnimated(nextMode){
    const root = document.documentElement;

    // Web View Transitions (Chrome/Edge modernos)
    if (document.startViewTransition) {
      root.classList.add('theme-animating');
      await document.startViewTransition(() => setThemeAttr(nextMode)).finished
        .catch(()=>{}); // por si falla
      root.classList.remove('theme-animating');
      return;
    }

    // Fallback: transiciones CSS clásicas
    root.classList.add('theme-animating');
    setThemeAttr(nextMode);
    // quita la clase tras el tiempo de las transiciones CSS (240ms + margen)
    setTimeout(() => root.classList.remove('theme-animating'), 320);
  }

  // Init preferencia guardada o media query
  (function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) setThemeAttr(saved);
    else {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
      setThemeAttr(prefersDark ? 'dark' : 'light');
    }
  })();

    document.getElementById('rail-theme-toggle')?.addEventListener('click', ()=>{
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyThemeAnimated(next);
    });
  
  }); // <-- Add this line to close the DOMContentLoaded event listener

  // Accordion: abrir uno cierra los demás en #faq
document.querySelector('#faq')?.addEventListener('toggle', (e) => {
  const t = e.target;
  if (t.tagName === 'DETAILS' && t.open) {
    const siblings = t.closest('.section-grid')?.querySelectorAll('details.faq-item') || [];
    siblings.forEach(d => { if (d !== t) d.open = false; });
  }
});
