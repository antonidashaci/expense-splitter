/**
 * Bill splitting: balances, then the smallest set of transfers that clears them.
 *
 * Everything is in integer minor units (kurus, cents). A split done in floats
 * leaves one person owing 0.004 and the group arguing about a rounding error.
 */

/**
 * @typedef {object} Expense
 * @property {string} id
 * @property {string} description
 * @property {number} amount      minor units
 * @property {string} paidBy      participant id
 * @property {string[]} sharedBy  participant ids
 * @property {number[]} [weights] one per sharedBy entry; defaults to equal
 */

/**
 * @typedef {object} Transfer
 * @property {string} from
 * @property {string} to
 * @property {number} amount minor units
 */

/**
 * Split `total` into `n` whole parts that sum back to `total` exactly.
 * 100 / 3 becomes 34 + 33 + 33, never 33.33 three times.
 *
 * @param {number} total minor units
 * @param {number} n
 * @returns {number[]}
 */
export function splitEvenly(total, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Need at least one share, got ${n}`);
  const base = Math.trunc(total / n);
  let remainder = total - base * n;
  const step = Math.sign(remainder) || 1;
  return Array.from({ length: n }, () => {
    const extra = remainder !== 0 ? step : 0;
    remainder -= extra;
    return base + extra;
  });
}

/**
 * Split `total` by weights, losing nothing.
 * @param {number} total minor units
 * @param {number[]} weights
 * @returns {number[]}
 */
export function splitByWeights(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new RangeError('Weights must sum to a positive number');
  const parts = weights.map((w) => Math.trunc((total * w) / sum));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const step = Math.sign(remainder) || 1;
  for (let i = 0; remainder !== 0; i = (i + 1) % parts.length) {
    parts[i] += step;
    remainder -= step;
  }
  return parts;
}

/**
 * Net position per participant: positive is owed money, negative owes money.
 * Always sums to zero.
 *
 * @param {Expense[]} expenses
 * @param {string[]} participants
 * @returns {Record<string, number>} minor units
 */
export function balances(expenses, participants) {
  const net = Object.fromEntries(participants.map((id) => [id, 0]));

  for (const expense of expenses) {
    // A participant deleted after an expense was entered is dropped here, so
    // the balances still sum to zero instead of silently leaking money.
    const useWeights = expense.weights?.length === expense.sharedBy.length;
    const shares = expense.sharedBy
      .map((id, i) => ({ id, weight: useWeights ? expense.weights[i] : 1 }))
      .filter(({ id }) => id in net);
    if (!shares.length) continue;

    const owed = useWeights
      ? splitByWeights(expense.amount, shares.map((s) => s.weight))
      : splitEvenly(expense.amount, shares.length);

    shares.forEach(({ id }, i) => { net[id] -= owed[i]; });
    if (expense.paidBy in net) net[expense.paidBy] += expense.amount;
  }
  return net;
}

/**
 * The transfers that settle the group.
 *
 * Greedy largest-creditor/largest-debtor: repeatedly match the biggest debt
 * against the biggest credit. Minimising the number of transfers exactly is
 * NP-hard, and this is within one transfer of optimal for the group sizes a
 * bill split actually has - while being obvious to read, which matters more
 * when someone is checking who owes them money.
 *
 * @param {Record<string, number>} net
 * @returns {Transfer[]}
 */
export function settle(net) {
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));

  // Sort by amount, then id, so the same input always gives the same answer.
  const byAmount = (a, b) => b.v - a.v || a.id.localeCompare(b.id);
  creditors.sort(byAmount);
  debtors.sort(byAmount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i += 1;
    if (creditors[j].v === 0) j += 1;
  }
  return transfers;
}

/**
 * Per-participant summary: what they paid, what they owe, where they stand.
 *
 * @param {Expense[]} expenses
 * @param {string[]} participants
 */
export function summary(expenses, participants) {
  const net = balances(expenses, participants);
  const paid = Object.fromEntries(participants.map((id) => [id, 0]));
  for (const expense of expenses) {
    if (expense.paidBy in paid) paid[expense.paidBy] += expense.amount;
  }
  return participants.map((id) => ({
    id,
    paid: paid[id],
    share: paid[id] - net[id],
    net: net[id],
  }));
}

/** Total of every expense, in minor units. */
export function total(expenses) {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}
