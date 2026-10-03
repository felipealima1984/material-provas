const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextDayKey } = require('../js/googleCalendar.js');

test('nextDayKey soma um dia, inclusive virando mês/ano', () => {
  assert.equal(nextDayKey('2026-10-01'), '2026-10-02');
  assert.equal(nextDayKey('2026-10-31'), '2026-11-01');
  assert.equal(nextDayKey('2026-12-31'), '2027-01-01');
});
