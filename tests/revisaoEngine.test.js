const { test } = require('node:test');
const assert = require('node:assert/strict');
const RevisaoEngine = require('../js/revisaoEngine.js');

const {
  makeReviews, addDiasISO, isSkipped, reviewState, isActionable,
  getActionableList, getSecondPassList, computeStreak, updateClosedDayState,
  recomputeConsolidated, parseDataProva,
} = RevisaoEngine;

test('makeReviews gera as 4 revisões nos offsets corretos (1, 3, 7, 21 dias)', () => {
  const reviews = makeReviews('2026-10-01');
  assert.equal(reviews.length, 4);
  assert.deepEqual(reviews.map(r => r.offset), [1, 3, 7, 21]);
  assert.deepEqual(reviews.map(r => r.date), ['2026-10-02', '2026-10-04', '2026-10-08', '2026-10-22']);
  reviews.forEach(r => {
    assert.equal(r.status, 'pending');
    assert.equal(r.method, null);
    assert.equal(r.secondPassAck, false);
  });
});

test('addDiasISO soma e subtrai dias corretamente, inclusive virando mês/ano', () => {
  assert.equal(addDiasISO('2026-10-01', 1), '2026-10-02');
  assert.equal(addDiasISO('2026-10-31', 1), '2026-11-01');
  assert.equal(addDiasISO('2026-12-31', 1), '2027-01-01');
  assert.equal(addDiasISO('2026-10-01', -1), '2026-09-30');
});

test('reviewState: pendente sem prova cadastrada é "atrasada" ou "hoje" ou "futura" conforme a data', () => {
  const r = { status: 'pending', date: '2026-10-01' };
  assert.equal(reviewState(r, null, '2026-10-05'), 'atrasada');
  assert.equal(reviewState(r, null, '2026-10-01'), 'hoje');
  assert.equal(reviewState(r, null, '2026-09-20'), 'futura');
});

test('reviewState: concluída reflete o método (ok vs struggle)', () => {
  assert.equal(reviewState({ status: 'done', method: 'ok', date: '2026-10-01' }, null, '2026-10-05'), 'done-ok');
  assert.equal(reviewState({ status: 'done', method: 'struggle', date: '2026-10-01' }, null, '2026-10-05'), 'done-struggle');
});

test('isSkipped: revisão cai "skipped" só se a data for depois da prova e ainda não feita', () => {
  const r = { status: 'pending', date: '2026-10-25' };
  assert.equal(isSkipped(r, '2026-10-20'), true); // revisão depois da prova
  assert.equal(isSkipped(r, '2026-10-30'), false); // revisão antes da prova
  assert.equal(isSkipped(r, null), false); // sem prova cadastrada, nunca cancela
  assert.equal(isSkipped({ status: 'done', date: '2026-10-25' }, '2026-10-20'), false); // já feita não é "pulada"
});

test('isActionable: só atrasada ou hoje são acionáveis — futura e skipped não', () => {
  assert.equal(isActionable({ status: 'pending', date: '2026-10-01' }, null, '2026-10-05'), true);
  assert.equal(isActionable({ status: 'pending', date: '2026-10-05' }, null, '2026-10-05'), true);
  assert.equal(isActionable({ status: 'pending', date: '2026-10-10' }, null, '2026-10-05'), false);
  assert.equal(isActionable({ status: 'pending', date: '2026-10-25' }, '2026-10-20'), false);
});

test('getActionableList: ignora assuntos já consolidados e lista só as revisões acionáveis', () => {
  const items = [
    { id: 'a', consolidated: false, reviews: makeReviews('2026-09-30') }, // 1,3,7,21 → 10-01,10-03,10-07,10-21
    { id: 'b', consolidated: true, reviews: makeReviews('2026-09-30') },  // consolidado — não deve aparecer
  ];
  const today = '2026-10-03';
  const list = getActionableList(items, () => null, today);
  // em 'a': offset 1 (10-01, atrasada) e offset 3 (10-03, hoje) são acionáveis
  assert.equal(list.length, 2);
  assert.ok(list.every(l => l.item.id === 'a'));
  const atrasadas = list.filter(l => l.atrasada);
  assert.equal(atrasadas.length, 1);
});

test('getSecondPassList: só itens "travei" ainda não confirmados e já vencidos', () => {
  const items = [{
    id: 'a', reviews: [
      { offset: 1, date: '2026-10-01', status: 'done', method: 'struggle', secondPassAck: false },
      { offset: 3, date: '2026-10-03', status: 'done', method: 'struggle', secondPassAck: true }, // já confirmado
      { offset: 7, date: '2026-10-07', status: 'done', method: 'ok', secondPassAck: false }, // não travou
      { offset: 21, date: '2026-10-21', status: 'done', method: 'struggle', secondPassAck: false }, // ainda não venceu
    ],
  }];
  const list = getSecondPassList(items, '2026-10-05');
  assert.equal(list.length, 1);
  assert.equal(list[0].review.offset, 1);
});

test('computeStreak conta dias consecutivos fechados terminando hoje ou ontem', () => {
  assert.equal(computeStreak([], '2026-10-05'), 0);
  assert.equal(computeStreak(['2026-10-05'], '2026-10-05'), 1);
  assert.equal(computeStreak(['2026-10-03', '2026-10-04', '2026-10-05'], '2026-10-05'), 3);
  // hoje ainda não fechado, mas ontem+antes de ontem sim — streak conta a partir de ontem
  assert.equal(computeStreak(['2026-10-03', '2026-10-04'], '2026-10-05'), 2);
  // quebrou um dia no meio — streak para
  assert.equal(computeStreak(['2026-10-01', '2026-10-04', '2026-10-05'], '2026-10-05'), 2);
});

test('updateClosedDayState marca hoje como fechado quando não há pendências, e reabre se surgir uma', () => {
  const closedDays = [];
  const itemsSemPendencia = [{ id: 'a', consolidated: true, reviews: makeReviews('2026-09-01') }];
  updateClosedDayState(itemsSemPendencia, () => null, closedDays, '2026-10-05');
  assert.deepEqual(closedDays, ['2026-10-05']);

  const itemsComPendencia = [{ id: 'a', consolidated: false, reviews: makeReviews('2026-10-04') }]; // offset 1 = 10-05, hoje
  updateClosedDayState(itemsComPendencia, () => null, closedDays, '2026-10-05');
  assert.deepEqual(closedDays, []); // reabriu
});

test('recomputeConsolidated marca consolidated=true só quando todas as revisões estão feitas ou puladas', () => {
  const item = { reviews: makeReviews('2026-10-01') };
  recomputeConsolidated(item, null);
  assert.equal(item.consolidated, false);

  item.reviews.forEach(r => { r.status = 'done'; r.method = 'ok'; });
  recomputeConsolidated(item, null);
  assert.equal(item.consolidated, true);
});

test('recomputeConsolidated considera revisões puladas por data de prova como "feitas"', () => {
  const item = { reviews: makeReviews('2026-10-01') }; // datas: 10-02, 10-04, 10-08, 10-22
  recomputeConsolidated(item, '2026-10-05'); // prova antes das 2 últimas revisões
  assert.equal(item.consolidated, false); // as 2 primeiras (10-02, 10-04) ainda pendentes, não puladas

  item.reviews[0].status = 'done'; item.reviews[0].method = 'ok';
  item.reviews[1].status = 'done'; item.reviews[1].method = 'ok';
  recomputeConsolidated(item, '2026-10-05'); // as 2 últimas (10-08, 10-22) agora são "skipped" (depois da prova)
  assert.equal(item.consolidated, true);
});

test('parseDataProva converte "28/set" para ISO usando o ano informado', () => {
  assert.equal(parseDataProva('28/set', 2026), '2026-09-28');
  assert.equal(parseDataProva('1/out', 2026), '2026-10-01');
  assert.equal(parseDataProva('', 2026), null);
  assert.equal(parseDataProva('data inválida', 2026), null);
  assert.equal(parseDataProva(null, 2026), null);
});
