# Humlens Inventory

Stock across warehouses: items, stock levels, transfers, cycle counts, receiving, and AI agents that work within limits you set.

This app runs on its own. It can also connect to Humlens Commerce and Procurement: see
[CONTRACT.md](CONTRACT.md) for how the apps talk to each other.

## Develop

```bash
cp .env.example .env          # fill in NEXTAUTH_SECRET at least
docker compose up -d          # Postgres on localhost:5434
npm install
npx prisma migrate deploy
npm run seed                  # optional sample data
npm run dev                   # http://localhost:4200
```

`npm run check-types`, `npm run check-lint` and `npm test` run the checks.

## Self-host

```bash
cp .env.selfhost.example .env # set NEXTAUTH_SECRET, the URLs and POSTGRES_PASSWORD
docker compose -f docker-compose.selfhost.yml up -d --build
```

This builds the image, applies database migrations in a one-off `migrate`
container, then starts the app on port 4200, with Postgres alongside. Put a
reverse proxy in front of it for TLS. `GET /api/health` returns 200 when the app
and its database are up.

Background jobs (delivering messages to connected apps, releasing expired stock holds, raising low-stock requests in Procurement) run
inside the server process. On serverless hosting set `DISABLE_SCHEDULER=1` and
trigger them from a cron instead.

`NEXT_PUBLIC_*` values are baked in when the image is built, so rebuild with
`--build` after changing them.
