
(function(){
  const KEY = 'core-theme';
  const html = document.documentElement;

  function apply(mode){
    html.setAttribute('data-theme', mode);
    try{ localStorage.setItem(KEY, mode); }catch{}
    const sw = document.getElementById('theme-switch');
    if (sw && 'selected' in sw) sw.selected = (mode === 'dark');
  }

  function current(){
    return html.getAttribute('data-theme') || 'light';
  }

  // Init (once)
  (function init(){
    let mode = null;
    try{ mode = localStorage.getItem(KEY); }catch{}
    if (!mode){
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      mode = prefersDark ? 'dark' : 'light';
    }
    apply(mode);
  })();

  // Rail button
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest && ev.target.closest('#rail-theme-toggle');
    if (!btn) return;
    const next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
  });

  // MD switch (if present)
  document.addEventListener('change', (ev)=>{
    const t = ev.target;
    if (!t || t.id !== 'theme-switch') return;
    const next = t.selected ? 'dark' : 'light';
    apply(next);
  });
})();
