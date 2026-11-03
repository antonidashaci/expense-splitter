# Expense Splitter

**[Open the demo →](https://antonidashaci.github.io/expense-splitter/)**

Split a shared bill and get the **fewest transfers that settle it**. No account,
no server, no build step — three files and `localStorage`.

## Run it

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Or just open `index.html`.

## What it does

- Add people, add expenses, tick who shared each one
- Per-person **paid / share / balance** table
- A settle-up list: `Bob → Ada  ₺1.250,50`
- TRY, EUR, USD, GBP
- Export the whole thing as JSON
- Works offline; nothing leaves the browser

## The parts that are actually hard

**Splitting without losing a kurus.** `100 / 3` in floats gives three people
`33.33` and leaves one kurus unaccounted for. `splitEvenly` hands out the
remainder one minor unit at a time, so the parts always sum back to the total:
`[34, 33, 33]`. The same goes for weighted splits, for when one person had the
steak.

**Everything is integer minor units.** Kurus and cents, never floats. The
amount becomes a decimal only when it's formatted for display.

**Settling in few transfers.** Naive settlement has everyone pay everyone.
Matching the largest debtor against the largest creditor repeatedly needs at
most *n − 1* transfers. Exact minimisation is NP-hard; this is within one
transfer of optimal at the group sizes a dinner bill has, and it is short enough
to read — which matters when someone is checking who owes them money.

**Parsing what people type.** A Turkish user types `347,65` and a British one
types `347.65`. `Intl` formats but will not parse, so `money.js` works out the
decimal separator from the string: two different separators means the last one
is the decimal point, one separator with three digits after it is a thousands
group. `1.2500` returns `null` rather than a confident guess.

**Balances always sum to zero**, including after you delete a person who was in
an old expense. That invariant is a property test, not a hope.

## Layout

| | |
| --- | --- |
| `core.js` | balances, splitting, settlement — no DOM |
| `money.js` | format and parse — no DOM |
| `app.js` | the UI |
| `index.html`, `styles.css` | markup and styles, dark mode included |

## Tests

```bash
npm test
```

23 tests with `node --test`. No framework, no jsdom — the arithmetic is kept out
of the DOM precisely so it can be tested without one.

## License

MIT
