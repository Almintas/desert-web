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

### Pirmas adminas

Viešos registracijos nėra. Adminą sukuria `admin:create` (slaptažodis bent 12 simbolių, įvedamas nerodant):

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api admin:create --email tu@example.com --role owner

# neinteraktyviai (pvz., Railway shell)
ADMIN_PASSWORD='...' pnpm --filter @desert-web/api admin:create --email tu@example.com --role owner

# pamirštas slaptažodis: pakeičia hash'ą ir ištrina visas to admino sesijas
pnpm --filter @desert-web/api admin:create --email tu@example.com --reset-password
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
3. Variables: `NODE_ENV=production`, `MONGODB_URI`, `CORS_ORIGINS` (web ir admin adresai per kablelį), `INTERNAL_API_SECRET` (žr. [Admin prisijungimas](#admin-prisijungimas)), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (žr. [Produktų nuotraukos](#produktų-nuotraukos-cloudinary)). `PORT` Railway nustato pats. Neprivalomi: `ADMIN_SESSION_TTL_DAYS`, `ADMIN_LOGIN_RATE_LIMIT`, `ADMIN_LOGIN_RATE_WINDOW_SECONDS`, `CLOUDINARY_FOLDER`.
   - **Pre-deploy Command:** `pnpm --filter @desert-web/api db:indexes`
4. Settings → Networking → Generate Domain (arba prijunk `api.tavodomenas.lt`).

#### Admin prisijungimas

Naršyklė į API admin veiksmams tiesiogiai nesikreipia: admin Next.js serveris kviečia API ir laiko sesijos tokeną savo `httpOnly` cookie `dw_admin_session`. Todėl admin app naudoja tik serverio kintamąjį `API_URL` (ne `NEXT_PUBLIC_`).

Kadangi visi prisijungimai į API ateina iš admin serverio IP, **produkcijoje privaloma** nustatyti `INTERNAL_API_SECRET` (bent 32 simboliai, `openssl rand -base64 32`) su **ta pačia reikšme** abiejose vietose:

- Railway → api service → Variables
- Vercel → admin projektas → Settings → Environment Variables (Production)

Su ja admin app perduoda tikrą naršyklės IP, ir prisijungimų limitas (`ADMIN_LOGIN_RATE_LIMIT` per `ADMIN_LOGIN_RATE_WINDOW_SECONDS`) skaičiuojamas kiekvienam lankytojui atskirai. Be jos limitas būtų bendras visiems adminams, ir bet kas galėtų juos visus užblokuoti, todėl:

- API su `NODE_ENV=production` be `INTERNAL_API_SECRET` **nepasileidžia** (klaida Railway deploy loguose).
- Admin app produkcijoje be jos **atmeta prisijungimą** su aiškiu pranešimu (ir klaida Vercel runtime loguose). Tikrinama prisijungimo metu, ne builde, nes Vercel buildui runtime kintamųjų gali neduoti.
- Jei reikšmės skiriasi, API paslapties nepriima ir tyliai grįžta prie bendro limito, todėl keičiant ją atnaujink abiejose vietose.

#### Produktų nuotraukos (Cloudinary)

Failai į mūsų serverius nekeliami: admin naršyklė gauna iš API (per admin Next.js serverį) pasirašytus parametrus ir siunčia nuotrauką tiesiai į `api.cloudinary.com`, o tada Cloudinary atsakymą perduoda API, kuris patikrina Cloudinary parašą, katalogą ir URL ir tik tada prideda nuotrauką prie produkto. Pasirašyta: katalogas, leidžiami formatai (`jpg, jpeg, png, webp, heic, heif`) ir įkėlimo transformacija (ilgiausia kraštinė iki 2000 px). Daugiausia 8 nuotraukos produktui, pirmoji yra pagrindinė.

Railway → api service → Variables (reikšmės iš Cloudinary Console → Settings → API Keys):

| Kintamasis              | Reikšmė                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Cloud name (pvz., `dxxxxxxxx`)                                            |
| `CLOUDINARY_API_KEY`    | API Key                                                                   |
| `CLOUDINARY_API_SECRET` | API Secret                                                                |
| `CLOUDINARY_FOLDER`     | neprivaloma; numatyta `desert-web/production/products` (pagal `NODE_ENV`) |

- API su `NODE_ENV=production` be pirmųjų trijų **nepasileidžia** (klaida Railway deploy loguose). Vystant be jų API veikia, o nuotraukų maršrutai grąžina 503 `IMAGES_NOT_CONFIGURED`.
- Admin app (Vercel) Cloudinary kintamųjų **nereikia**: `cloudName` ir `apiKey` jis gauna iš API kartu su parašu, o paslaptis lieka tik Railway.
- Šalinant nuotrauką ji ištrinama ir iš Cloudinary (po DB pakeitimo; jei Cloudinary nepasiekiamas, klaida tik užrašoma į API logą).
- Naujas unikalus indeksas `products.images.publicId`: po šio pakeitimo paleisk `db:indexes` (Railway Pre-deploy Command tai padaro pats).
- Naujas dalinis unikalus indeksas `orders.clientRequestId` (užsakymų idempotencija): taip pat sukuria `db:indexes`.

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

| Nustatymas     | web                                                                                                   | admin                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root Directory | `apps/web`                                                                                            | `apps/admin`                                                                             |
| Framework      | Next.js                                                                                               | Next.js                                                                                  |
| Build Command  | `cd ../.. && pnpm turbo run build --filter=@desert-web/web`                                           | `cd ../.. && pnpm turbo run build --filter=@desert-web/admin`                            |
| Env            | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (ta pati kaip Railway), neprivaloma `SITE_URL` | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (privaloma, ta pati kaip Railway) |

Web naršyklė į API nesikreipia: puslapius ir užsakymo pateikimą (Server Action) atlieka web Next.js serveris, todėl `NEXT_PUBLIC_API_URL` nebereikia (jei liko, naudojamas tik kaip atsarginis `API_URL`). Su `INTERNAL_API_SECRET` web serveris perduoda API tikrą pirkėjo IP (`X-Client-IP`), kurio prireiks užsakymų ribojimui; be jos užsakymai priimami, bet Vercel loguose rašoma klaida. `SITE_URL` (pvz., `https://desertai.lt`) naudojamas absoliutiems OG adresams.

Pardavėjo vardas ir kontaktai (poraštė, `/privatumas`) yra `apps/web/src/lib/shop.ts` (`SELLER`, pažymėta TODO).

## Pagrindinės taisyklės

- Pinigai visur **centais** (integer), valiuta EUR.
- Laikai DB saugomi **UTC**, rodomi `Europe/Vilnius` laiku (`formatShopDateTime` iš `shared`).
- Ar langas atidarytas, **tikrina backendas** kiekvieno užsakymo metu. Kiekiai mažinami atomiškai.
- Užsakymuose saugomos produkto pavadinimo ir kainos kopijos.
- Validacija: Zod schemos iš `@desert-web/shared` (API naudoja `ZodValidationPipe`, frontendai tas pačias schemas formoms).

Duomenų modelis ir sprendimai aprašyti Claude projekte „Desert Web“ (`duomenu-modelis.md`, `sprendimai-stekas.md`).

## Kas toliau

- [x] Admin prisijungimas (API + admin app)
- [x] Admin produktų valdymas (`/admin/products`; archyvuojama `isActive: false`, trynimo nėra)
- [x] Produktų nuotraukos (Cloudinary: tiesioginis pasirašytas įkėlimas, iki 8, rikiavimas, šalinimas)
- [x] Admin pardavimo langų valdymas (`/admin/sale-windows`: kūrimas, kiekiai, skelbimas, atidaryti / uždaryti dabar, atšaukimas)
- [x] Užsakymų valdymas (`/admin/orders`: sąrašas su filtrais, būsenos pirmyn, atšaukimas su kiekių grąžinimu)
- [ ] Laiškai pirkėjui keičiantis užsakymo būsenai
- [x] Užsakymo kūrimas su atomine kiekio rezervacija ir limitu vienam pirkėjui (idempotentiškas pagal `clientRequestId`)
- [x] Pirkėjų parduotuvė: krepšelis, užsakymas (tik atsiėmimas, apmokama atsiimant), užsakymo puslapis, `/privatumas`
- [ ] Užsakymų ribojimas pagal pirkėjo IP (`req.clientIp` jau yra)
- [ ] Laiškai per Resend (užsakymo patvirtinimas)
- [ ] Specialūs užsakymai
- [ ] Mokėjimai (tiekėjas dar nepasirinktas)
- [ ] ESLint, testai, CI
