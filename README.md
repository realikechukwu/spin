# Handover Teaching Wheel

Spin the wheel for a ninety second acute medicine teaching point at the end of handover.
Live at **[spin.clinote.co](https://spin.clinote.co/)**.

## Adding or editing a teaching point

All the content lives in [`data/topics.csv`](data/topics.csv). One row per teaching point.
Open it in Excel, Numbers, Google Sheets or GitHub's own editor, change a row, commit —
that is the whole workflow. Nothing in the code needs touching.

| Column | What goes in it |
|---|---|
| `id` | The number shown on the wheel and in the doc. Must be unique. |
| `system` | One of the `key` values in [`data/systems.csv`](data/systems.csv) — sets the colour and the legend group. |
| `theme` | The sub-heading, e.g. "Chest pain and ACS". |
| `title` | The teaching point itself, as a sentence. |
| `principle` | The physiology or logic, one or two sentences. |
| `rule` | The concrete numbers and actions. |
| `trap` | The specific error it prevents. |
| `takehome` | The single line people should carry away. |
| `source` | Guideline or paper the point rests on. |
| `check_label` | Link text for the fact check. |
| `check_url` | Link target. Must start with `http://` or `https://`. |

Fields containing a comma, a quote mark or a line break must be wrapped in double quotes,
and a literal quote mark inside a field is doubled (`""`). Every spreadsheet does this for
you on export; if you are editing the raw file by hand, keep every field quoted the way the
existing rows are.

Adding a **system** means adding a row to `data/systems.csv` — `key`, display `name`, and a
`#RRGGBB` colour. Row order there sets the order of the colour blocks around the wheel.

The build refuses to run if a row is missing a field, reuses an `id`, points at a system
that does not exist, or has a fact-check link that is not a URL — so a bad edit fails in
Actions rather than shipping a broken page.

## What gets built

`scripts/build.mjs` reads the two CSVs and writes:

- `data.js` — the topic data the page loads
- `handover-teaching-rota.md` — the full written rota, regenerated from the same source so
  the document and the app can never drift apart

Source lives in `src/`: [`index.html`](src/index.html), [`styles.css`](src/styles.css),
[`app.js`](src/app.js), plus the intro and closing sections of the rota document
(`rota-header.md`, `rota-footer.md`).

```bash
npm run build      # regenerate the site files in the repo root
npm run serve      # build into dist/ and preview on http://localhost:4173
```

No dependencies and no install step — it is plain Node.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: it builds `dist/` from the
CSVs and publishes it to GitHub Pages.

This needs **Settings → Pages → Source: GitHub Actions**. The built files are also committed
at the repo root, so the site keeps serving correctly under the older branch-based Pages
setting in the meantime. Once the source is switched to Actions, the root copies of
`index.html`, `styles.css`, `app.js` and `data.js` are redundant and can be deleted — the
workflow builds them fresh from `src/` and `data/` on every push.

If you edit anything in `src/` or `data/`, run `npm run build` before committing so those
root copies stay current.
