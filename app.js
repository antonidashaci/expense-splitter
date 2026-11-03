/**
 * UI for the expense splitter. The arithmetic lives in core.js; this file only
 * moves data between localStorage, a form and the DOM.
 */
import { settle, summary, total } from './core.js';
import { formatMinor, parseAmount } from './money.js';

const STORAGE_KEY = 'expense-splitter/v1';

/** @type {{ people: {id: string, name: string}[], expenses: any[], currency: string }} */
let state = load();

const el = {
  personForm: document.getElementById('person-form'),
  personName: document.getElementById('person-name'),
  people: document.getElementById('people'),
  expenseForm: document.getElementById('expense-form'),
  expenseError: document.getElementById('expense-error'),
  sharedBy: document.getElementById('shared-by'),
  expenses: document.getElementById('expenses'),
  summary: document.querySelector('#summary tbody'),
  summaryTable: document.getElementById('summary'),
  transfers: document.getElementById('transfers'),
  empty: document.getElementById('empty'),
  currency: document.getElementById('currency'),
  exportBtn: document.getElementById('export'),
  resetBtn: document.getElementById('reset'),
};

function load() {
  const blank = { people: [], expenses: [], currency: 'TRY' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return blank;
    const parsed = JSON.parse(raw);
    // Trust nothing: a hand-edited localStorage value should not break the app.
    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter((p) => p?.id && p?.name) : [],
      expenses: Array.isArray(parsed.expenses)
        ? parsed.expenses.filter((e) => e?.id && Number.isInteger(e.amount) && Array.isArray(e.sharedBy))
        : [],
      currency: typeof parsed.currency === 'string' ? parsed.currency : 'TRY',
    };
  } catch {
    return blank;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode, or a full quota. The session still works; nothing persists.
  }
}

const nameOf = (id) => state.people.find((p) => p.id === id)?.name ?? '(removed)';
const money = (minor) => formatMinor(minor, state.currency);
const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function render() {
  renderPeople();
  renderPaidBy();
  renderSharedBy();
  renderExpenses();
  renderSettlement();
  save();
}

function renderPeople() {
  el.people.replaceChildren(...state.people.map((person) => {
    const li = document.createElement('li');
    li.className = 'chip';
    li.append(person.name);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${person.name}`);
    remove.addEventListener('click', () => {
      state.people = state.people.filter((p) => p.id !== person.id);
      // Expenses they paid for make no sense without them.
      state.expenses = state.expenses.filter((e) => e.paidBy !== person.id);
      render();
    });
    li.append(remove);
    return li;
  }));
}

function renderPaidBy() {
  const select = el.expenseForm.elements.paidBy;
  const previous = select.value;
  select.replaceChildren(...state.people.map((person) => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name;
    return option;
  }));
  if (state.people.some((p) => p.id === previous)) select.value = previous;
}

function renderSharedBy() {
  el.sharedBy.replaceChildren(...state.people.map((person) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'sharedBy';
    box.value = person.id;
    box.checked = true;
    label.append(box, person.name);
    return label;
  }));
}

function renderExpenses() {
  el.expenses.replaceChildren(...state.expenses.map((expense) => {
    const li = document.createElement('li');

    const text = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = expense.description;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = `${nameOf(expense.paidBy)} paid · ${expense.sharedBy.length} sharing`;
    text.append(title, who);

    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = money(expense.amount);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${expense.description}`);
    remove.addEventListener('click', () => {
      state.expenses = state.expenses.filter((e) => e.id !== expense.id);
      render();
    });

    li.append(text, amount, remove);
    return li;
  }));
}

function renderSettlement() {
  const ids = state.people.map((p) => p.id);
  const hasData = ids.length > 0 && state.expenses.length > 0;

  el.empty.hidden = hasData;
  el.summaryTable.hidden = !hasData;
  if (!hasData) {
    el.summary.replaceChildren();
    el.transfers.replaceChildren();
    return;
  }

  const cell = (tag, text, className = '') => {
    const node = document.createElement(tag);
    if (tag === 'th') node.scope = 'row';
    node.className = className;
    node.textContent = text;
    return node;
  };

  const rows = summary(state.expenses, ids);
  el.summary.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr');
    const sign = row.net > 0 ? 'owed' : row.net < 0 ? 'owes' : '';
    tr.append(
      cell('th', nameOf(row.id)),
      cell('td', money(row.paid)),
      cell('td', money(row.share)),
      cell('td', money(row.net), sign),
    );
    return tr;
  }));

  const net = Object.fromEntries(rows.map((row) => [row.id, row.net]));
  const transfers = settle(net);

  const footer = document.createElement('tr');
  const spend = cell('td', money(total(state.expenses)));
  spend.colSpan = 3;
  footer.append(cell('th', 'Total'), spend);
  el.summary.append(footer);

  el.transfers.replaceChildren(...transfers.map((transfer) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${nameOf(transfer.from)} → ${nameOf(transfer.to)}`;
    const amount = document.createElement('span');
    amount.className = 'amount';
    amount.textContent = money(transfer.amount);
    li.append(text, amount);
    return li;
  }));

  if (!transfers.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Everyone is square.';
    el.transfers.append(li);
  }
}

el.personForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = el.personName.value.trim();
  if (!name) return;
  state.people.push({ id: newId(), name });
  el.personForm.reset();
  el.personName.focus();
  render();
});

el.expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const description = form.elements.description.value.trim();
  const amount = parseAmount(form.elements.amount.value, state.currency);
  const paidBy = form.elements.paidBy.value;
  const sharedBy = [...form.querySelectorAll('input[name="sharedBy"]:checked')].map((i) => i.value);

  const problem =
    !state.people.length ? 'Add at least one person first.'
    : amount === null ? 'That amount is not a number I can read.'
    : amount <= 0 ? 'The amount has to be more than zero.'
    : !paidBy ? 'Choose who paid.'
    : !sharedBy.length ? 'Pick at least one person to share it.'
    : null;

  el.expenseError.hidden = !problem;
  el.expenseError.textContent = problem ?? '';
  if (problem) return;

  state.expenses.unshift({ id: newId(), description, amount, paidBy, sharedBy });
  form.reset();
  render();
  form.elements.description.focus();
});

el.currency.addEventListener('change', () => {
  state.currency = el.currency.value;
  render();
});

el.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'expenses.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

el.resetBtn.addEventListener('click', () => {
  if (!confirm('Delete every person and expense in this browser?')) return;
  state = { people: [], expenses: [], currency: state.currency };
  render();
});

el.currency.value = state.currency;
render();
