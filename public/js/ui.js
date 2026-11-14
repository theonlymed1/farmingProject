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

/**
 * Shows the API's per-field messages (erreur.details = { champ: message }) under each input.
 * `correspondance` maps API field names to input ids when they differ.
 */
export function afficherErreursChamps(formulaire, details, correspondance = {}) {
  effacerErreursChamps(formulaire);
  for (const [champ, message] of Object.entries(details ?? {})) {
    const input = formulaire.querySelector(`#${correspondance[champ] ?? champ}`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.className = 'erreur-champ';
    p.textContent = message;
    input.closest('.champ').append(p);
    // The message disappears as soon as the field is corrected.
    input.addEventListener('input', () => { p.remove(); input.removeAttribute('aria-invalid'); }, { once: true });
  }
}

export function effacerErreursChamps(formulaire) {
  formulaire.querySelectorAll('.erreur-champ').forEach((p) => p.remove());
  formulaire.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}

/** "Afficher / Masquer" buttons: <button data-basculer="id-of-password-input">. */
export function brancherBasculesMotDePasse(racine = document) {
  racine.querySelectorAll('[data-basculer]').forEach((bouton) => {
    bouton.addEventListener('click', () => {
      const input = document.getElementById(bouton.dataset.basculer);
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      bouton.textContent = visible ? 'Afficher' : 'Masquer';
    });
  });
}

/**
 * Yes/no question in a dialog (instead of the browser's confirm()).
 * Resolves true if the user clicks the confirm button.
 */
export function confirmer({ titre, message, bouton = 'Confirmer', danger = false }) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  dialogue.innerHTML = `
    <form method="dialog">
      <h2>${echapper(titre)}</h2>
      <p>${echapper(message)}</p>
      <div class="actions-dialogue">
        <button type="submit" value="non" class="bouton bouton-secondaire">Annuler</button>
        <button type="submit" value="oui" class="bouton${danger ? ' bouton-danger' : ''}">${echapper(bouton)}</button>
      </div>
    </form>`;
  document.body.append(dialogue);
  return new Promise((resoudre) => {
    dialogue.addEventListener('close', () => {
      resoudre(dialogue.returnValue === 'oui');
      dialogue.remove();
    });
    dialogue.showModal();
    dialogue.querySelector('[value="non"]').focus();
  });
}

/** Shows a short green confirmation that disappears after a few seconds. */
export function afficherSucces(conteneur, message, dureeMs = 4000) {
  conteneur.innerHTML = `<div class="alerte alerte-succes" role="status">${echapper(message)}</div>`;
  setTimeout(() => { conteneur.innerHTML = ''; }, dureeMs);
}
