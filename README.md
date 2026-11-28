# Desert Web

[![CI](https://github.com/Almintas/desert-web/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Almintas/desert-web/actions/workflows/ci.yml)

Parduotuvė makaronams ir kitiems desertams. Užsakyti galima **tik per atidarytą pardavimo langą**, kurį atidaro adminas. Didesniems kiekiams yra **specialūs užsakymai** (užklausa, kurią adminas patvirtina).

## Struktūra

```
apps/
  web/      Next.js: viešas puslapis pirkėjams        → Vercel
  admin/    Next.js: admin panelė                     → Vercel (atskiras projektas)
  api/      NestJS + MongoDB: backendas               → Railway
packages/
  shared/   bendri TS tipai, Zod schemos, pagalbinės funkcijos
  eslint-config/  bendra ESLint konfigūracija (base, nest, next)
e2e/        Playwright e2e testai
```

Monorepo valdomas su **pnpm workspaces** ir **Turborepo**. `shared` sukompiliuojamas prieš kitas aplikacijas automatiškai.

## Reikalavimai

- Node.js 24 (`.nvmrc`)
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

# (nebūtina) pavyzdiniai duomenys: 7 produktai, 1 atidarytas ir 1 būsimas langas
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api seed

# viskas kartu
pnpm dev
```

### Pirmas adminas

Viešos registracijos nėra. Pirmą adminą sukuria `admin:create` (slaptažodis bent 12 simbolių, įvedamas nerodant). Vėliau savininkas (`owner`) naujus adminus gali kurti admin pradžios puslapyje, skiltyje „Administratoriai“:

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api admin:create --email tu@example.com --role owner

# neinteraktyviai (pvz., Railway shell)
ADMIN_PASSWORD='...' pnpm --filter @desert-web/api admin:create --email tu@example.com --role owner

# pamirštas slaptažodis: pakeičia hash'ą ir ištrina visas to admino sesijas
pnpm --filter @desert-web/api admin:create --email tu@example.com --reset-password
```

### Papildomi desertai į esamą DB

`products:add` prideda 5 desertus iš `apps/api/src/scripts/extra-products.ts`. Nieko netrina; jau esami (pagal slug) praleidžiami, todėl galima ir produkcijoje:

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api products:add
```

| Aplikacija | Adresas                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| web        | http://localhost:3000                                                   |
| admin      | http://localhost:3001                                                   |
| api        | http://localhost:4000 (`/health`, `/products`, `/sale-windows/current`) |

Po pirmo `pnpm install` **užcommitink `pnpm-lock.yaml`**: Railway ir Vercel jo reikia.

Naudingos komandos: `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:api`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (API Jest ir web Vitest), `pnpm e2e` (žr. [E2E testai](#e2e-testai)), `pnpm format`.

## E2E testai

`pnpm e2e` paleidžia visą sistemą **produkcijos režimu** ir Playwright testus (`e2e/`). Į `pnpm test` neįeina. Veikia Linux, macOS ir Windows (tik Node skriptai, be bash).

```bash
# vieną kartą: Playwright naršyklė (Chromium)
pnpm --filter @desert-web/e2e exec playwright install chromium

pnpm e2e                        # viskas
pnpm e2e -- --grep "dvigubas"   # tik dalis testų (argumentai perduodami Playwright)
```

Ką daro `e2e/scripts/run.mjs`:

1. Sukompiliuoja api, web ir admin (`turbo build`).
2. Paleidžia laikiną MongoDB replica set (`mongodb-memory-server`, kaip API Jest testai; pirmą kartą atsisiunčia mongod).
3. Sukuria indeksus (`db:indexes`) ir adminą (`admin:create`).
4. Paleidžia API, web ir admin (`NODE_ENV=production`) laisvuose portuose.
5. Testai: prisijungimas, produktas su nuotraukomis, specialūs užsakymai (įjungimas nustatymuose, užklausa, patvirtinimas, įvykdymas), lango skelbimas (atsiėmimo laukų lange nėra), atsiėmimas nustatymuose, krepšelis po perkrovimo, užsakymas ir patvirtinimo puslapis, užsakymo būsenos admin panelėje (įvykdžius pažymima „Apmokėtas“), kiekių lenktynės, dvigubas paspaudimas, lango uždarymas, užsakymo atšaukimas (kiekiai grąžinami), lango su užsakymu atšaukimas, horizontalus slinkimas 390 px pločiu visuose puslapiuose.
6. API perleidžiamas su Turnstile „visada atmeta“ secret ir paleidžiamas `turnstile-fail` testas (pranešimas pirkėjui).
7. Viską sustabdo, net jei testai nepavyko ar paspaudėte Ctrl+C. Serverių logai: `e2e/.logs/`.

Trukmė: apie 30–40 s su buildu (kai turbo talpykloje jo nėra) ir apie 25 s su `E2E_SKIP_BUILD=1` (Linux konteineryje; lėtesniame kompiuteryje ar Windows gali užtrukti iki kelių minučių). Pirmas paleidimas ilgesnis: atsisiunčiamas mongod. Kiekvienas paleidimas pradeda nuo tuščios DB.

- Cloudinary įkėlimai ir nuotraukos perimami naršyklėje (atsakymas pasirašomas e2e Cloudinary paslaptimi, API jį tikrina kaip produkcijoje).
- Turnstile: naudojami [Cloudflare testiniai raktai](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, nesėkmei `2x0000000000000000000000000000000AA`). Jei `challenges.cloudflare.com` nepasiekiamas (uždara CI aplinka), naudojamas vietinis pakaitalas, kuris elgiasi kaip šie raktai. Priverstinai: `E2E_TURNSTILE=real` arba `E2E_TURNSTILE=fake`.
- `E2E_SKIP_BUILD=1`: nekompiliuoti (naudoti esamus `dist/` ir `.next/`). `E2E_HEADED=1`: matoma naršyklė.

## CI

GitHub Actions (`.github/workflows/ci.yml`) paleidžiamas kiekvienam push į `dev` ir `main` bei kiekvienam PR į juos. Naujas push į tą pačią šaką atšaukia dar vykstantį paleidimą. Vienas job'as, žingsniai iš eilės:

1. `pnpm format:check`: Prettier.
2. `pnpm lint`: ESLint 9 (flat config) visuose workspace'uose. Bendra konfigūracija `packages/eslint-config`: `base` (typescript-eslint recommended, eslint-config-prettier), `nest` (api), `next` (web, admin: eslint-config-next su react-hooks, jsx-a11y). Įspėjimai irgi laikomi klaida (`--max-warnings=0`).
3. `pnpm typecheck`.
4. `pnpm test`: API Jest (su `mongodb-memory-server`, mongod talpinamas `~/.cache/mongodb-binaries`) ir web Vitest.
5. `pnpm build`: visos aplikacijos, be jokių paslapčių (web build metu API nepasiekiamas, todėl naudojama numatytoji parduotuvės informacija).

E2E (`pnpm e2e`) į CI kol kas neįeina. Lint į Vercel ir Railway buildus neįeina (jie leidžia tik `turbo run build`).

Tas pačias patikras vietoje:

```bash
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Vienam workspace: `pnpm turbo run lint --filter=@desert-web/web`. Lint klaidas, kurias galima pataisyti automatiškai: `pnpm --filter @desert-web/web exec eslint . --fix`.

## Diegimas

### API → Railway

1. New Project → Deploy from GitHub → `desert-web`.
2. Service Settings:
   - **Root Directory:** palik tuščią (repo šaknis, kad veiktų workspace).
   - **Build Command:** `pnpm turbo run build --filter=@desert-web/api`
   - **Start Command:** `pnpm --filter @desert-web/api start`
   - **Healthcheck Path:** `/health`
   - **Watch Paths:** `apps/api/**`, `packages/shared/**` (kad nebūtų perdiegiama keičiant tik frontendą)
3. Variables: `NODE_ENV=production`, `MONGODB_URI`, `CORS_ORIGIN` (web ir admin adresai per kablelį), laiškams `RESEND_API_KEY`, `ORDER_NOTIFY_EMAIL`, `ADMIN_URL` ir kt. (žr. [Užsakymų laiškai](#užsakymų-laiškai-resend)), `INTERNAL_API_SECRET` (žr. [Admin prisijungimas](#admin-prisijungimas)), `TURNSTILE_SECRET_KEY` (žr. [Apsauga nuo robotų](#užsakymų-apsauga-nuo-robotų)), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (žr. [Produktų nuotraukos](#produktų-nuotraukos-cloudinary)). `PORT` Railway nustato pats. Neprivalomi: `ADMIN_SESSION_TTL_DAYS`, `ADMIN_LOGIN_RATE_LIMIT`, `ADMIN_LOGIN_RATE_WINDOW_SECONDS`, `CLOUDINARY_FOLDER`, `ORDER_RATE_*`, `ORDER_ACCESS_RATE_*`, `TRUST_X_REAL_IP`.
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

##### Nenaudojamų nuotraukų valymas (`images:cleanup`)

Jei įkėlimas nutrūksta arba forma uždaroma neprisegus nuotraukos, failas lieka Cloudinary. `images:cleanup` suranda failus produktų kataloge (`CLOUDINARY_FOLDER`, tik jo prefiksas; katalogas turi būti po `desert-web/`), kurių nenaudoja joks produktas (**ir archyvuotų produktų nuotraukos laikomos naudojamomis**) ir kurie senesni nei 24 h (`--older-than-hours=N`, mažiausiai 1: apsauga dabar vykstantiems įkėlimams). Numatyta **dry run**: išvardija failus (publicId, sukūrimo laikas, dydis) ir sumas, nieko netrina. Trina tik su `--apply`, partijomis po 100; nepavykusias partijas užrašo ir tęsia, o pabaigoje grąžina exit code 1. Automatiškai nepaleidžiamas.

Vietoje (`.env` su tais pačiais `MONGODB_URI` ir `CLOUDINARY_*`, kaip valoma aplinka):

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api images:cleanup            # dry run: peržiūrėk sąrašą
pnpm --filter @desert-web/api images:cleanup --apply    # tada ištrink
pnpm --filter @desert-web/api images:cleanup --older-than-hours=72 --apply
```

Railway (vienkartinė komanda veikiančiame api service konteineryje: `dist` jau sukompiliuotas, kintamieji nustatyti), iš repo katalogo, susietą su projektu (`railway link`, pasirink api service):

```bash
railway ssh -- pnpm --filter @desert-web/api images:cleanup            # dry run
railway ssh -- pnpm --filter @desert-web/api images:cleanup --apply    # peržiūrėjus sąrašą
```

Saugikliai: skriptas nutraukiamas, jei katalogas tuščias ar ne po `desert-web/`, arba jei DB grąžino nulį naudojamų nuotraukų, nors produktų su nuotraukomis yra (sugedusi užklausa ar ryšys). Prieš kiekvieną partiją DB tikrinama dar kartą, kad nebūtų ištrinta ką tik prisegta nuotrauka. Cloudinary Admin API riba (nemokamame plane ~500 kvietimų per valandą) šiam mastui netrukdo: sąrašas imamas po 500 failų vienu kvietimu, trinama po 100.

#### Užsakymų laiškai (Resend)

API siunčia laiškus per [Resend](https://resend.com) (`apps/api/src/notifications/`):

- **Pardavėjui** (`ORDER_NOTIFY_EMAIL`): naujas užsakymas su pirkėjo vardu, telefonu, el. paštu, pastabomis ir nuoroda į admin panelę. Atsakius į laišką, atsakymas nueina pirkėjui.
- **Pirkėjui** (kol kas išjungta): užsakymas gautas; būsena pasikeitė į patvirtintas, paruoštas atsiimti, atšauktas (su priežastimi). Atsakymai nueina pardavėjui (el. paštas iš admin „Nustatymai“ → „Parduotuvės informacija“).

Laiškai siunčiami tik po sėkmingos DB transakcijos ir fone: nepavykęs laiškas užsakymo ar būsenos pakeitimo neatšaukia, tik užrašomas į API logą (`Email failed (order …, template …)`). Pakartotas tas pats užsakymas (`clientRequestId`) ir atmestas būsenos pakeitimas (pvz., antras atšaukimas) laiškų nesiunčia.

Domeno dar nėra, todėl siunčiama iš `onboarding@resend.dev`: Resend tokius laiškus pristato **tik Resend paskyros savininko adresu** (kitiems grąžina 403). Todėl `ORDER_NOTIFY_EMAIL` turi būti Resend paskyros el. paštas, o laiškai pirkėjams išjungti.

Railway → api service → Variables:

| Kintamasis                | Reikšmė                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`          | Resend → API Keys (užtenka „Sending access“). Be jo laiškai nesiunčiami (paleidžiant įspėjimas loguose) |
| `ORDER_NOTIFY_EMAIL`      | pardavėjo adresas; kol siuntėjas `resend.dev`, tik Resend paskyros savininko el. paštas                 |
| `ADMIN_URL`               | admin adresas, pvz. `https://admin.desertai.lt` (privalomas, kai nustatyti du ankstesni)                |
| `RESEND_FROM_EMAIL`       | neprivaloma; numatyta `Vincento Macarons <onboarding@resend.dev>`                                       |
| `CUSTOMER_EMAILS_ENABLED` | neprivaloma; numatyta `false`                                                                           |
| `WEB_URL`                 | parduotuvės adresas, pvz. `https://desertai.lt` (privalomas, kai `CUSTOMER_EMAILS_ENABLED=true`)        |

`FRONTEND_URL`, `JWT_SECRET` ir `JWT_EXPIRES_IN` API nebenaudoja: jei liko Railway, galima ištrinti.

Laiškų peržiūra naršyklėje (pavyzdiniai duomenys, be DB ir Resend):

```bash
pnpm --filter @desert-web/api email:preview   # → apps/api/tmp/email-preview/index.html
```

Vystant be `RESEND_API_KEY` kiekvienas laiškas tik išvedamas į API logą (kam, tema, tekstas). Kad matytumėte ir pirkėjo laiškus, `.env` nustatykite `CUSTOMER_EMAILS_ENABLED=true`.

##### Kaip įjungti laiškus pirkėjams

1. Resend → Domains → Add domain (pvz., `desertai.lt`), įrašykite DNS įrašus ir palaukite, kol domenas bus „Verified“.
2. Railway: `RESEND_FROM_EMAIL` nustatykite adresu tame domene, pvz. `Vincento Macarons <uzsakymai@desertai.lt>`, ir `WEB_URL` (pvz., `https://desertai.lt`).
3. Railway: `CUSTOMER_EMAILS_ENABLED=true`. Su `resend.dev` siuntėju API produkcijoje nepasileis (aiški klaida deploy loguose).
4. Tada galima pakeisti patvirtinimo puslapio ir užsakymo formos tekstą „išsisaugokite nuorodą“ (dabar pirkėjas laiško negauna).

#### Užsakymų apsauga nuo robotų

API Railway pasiekiamas viešai, todėl visos apsaugos taikomos API (ne tik web):

- **Tie patys principai specialiems užsakymams** (`POST /special-orders`): paslaptis, ribojimas (tos pačios ribos, atskiri skaitikliai), Turnstile ir `clientRequestId` idempotencija; `GET /special-orders/access/:token` ribojamas kaip `/orders/access`. `GET /special-orders/config` viešas (kaip `/sale-windows/current`).
- **Tik mūsų web serveris.** Produkcijoje `POST /orders` priimamas tik su teisinga `X-Internal-Secret` (`INTERNAL_API_SECRET`), kitaip 403 `FORBIDDEN_CLIENT`. Todėl `INTERNAL_API_SECRET` privalomas ir web projekte (Vercel): be jo svetainė veikia, bet užsakymai nepateikiami (pirkėjui „Užsakymo pateikti nepavyko. Bandykite vėliau.“, Vercel loguose aiški klaida). Kitaip API visus pirkėjus ribotų kaip vieną Vercel IP.
- **Ribojimas pagal pirkėjo IP** (atmintyje, viena API instancija): `POST /orders` 5 per 10 min. ir 20 per parą, `GET /orders/access/:token` 60 per min., admin prisijungimas `ADMIN_LOGIN_RATE_LIMIT` per `ADMIN_LOGIN_RATE_WINDOW_SECONDS`. Skaičiuojamas kiekvienas bandymas; viršijus 429 `TOO_MANY_REQUESTS` su `Retry-After`. Visos ribos `apps/api/src/rate-limit/rate-limits.ts`.
- **Pirkėjo IP.** Web ir admin serveriai perduoda naršyklės IP (`X-Client-IP`, priimamas tik su paslaptimi). Tiesioginėms užklausoms Railway produkcijoje naudojamas `X-Real-IP`, kurį Railway edge nustato pats ([Railway: Public Networking specs](https://docs.railway.com/networking/public-networking/specs-and-limits)); `X-Forwarded-For` paskutinis šuolis gali būti vidinis Railway proxy. Kitur (vystant) `req.ip`.
- **Cloudflare Turnstile.** Užsakymo formoje valdiklis (`interaction-only`, lietuviškai); API tikrina tokeną per `siteverify` (5 s limitas) prieš rezervuodamas kiekius. Netinkamas: 403 `TURNSTILE_FAILED`; Cloudflare nepasiekiamas: 503 `TURNSTILE_UNAVAILABLE` (užsakymas nepriimamas, klaida loguose). Jau sukurto užsakymo pakartojimui (tas pats `clientRequestId`) tokeno nereikia.

Turnstile nustatymas: Cloudflare → Turnstile → Add widget, **Widget Mode: Managed**, hostnames: parduotuvės domenas. Site key → Vercel web `NEXT_TURNSTILE_SITE_KEY` (skaitomas serveryje, perdiegti nebūtina), Secret key → Railway `TURNSTILE_SECRET_KEY`. Produkcijoje (`NODE_ENV=production`, taip pat Vercel Preview) privalomi abu: API be `TURNSTILE_SECRET_KEY` nepasileidžia (klaida Railway deploy loguose), o web be `NEXT_TURNSTILE_SITE_KEY` veikia, bet užsakymų nepateikia (klaida Vercel loguose). Vystant ir testuose be jų naudojami Cloudflare testiniai „visada praeina“ raktai. Nustatyk abu kartu.

#### DB indeksai

Produkcijoje (`NODE_ENV=production`) Mongoose indeksų automatiškai nekuria, o unikalūs indeksai (`orders.orderNumber`, `orders.accessToken`, `specialOrders.requestNumber`, `specialOrders.accessToken`, `products.slug` ir kt.) yra būtini. Juos sukuria `db:indexes`:

```bash
pnpm turbo run build --filter=@desert-web/api
pnpm --filter @desert-web/api db:indexes
```

Paleisk **prieš pirmą produkcinį paleidimą ir po kiekvieno schemų pakeitimo**. Paprasčiausia nustatyti jį kaip Railway Pre-deploy Command (žr. aukščiau). Skriptas naudoja `createIndexes`: trūkstamus indeksus sukuria, esamų netrina.

MongoDB Atlas → Network Access: leisk prisijungti iš Railway (paprasčiausia `0.0.0.0/0` su stipriu slaptažodžiu).

### Web ir Admin → Vercel

Du atskiri Vercel projektai iš to paties repo:

| Nustatymas     | web                                                                                                                                                   | admin                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root Directory | `apps/web`                                                                                                                                            | `apps/admin`                                                                             |
| Framework      | Next.js                                                                                                                                               | Next.js                                                                                  |
| Build Command  | `cd ../.. && pnpm turbo run build --filter=@desert-web/web`                                                                                           | `cd ../.. && pnpm turbo run build --filter=@desert-web/admin`                            |
| Env            | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (ta pati kaip Railway), `NEXT_TURNSTILE_SITE_KEY`; visi trys privalomi, neprivaloma `SITE_URL` | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (privaloma, ta pati kaip Railway) |

Web naršyklė į API nesikreipia: puslapius ir užsakymo pateikimą (Server Action) atlieka web Next.js serveris. `NEXT_PUBLIC_API_URL` nebenaudojamas (jei liko Vercel, ištrink). Produkcijoje web be `API_URL` **nepasileidžia** (aiški klaida Vercel runtime loguose, `src/instrumentation.ts`). Be `INTERNAL_API_SECRET` ar `NEXT_TURNSTILE_SITE_KEY` svetainė veikia, bet užsakymo forma grąžina „Užsakymo pateikti nepavyko. Bandykite vėliau.“, o Vercel loguose kiekvieną kartą klaida su trūkstamų kintamųjų sąrašu (kaip admin prisijungimas be paslapties). Su `INTERNAL_API_SECRET` web serveris API perduoda tikrą pirkėjo IP (`X-Client-IP`), o API produkcijoje užsakymus priima tik su ja. `SITE_URL` (pvz., `https://desertai.lt`) naudojamas absoliutiems OG adresams.

### Parduotuvės informacija

Pardavėjo duomenys (vardas ar įmonės pavadinimas, IV pažymos Nr. ar įmonės kodas, adresas, el. paštas, telefonas), socialinių tinklų nuorodos (Facebook, Instagram, TikTok) ir pagrindinio puslapio tekstai (šūkis ir antra eilutė) keičiami **admin „Nustatymai“ → „Parduotuvės informacija“** (keisti gali tik `owner`, `staff` mato), be deploy. Saugoma nustatymų dokumente (`settings.shop`).

- Tuščias laukas reiškia „nerodoma“ (vietoje tuščio pardavėjo vardo rodomas parduotuvės pavadinimas). Kol informacija dar neišsaugota, galioja numatytosios reikšmės (`DEFAULT_SHOP_INFO`, `packages/shared/src/shop.ts`): jos keičiamos nustatymuose, ne kode.
- Validacija: el. pašto formatas, telefonas (skaitmenys, tarpai, „+“), socialinės nuorodos tik `https://` atitinkamame domene (`facebook.com`, `instagram.com`, `tiktok.com`, su `www` ar be).
- Web skaito `GET /shop-info` (viešas, tik vieši laukai) su `revalidate: 60`, todėl pakeitimai svetainėje matomi maždaug per minutę. API nepasiekiamas (taip pat build metu): numatytosios reikšmės, poraštė ir pagrindinis puslapis nelūžta.
- Laiškai pirkėjams (Reply-To ir poraštė) pardavėjo duomenis ima iš nustatymų; kol el. paštas tuščias, Reply-To nenustatomas.
- Neužpildyti pardavėjo laukai rodomi įspėjimu admin apžvalgoje (build'o ir langų skelbimo jie nestabdo).

### Atsiėmimas

Atsiėmimas vyksta vienoje vietoje ir tuo pačiu laiku visiems pardavimo langams, todėl lange atsiėmimo laukų nėra. Vieta ir laikas (laisvas tekstas) keičiami **admin „Nustatymai“ → „Atsiėmimas“** (tik `owner`) ir saugomi `settings.pickup = { location, hours }`.

- Kol neišsaugota: vieta yra pardavėjo adresas (`settings.shop.seller.address`, tuščias: „Kovo 11-osios g. 33, Kaunas“), laikas „17:00–20:00“ (`defaultPickupInfo`, `packages/shared/src/shop.ts`).
- Viešai: `GET /shop-info` laukas `pickup`. Pirkėjams (pagrindinis puslapis, `/uzsakymas`, užsakymo puslapis, laiškai) rodoma „Atsiėmimas: {vieta}, {laikas}“.
- Seni langų laukai `fulfillment.pickupLocation`, `pickupFrom`, `pickupTo` DB gali likti, bet nebeskaitomi ir nerašomi.
- Admin apžvalgoje mygtukas „Atsiėmimo sąrašas“ rodomas kiekvienam paskelbtam jau atsidariusiam langui, kuriame yra neatsiimtų ir neatšauktų užsakymų.

## Pagrindinės taisyklės

- Pinigai visur **centais** (integer), valiuta EUR.
- Laikai DB saugomi **UTC**, rodomi `Europe/Vilnius` laiku (`formatShopDateTime` iš `shared`).
- Ar langas atidarytas, **tikrina backendas** kiekvieno užsakymo metu. Kiekiai mažinami atomiškai.
- Užsakymuose saugomos produkto pavadinimo ir kainos kopijos.
- Validacija: Zod schemos iš `@desert-web/shared` (API naudoja `ZodValidationPipe`, frontendai tas pačias schemas formoms).

Duomenų modelis ir sprendimai aprašyti Claude projekte „Desert Web“ (`duomenu-modelis.md`, `sprendimai-stekas.md`).

## Specialūs užsakymai

Užklausa dideliam kiekiui bet kuriuo metu (be pardavimo lango), kai ji įjungta nustatymuose. Adminas patvirtina su galutine kaina ir atsiėmimu arba atmeta. Pardavimo langų kiekių neliečia. Tik atsiėmimas, apmokama atsiimant.

- **Nustatymai** (admin „Nustatymai“, `GET/PUT /admin/settings`, keisti gali tik `owner`): `specialOrders.enabled` (numatyta išjungta), `leadTimeDays` (0–60, numatyta 7), `maxDaysAhead` (1–365, numatyta 90). Vienas dokumentas `settings` `_id: 'global'`, sukuriamas tingiai.
- **Produktai:** produkto formoje „Specialūs užsakymai“ ir mažiausias kiekis. Užsakyti galima tik aktyvius produktus; minimumas tikrinamas kiekvienai eilutei atskirai. Kaina užklausoje: bazinės varianto kainos kopija (`estimatedUnitPriceCents`).
- **Pageidaujama data** yra kalendorinė diena `YYYY-MM-DD` (Vilniaus kalendorius), saugoma kaip eilutė, todėl nepasislenka dėl laiko zonos ar vasaros laiko. Leidžiama `šiandien + leadTimeDays` … `šiandien + maxDaysAhead` (imtinai, „šiandien“ Vilniaus laiku).
- **Būsenos:** `requested` → `confirmed` → `completed`; `requested` → `rejected`; `requested | confirmed` → `cancelled`. Galutinės: `completed`, `rejected`, `cancelled`. Netinkamas perėjimas: 409 `INVALID_STATUS_TRANSITION`. Visi pakeitimai vienu sąlyginiu atnaujinimu (du adminai vienu metu: laimi vienas). `completed` pažymi `payment.status = 'paid'`.
- **API:** viešai `GET /special-orders/config`, `POST /special-orders`, `GET /special-orders/access/:token`; admin `GET /admin/special-orders` (filtrai `status`, `desiredFrom`, `desiredTo`, `q`), `GET /admin/special-orders/stats`, `GET /admin/special-orders/:id`, `POST /admin/special-orders/:id/{confirm,reject,cancel,complete}`. Klaidų kodai: `SPECIAL_ORDER_ERROR_CODES` (`packages/shared`).
- Pirkėjo forma ir laiškai: 2 dalis (laiškų vieta pažymėta `TODO(special-orders, 2 dalis)` API servisuose).

## Kas toliau

- [x] Admin prisijungimas (API + admin app)
- [x] Admin produktų valdymas (`/admin/products`; archyvuojama `isActive: false`, trynimo nėra)
- [x] Produktų nuotraukos (Cloudinary: tiesioginis pasirašytas įkėlimas, iki 8, rikiavimas, šalinimas)
- [x] Admin pardavimo langų valdymas (`/admin/sale-windows`: kūrimas, kiekiai, skelbimas, atidaryti / uždaryti dabar, atšaukimas)
- [x] Užsakymų valdymas (`/admin/orders`: sąrašas su filtrais, būsenos pirmyn, atšaukimas su kiekių grąžinimu, masinis „Patvirtinti“ / „Paruošta“ per `POST /admin/orders/bulk-status`)
- [x] Admin apžvalga (dabartinis langas, likučiai, skaitikliai) ir atsiėmimo sąrašas (`/sale-windows/[id]/pickup`, `GET /admin/orders/pickup-list`, spausdinimas A4)
- [x] Parduotuvės informacija ir atsiėmimas admin nustatymuose (`GET /shop-info`)
- [x] Laiškai per Resend: pardavėjui apie naują užsakymą; pirkėjui (gautas, būsenos) paruošta, bet išjungta iki domeno patvirtinimo
- [x] Užsakymo kūrimas su atomine kiekio rezervacija (idempotentiškas pagal `clientRequestId`; limitų pirkėjui nėra, riboja tik lango kiekis)
- [x] Pirkėjų parduotuvė: krepšelis, užsakymas (tik atsiėmimas, apmokama atsiimant), užsakymo puslapis, `/privatumas`
- [x] Užsakymų apsauga: tik per web serverį, ribojimas pagal pirkėjo IP, Cloudflare Turnstile
- [x] E2E testai (`pnpm e2e`)
- [ ] Patvirtinti domeną Resend ir įjungti laiškus pirkėjams
- [x] Specialūs užsakymai: API ir admin (nustatymai, užklausos, patvirtinimas su kaina ir atsiėmimu, atmetimas, atšaukimas, įvykdymas)
- [ ] Specialūs užsakymai: pirkėjo forma `apps/web` ir laiškai
- [ ] Mokėjimai (tiekėjas dar nepasirinktas)
- [x] ESLint, CI
