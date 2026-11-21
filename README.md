# csv-reader-speed

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Farras45/csv-reader-speed/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Farras45/csv-reader-speed/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A fast, dependency-free CSV reader: a drop-in replacement for csv-reader 1.0.0
that returns exactly its answer for every input — same columns, rows and errors,
including its broken-row policy (BOM, stray CRs, quoted fields, quote junk,
unterminated quotes, short/long rows) — while reading several times faster.

## How it works

` solve.js` exports `run(input)`, which reads `{text, header}` once, left to
right, and returns `{columns, rows, errors}` exactly as csv-reader 1.0.0 does.
Instead of the reference's character-at-a-time scan, it finds field boundaries
with native `indexOf` scans and slices fields out of the text whole; records
with no quotes at all are split natively. On the practice set it runs about
3x faster than the reference reader (about 2x end to end, including JSON
parsing and output).

## Run it

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.
It needs Node 22.18 or later (it turns V8's incremental marking off, as the
house driver does). Outside a container, `MAKEFUN_INPUT_DIR` and
`MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`:

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out node main.ts
```

## Files

- `solve.js` — the fast reader (`run`)
- `main.ts` — the driver (reads `/input/cases.json`, writes `/output/answers.json`)
- `LICENSE` — MIT
