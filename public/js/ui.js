// Small UI helpers shared by all pages.

/**
 * Escape text before putting it in innerHTML. ALWAYS use it for data that came from the
 * API or from a form, e.g. `<td>${echapper(charge.libelle)}</td>`.
 */
export function echapper(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Shows an ErreurApi (or any error) as a red message inside `conteneur`. */
export function afficherErreur(conteneur, erreur) {
  const message = erreur?.message || 'Une erreur inattendue est survenue.';
  conteneur.innerHTML = `<div class="alerte alerte-erreur" role="alert">${echapper(message)}</div>`;
}

/** Shows a short green confirmation that disappears after a few seconds. */
export function afficherSucces(conteneur, message, dureeMs = 4000) {
  conteneur.innerHTML = `<div class="alerte alerte-succes" role="status">${echapper(message)}</div>`;
  setTimeout(() => { conteneur.innerHTML = ''; }, dureeMs);
}
