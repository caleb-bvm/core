
// Rail behavior: smooth scroll + active link + theme toggle
document.addEventListener('DOMContentLoaded', () => {
  const railLinks = document.querySelectorAll('.side-nav .nav-item[href^="#"]');
  const sections = [...railLinks].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

  railLinks.forEach(a=>{
    a.addEventListener('click', (ev)=>{
      ev.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  try{
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          const id = '#' + e.target.id;
          railLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href')===id));
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0.0 });

    sections.forEach(s => io.observe(s));
  }catch{}

  document.getElementById('rail-theme-toggle')?.addEventListener('click', ()=>{
    const html = document.documentElement;
    const next = (html.getAttribute('data-theme')||'light') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('core-theme', next);
  });
});
