# Desert Web

Parduotuvė makaronams ir kitiems desertams. Užsakyti galima **tik per atidarytą pardavimo langą**, kurį atidaro adminas. Didesniems kiekiams yra **specialūs užsakymai** (užklausa, kurią adminas patvirtina).

## Struktūra

```
apps/
  web/      Next.js: viešas puslapis pirkėjams        → Vercel
  admin/    Next.js: admin panelė                     → Vercel (atskiras projektas)
  api/      NestJS + MongoDB: backendas               → Railway
packages/
  shared/   bendri TS tipai, Zod schemos, pagalbinės funkcijos
```

Monorepo valdomas su **pnpm workspaces** ir **Turborepo**. `shared` sukompiliuojamas prieš kitas aplikacijas automatiškai.

## Reikalavimai

- Node.js 22+ (`.nvmrc`)
- pnpm 10: `corepack enable` (versija paimama iš `package.json` → `packageManager`)
- MongoDB Atlas klasteris (nemokamo plano užtenka)

## Pirmas paleidimas

```bash
corepack enable
pnpm install

# aplinkos kintamieji
cp apps/api/.env.example apps/api/.env          # įrašyk MONGODB_URI
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local

# (nebūtina) pavyzdiniai duomenys: 2 produktai, 1 atidarytas ir 1 būsimas langas
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api seed

# viskas kartu
pnpm dev
```

| Aplikacija | Adresas                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| web        | http://localhost:3000                                                   |
| admin      | http://localhost:3001                                                   |
| api        | http://localhost:4000 (`/health`, `/products`, `/sale-windows/current`) |

Po pirmo `pnpm install` **užcommitink `pnpm-lock.yaml`**: Railway ir Vercel jo reikia.

Naudingos komandos: `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:api`, `pnpm build`, `pnpm typecheck`, `pnpm format`.

## Diegimas

### API → Railway

1. New Project → Deploy from GitHub → `desert-web`.
2. Service Settings:
   - **Root Directory:** palik tuščią (repo šaknis, kad veiktų workspace).
   - **Build Command:** `pnpm turbo run build --filter=@desert-web/api`
   - **Start Command:** `pnpm --filter @desert-web/api start`
   - **Healthcheck Path:** `/health`
   - **Watch Paths:** `apps/api/**`, `packages/shared/**` (kad nebūtų perdiegiama keičiant tik frontendą)
3. Variables: `NODE_ENV=production`, `MONGODB_URI`, `CORS_ORIGINS` (web ir admin adresai per kablelį). `PORT` Railway nustato pats.
   - **Pre-deploy Command:** `pnpm --filter @desert-web/api db:indexes`
4. Settings → Networking → Generate Domain (arba prijunk `api.tavodomenas.lt`).

#### DB indeksai

Produkcijoje (`NODE_ENV=production`) Mongoose indeksų automatiškai nekuria, o unikalūs indeksai (`orders.orderNumber`, `orders.accessToken`, `products.slug` ir kt.) yra būtini. Juos sukuria `db:indexes`:

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api db:indexes
```

Paleisk **prieš pirmą produkcinį paleidimą ir po kiekvieno schemų pakeitimo**. Paprasčiausia nustatyti jį kaip Railway Pre-deploy Command (žr. aukščiau). Skriptas naudoja `createIndexes`: trūkstamus indeksus sukuria, esamų netrina.

MongoDB Atlas → Network Access: leisk prisijungti iš Railway (paprasčiausia `0.0.0.0/0` su stipriu slaptažodžiu).

### Web ir Admin → Vercel

Du atskiri Vercel projektai iš to paties repo:

| Nustatymas     | web                                                         | admin                                                         |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Root Directory | `apps/web`                                                  | `apps/admin`                                                  |
| Framework      | Next.js                                                     | Next.js                                                       |
| Build Command  | `cd ../.. && pnpm turbo run build --filter=@desert-web/web` | `cd ../.. && pnpm turbo run build --filter=@desert-web/admin` |
| Env            | `NEXT_PUBLIC_API_URL=https://<api domenas>`                 | `NEXT_PUBLIC_API_URL=https://<api domenas>`                   |

## Pagrindinės taisyklės

- Pinigai visur **centais** (integer), valiuta EUR.
- Laikai DB saugomi **UTC**, rodomi `Europe/Vilnius` laiku (`formatShopDateTime` iš `shared`).
- Ar langas atidarytas, **tikrina backendas** kiekvieno užsakymo metu. Kiekiai mažinami atomiškai.
- Užsakymuose saugomos produkto pavadinimo ir kainos kopijos.
- Validacija: Zod schemos iš `@desert-web/shared` (API naudoja `ZodValidationPipe`, frontendai tas pačias schemas formoms).

Duomenų modelis ir sprendimai aprašyti Claude projekte „Desert Web“ (`duomenu-modelis.md`, `sprendimai-stekas.md`).

## Kas toliau

- [ ] Admin prisijungimas (API + admin app)
- [ ] Admin CRUD: produktai (su Cloudinary įkėlimu) ir pardavimo langai
- [ ] Užsakymo kūrimas su atomine kiekio rezervacija ir limitu vienam pirkėjui
- [ ] Laiškai per Resend (užsakymo patvirtinimas)
- [ ] Specialūs užsakymai
- [ ] Mokėjimai (tiekėjas dar nepasirinktas)
- [ ] ESLint, testai, CI
