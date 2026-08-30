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
