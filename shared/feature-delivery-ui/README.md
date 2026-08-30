# Feature Delivery UI (shared)

Open React + Vite front-end for every lab. No authentication. This is the UI served at `/` by `./run.sh serve` in each lab.

## Dev

```bash
# Terminal 1 — lab API
cd ../langgraph-python && ./run.sh serve

# Terminal 2 — Vite (proxies /health and /runs)
npm install
npm run dev
```

## Production build

```bash
npm install && npm run build
```

`./run.sh serve` in any lab serves `dist/` at `http://127.0.0.1:8000/`.

`./run.sh serve` / `ensure-ui` only runs `npm run build` when `dist/index.html` is **missing**. After UI source changes on the host, rebuild explicitly:

```bash
npm install && npm run build
```

## Docker

In Compose, the UI is baked into the lab image at build time (not live-mounted). **Do not** run `docker compose … up` and then `./run.sh serve` — they are different servers; the latter serves this host `dist/` (often stale). Pick one mode; details: [`../../docker/README.md`](../../docker/README.md#docker-vs-host-pick-one).

To force a Docker UI recompile:

```bash
# from repo root
docker compose --profile <lab> build --no-cache <lab>
docker compose --profile <lab> up --force-recreate
# open http://127.0.0.1:8000/ — no ./run.sh serve
```

Then hard-refresh the browser.
