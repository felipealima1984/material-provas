// ============================================================
// Changelog compacto por versão, usado pelo aviso de novidades
// (initWhatsNew em index.html). Lógica pura (comparação de versão +
// seleção de quais entradas mostrar) — sem DOM, testável
// (tests/versionNotes.test.js). Portado de versionNotes.js do Mirante.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VersionNotes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  /** Compara duas versões "major.minor" numericamente — "1.9" < "1.10", nunca como string. */
  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  /** Entradas de notes mais novas que `lastSeen`, em ordem crescente de versão. */
  function notesSince(notes, lastSeen) {
    if (!lastSeen) return [];
    return notes
      .filter(entry => compareVersions(entry.version, lastSeen) > 0)
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  return { compareVersions, notesSince };
});
