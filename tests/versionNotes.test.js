const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, notesSince } = require('../js/versionNotes.js');

test('compareVersions compara numericamente, não como string ("1.9" < "1.10")', () => {
  assert.equal(compareVersions('1.9', '1.10'), -1);
  assert.equal(compareVersions('1.10', '1.9'), 1);
  assert.equal(compareVersions('1.70', '1.70'), 0);
  assert.equal(compareVersions('1.70', '1.69'), 1);
  assert.equal(compareVersions('1.69', '1.70'), -1);
});

test('notesSince retorna só as versões mais novas que lastSeen, em ordem crescente', () => {
  const notes = [
    { version: '1.70', notes: 'a' },
    { version: '1.71', notes: 'b' },
    { version: '1.72', notes: 'c' },
    { version: '1.73', notes: 'd' },
  ];
  const result = notesSince(notes, '1.70');
  assert.deepEqual(result.map(n => n.version), ['1.71', '1.72', '1.73']);
});

test('notesSince retorna vazio quando lastSeen é a versão mais recente ou não informado', () => {
  const notes = [{ version: '1.70', notes: 'a' }];
  assert.deepEqual(notesSince(notes, '1.70'), []);
  assert.deepEqual(notesSince(notes, null), []);
  assert.deepEqual(notesSince(notes, ''), []);
});

test('notesSince ordena corretamente mesmo se VERSION_NOTES estiver fora de ordem', () => {
  const notes = [
    { version: '1.73', notes: 'd' },
    { version: '1.71', notes: 'b' },
    { version: '1.72', notes: 'c' },
  ];
  const result = notesSince(notes, '1.70');
  assert.deepEqual(result.map(n => n.version), ['1.71', '1.72', '1.73']);
});
