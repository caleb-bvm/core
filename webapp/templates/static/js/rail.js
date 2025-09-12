// Rail behavior: smooth scroll + active link + theme toggle + theme event
document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggleBtn = document.getElementById('rail-theme-toggle');

  // Toggle tema desde el rail
  toggleBtn?.addEventListener('click', () => {
    const next = (html.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try{ localStorage.setItem('core-theme', next); }catch{}
    // 🔔 Notificar a los charts y a quien le importe
    try{ window.dispatchEvent(new CustomEvent('core-theme-change', { detail:{ theme: next } })); }catch{}
  });

  // Redundancia: si un script externo cambia el tema, reenviamos evento
  new MutationObserver((muts)=>{
    for (const m of muts){
      if (m.type === 'attributes' && m.attributeName === 'data-theme'){
        const t = html.getAttribute('data-theme');
        try{ window.dispatchEvent(new CustomEvent('core-theme-change', { detail:{ theme: t } })); }catch{}
        break;
      }
    }
  }).observe(html, { attributes:true });
});
