// Clair / sombre: applied before the page is drawn (classic script in <head>, not a module),
// so a dark page never flashes white. The choice is kept in this browser (Paramètres → Apparence).
//   'clair' (default) · 'sombre' · 'auto' = follows Windows (light or dark mode)
(function () {
  var CLE = 'avicole-theme';
  var choix = 'clair';
  try { choix = localStorage.getItem(CLE) || 'clair'; } catch (e) { /* storage blocked: light theme */ }
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function appliquer() {
    var sombre = choix === 'sombre' || (choix === 'auto' && media && media.matches);
    document.documentElement.setAttribute('data-theme', sombre ? 'sombre' : 'clair');
  }
  appliquer();
  if (media && media.addEventListener) media.addEventListener('change', appliquer);

  window.themeAvicole = {
    lire: function () { return choix; },
    choisir: function (nouveau) {
      choix = nouveau;
      try { localStorage.setItem(CLE, nouveau); } catch (e) { /* kept for this page only */ }
      appliquer();
    },
  };
}());
