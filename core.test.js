import assert from 'node:assert/strict';
import { test } from 'node:test';

import { balances, settle, splitByWeights, splitEvenly, summary, total } from './core.js';

const expense = (amount, paidBy, sharedBy, extra = {}) =>
  ({ id: Math.random().toString(36).slice(2), description: 'x', amount, paidBy, sharedBy, ...extra });

const sum = (values) => values.reduce((a, b) => a + b, 0);

test('splitEvenly loses nothing', () => {
  assert.deepEqual(splitEvenly(100, 3), [34, 33, 33]);
  assert.deepEqual(splitEvenly(100, 1), [100]);
  assert.deepEqual(splitEvenly(0, 3), [0, 0, 0]);
  for (let amount = 0; amount < 200; amount += 1) {
    for (let n = 1; n <= 7; n += 1) {
      assert.equal(sum(splitEvenly(amount, n)), amount, `${amount}/${n}`);
    }
  }
});

test('splitEvenly handles refunds', () => {
  assert.deepEqual(splitEvenly(-100, 3), [-34, -33, -33]);
  assert.throws(() => splitEvenly(100, 0), RangeError);
});

test('splitByWeights loses nothing', () => {
  assert.deepEqual(splitByWeights(9000, [1, 2, 3]), [1500, 3000, 4500]);
  assert.equal(sum(splitByWeights(5, [3, 7])), 5);
  assert.equal(sum(splitByWeights(1001, [1, 1, 1])), 1001);
  assert.throws(() => splitByWeights(100, [0, 0]), RangeError);
});

test('balances always sum to zero', () => {
  const people = ['ada', 'bob', 'cem'];
  const expenses = [
    expense(9000, 'ada', people),
    expense(3000, 'bob', ['bob', 'cem']),
    expense(1250, 'cem', people),
  ];
  assert.equal(sum(Object.values(balances(expenses, people))), 0);
});

test('one payer, three sharers', () => {
  const people = ['ada', 'bob', 'cem'];
  const net = balances([expense(9000, 'ada', people)], people);
  assert.equal(net.ada, 6000);
  assert.equal(net.bob, -3000);
  assert.equal(net.cem, -3000);
});

test('an expense not shared by everyone', () => {
  const people = ['ada', 'bob', 'cem'];
  const net = balances([expense(3000, 'bob', ['bob', 'cem'])], people);
  assert.equal(net.ada, 0);
  assert.equal(net.bob, 1500);
  assert.equal(net.cem, -1500);
});

test('weights, for the person who had the steak', () => {
  const people = ['ada', 'bob'];
  const net = balances(
    [expense(9000, 'ada', people, { weights: [2, 1] })],
    people,
  );
  assert.equal(net.ada, 3000);  // paid 9000, owes 6000
  assert.equal(net.bob, -3000);
});

test('a participant removed after the fact is dropped, not leaked', () => {
  // zoe is gone, so her share falls back on the remaining sharers rather than
  // disappearing and leaving the balances unable to sum to zero.
  const net = balances([expense(3000, 'ada', ['ada', 'zoe'])], ['ada', 'bob']);
  assert.equal(sum(Object.values(net)), 0);
  assert.equal(net.ada, 0); // paid 3000, now the only sharer
  assert.equal(net.bob, 0);
  assert.ok(!('zoe' in net));
});

test('settle clears every balance', () => {
  const people = ['ada', 'bob', 'cem', 'dia'];
  const expenses = [
    expense(12000, 'ada', people),
    expense(4000, 'bob', ['bob', 'cem']),
    expense(777, 'dia', people),
  ];
  const net = balances(expenses, people);
  const transfers = settle(net);

  const after = { ...net };
  for (const t of transfers) {
    after[t.from] += t.amount;
    after[t.to] -= t.amount;
  }
  assert.ok(Object.values(after).every((v) => v === 0), JSON.stringify(after));
});

test('settle needs at most n-1 transfers', () => {
  const people = ['a', 'b', 'c', 'd', 'e'];
  const net = balances([
    expense(10000, 'a', people),
    expense(2500, 'b', people),
    expense(333, 'c', people),
  ], people);
  assert.ok(settle(net).length <= people.length - 1);
});

test('settle is empty when nobody owes anything', () => {
  assert.deepEqual(settle({ a: 0, b: 0 }), []);
  const people = ['a', 'b'];
  assert.deepEqual(settle(balances([expense(1000, 'a', ['a']), expense(1000, 'b', ['b'])], people)), []);
});

test('settle is deterministic', () => {
  const net = { a: -500, b: -500, c: 1000 };
  assert.deepEqual(settle(net), settle({ ...net }));
  assert.deepEqual(settle(net).map((t) => t.from), ['a', 'b']);
});

test('no transfer is ever zero', () => {
  const transfers = settle({ a: -1, b: 1, c: 0 });
  assert.deepEqual(transfers, [{ from: 'a', to: 'b', amount: 1 }]);
});

test('summary reconciles paid, share and net', () => {
  const people = ['ada', 'bob'];
  const expenses = [expense(10000, 'ada', people), expense(2000, 'bob', people)];
  const rows = summary(expenses, people);

  assert.equal(total(expenses), 12000);
  assert.equal(sum(rows.map((r) => r.share)), 12000);
  assert.equal(sum(rows.map((r) => r.paid)), 12000);
  assert.equal(sum(rows.map((r) => r.net)), 0);
  assert.deepEqual(rows[0], { id: 'ada', paid: 10000, share: 6000, net: 4000 });
});

test('an awkward real split', () => {
  // dinner 347.65 TL paid by one person, four people, one left early
  const people = ['ada', 'bob', 'cem', 'dia'];
  const expenses = [
    expense(34765, 'ada', people),
    expense(9000, 'bob', ['ada', 'bob', 'cem']),
  ];
  const net = balances(expenses, people);
  assert.equal(sum(Object.values(net)), 0);

  const transfers = settle(net);
  assert.equal(sum(transfers.map((t) => t.amount)), Math.abs(sum(Object.values(net).filter((v) => v < 0))));
});
