// ============================================================
// Lógica pura do sistema de Revisão Espaçada 1-3-7-21 — sem DOM, sem
// Supabase, sem efeitos colaterais (só recebe dados e devolve
// dados/decisões). Carregado tanto pelo index.html (<script src>) quanto
// pelos testes (tests/revisaoEngine.test.js) — mesma fonte, sem
// duplicação. Portado de revisaoEngine.js do projeto Mirante.
//
// `examDate` (quando um parâmetro pede) é a data da prova da cadeira
// vinculada, já resolvida pelo chamador — index.html faz essa resolução
// via CRUD.periodos (não cabe aqui, que não conhece a árvore de cadeiras
// do app). Passar null/undefined = sem prova cadastrada, nenhuma revisão
// é cancelada por data de prova.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RevisaoEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const REVIEW_OFFSETS = [1, 3, 7, 21];

  function reviewLabel(offset) {
    return { 1: '1ª revisão', 3: '2ª revisão', 7: '3ª revisão', 21: '4ª revisão' }[offset] || offset + 'd';
  }

  function hojeISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDiasISO(iso, dias) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function fmtBRData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function makeReviews(dataEstudo) {
    return REVIEW_OFFSETS.map(offset => ({
      offset, date: addDiasISO(dataEstudo, offset), status: 'pending', method: null, secondPassAck: false,
    }));
  }

  // "28/set" (sem ano, como mp_cadeiras.data_prova guarda) → ISO, usando o
  // ano corrente como base. Sem formato reconhecido, retorna null.
  const MESES_PT = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
  function parseDataProva(str, anoBase) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{1,2})\/([a-zçà-ú]{3,})\.?$/i);
    if (!m) return null;
    const dia = parseInt(m[1], 10);
    const mesKey = m[2].toLowerCase().slice(0, 3).normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mes = MESES_PT[mesKey];
    if (mes === undefined || !dia) return null;
    const ano = anoBase || new Date().getFullYear();
    return new Date(Date.UTC(ano, mes, dia)).toISOString().slice(0, 10);
  }

  function isSkipped(review, examDate) {
    if (!examDate) return false;
    return review.status !== 'done' && review.date > examDate;
  }

  function isDoneOrSkipped(review, examDate) {
    return review.status === 'done' || isSkipped(review, examDate);
  }

  function reviewState(review, examDate, today) {
    today = today || hojeISO();
    if (review.status === 'done') return review.method === 'struggle' ? 'done-struggle' : 'done-ok';
    if (isSkipped(review, examDate)) return 'skipped';
    if (review.date < today) return 'atrasada';
    if (review.date === today) return 'hoje';
    return 'futura';
  }

  function isActionable(review, examDate, today) {
    const st = reviewState(review, examDate, today);
    return st === 'atrasada' || st === 'hoje';
  }

  // `items` = [{ id, reviews, consolidated, ... }]. `examDateOf(item)` é
  // uma função fornecida pelo chamador que resolve a data de prova de um
  // item — mantém esta camada sem conhecimento de CRUD/cadeiras.
  function getActionableList(items, examDateOf, today) {
    today = today || hojeISO();
    const list = [];
    items.forEach(item => {
      if (item.consolidated) return;
      const examDate = examDateOf(item);
      item.reviews.forEach(r => {
        if (isActionable(r, examDate, today)) list.push({ item, review: r, atrasada: r.date < today });
      });
    });
    return list;
  }

  function getSecondPassList(items, today) {
    today = today || hojeISO();
    const list = [];
    items.forEach(item => {
      item.reviews.forEach(r => {
        if (r.status === 'done' && r.method === 'struggle' && !r.secondPassAck && r.date <= today) list.push({ item, review: r });
      });
    });
    return list;
  }

  function computeStreak(closedDays, today) {
    today = today || hojeISO();
    let count = 0, cursor = today;
    if (!closedDays.includes(cursor)) cursor = addDiasISO(cursor, -1);
    while (closedDays.includes(cursor)) { count++; cursor = addDiasISO(cursor, -1); }
    return count;
  }

  function updateClosedDayState(items, examDateOf, closedDays, today) {
    today = today || hojeISO();
    const pending = getActionableList(items, examDateOf, today);
    const idx = closedDays.indexOf(today);
    if (pending.length === 0) { if (idx === -1) closedDays.push(today); }
    else if (idx !== -1) closedDays.splice(idx, 1);
  }

  function recomputeConsolidated(item, examDate) {
    item.consolidated = item.reviews.every(r => isDoneOrSkipped(r, examDate));
  }

  return {
    REVIEW_OFFSETS, reviewLabel, hojeISO, addDiasISO, fmtBRData, makeReviews,
    parseDataProva, isSkipped, isDoneOrSkipped, reviewState, isActionable,
    getActionableList, getSecondPassList, computeStreak, updateClosedDayState,
    recomputeConsolidated,
  };
});
