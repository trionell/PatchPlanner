# Quickstart — seeing rental pricing work

Never against `backend/patchplanner.db`. Copy it and point the server at the copy:

```bash
cp backend/patchplanner.db /tmp/pp.db
cd backend && PATCHPLANNER_DB=/tmp/pp.db go run ./cmd
cd frontend && npx vite dev
```

Migration 050 applies on startup. Every existing row keeps its meaning: catalogs
become `onsite` / 25%, events carry no departures, and every order prices at
×1.00 and 0% until a rate card arrives.

---

## 1 · The case the slice exists for

1. Import the real `LL.xlsx` into a catalog (Inventories → a catalog → **Import**).
2. Open that catalog's **Pricing** drawer. **Sixteen rows**, 1→1.00 through
   30→6.60, and **VAT 25%** — none of it typed.
3. Create an event on that catalog with load-in **2026-08-12**, start
   **2026-08-13**, end **2026-08-15**, load-out **2026-08-16**.
4. Plan enough gear to reach a subtotal, then open **Rental order**.
5. The strip reads `… 5 days ×2.20 … kr ex VAT` with the inc-VAT total after it.
   Before this slice it read the subtotal and stopped.
6. Open **Pricing**, type a discount of **25**, and watch the ledger and the
   strip agree: subtotal → −25% → ×2.20 → total → VAT → total inc VAT.

---

## 2 · The three departures

| Try | Expect |
|---|---|
| Set the event to **show days only** | 3 days (13→15 Aug), the factor drops to the 3-day row, the catalog is unchanged |
| Type a **rent factor override** of `3.4` | ×3.40, and the drawer says the number is this event's |
| Empty the override | back to the catalog's table, immediately |
| Change the **catalog's** rule | every event that never departed follows it; the one that did, does not |

---

## 3 · The rate card by hand

1. In the catalog's Pricing drawer, add `45 → 8.0`. It sorts into place.
2. Change a factor and leave the field — it persists on blur, like every other
   field in the application.
3. Add a second row with `days 5`. Refused, **409**, naming the day count.
4. Re-import the same `LL.xlsx`. The hand-typed 45-day row is **gone** — an
   import carrying a table replaces it (research.md R7).
5. Import a generic file with no `Pricing` sheet. The table is **untouched**.

---

## 4 · The step down

With LL's card loaded, set an event's dates to give:

| Billed days | Factor | Why |
|---|---|---|
| 5 | ×2.20 | exact row |
| 17 | ×4.00 | the 14-day row — the last rate you qualified for |
| 45 | ×6.60 | the 30-day row, held |
| 1 | ×1.00 | exact row |

The drawer names the row it used, so a step-down is visible rather than inferred.

---

## 5 · The generic format

1. **Inventories → Import → Blank template (.xlsx)**. It now has three sheets:
   `Inventory`, `Pricing`, `Example`.
2. Upload it untouched. The catalog's rate card is **unchanged** — a sheet with
   no rows carries no table.
3. Fill `Pricing` in — `VAT % 25`, then `Days`/`Factor` rows — and re-upload. The
   card and the VAT rate arrive.
4. Put `tre` in a days cell. The catalog still imports; the row is a **warning**
   in the import result, not an error.

---

## 6 · The paper

Take all three exports of the priced event and find the same figures in each:

- **PDF** — the TOTAL row now says *per day*, followed by discount, rent factor
  (naming the days and the row), the priced total, VAT and the inc-VAT total.
- **Spreadsheet** — the same six as rows under the existing TOTAL.
- **LL.xlsx** — open `Sammanställning`. `Rabatt utrustning` reads `0,25` and
  `Hyresfaktor (Antal dagar)` reads `2,2`, **in both the Ljud and Ljus columns**,
  and every figure below them is the file's own formula computing. Nothing else
  in that sheet was written.

Then break it on purpose: rename `Rabatt utrustning` in a copy of the file,
import it, and export. The **quantities still arrive** and the tab reports that
the pricing could not be placed.

Set the event's VAT to 12 and export again: the file's `*1.25` formulas are
untouched and the report names both numbers.

---

## 7 · What must not have moved

- Every **line** on the order still shows its **day rate**, on screen and on all
  three exports.
- The Overview number band still says *RENTAL, EX VAT* — and now means the priced
  total, not the day rate.
- The strip's **tint** is still the stock verdict. A catalog with no rate card
  says `×1.00 no rate card` in amber **words** on an untinted strip.
- Owned gear is untouched: no factor, no discount, no VAT.
- A **viewer** reads every number in both drawers and is offered no field.
- `design/` is unchanged.

---

## 8 · The phone

At 375 px: the rental panel's `⋯` carries **Pricing**, opening a sheet with the
same four controls and the same ledger at 44 px. The strip carries the same
derivation. The catalog's rate card is reachable the same way.
