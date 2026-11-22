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

Naudingos komandos: `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:api`, `pnpm build`, `pnpm typecheck`, `pnpm test` (API Jest ir web Vitest), `pnpm e2e` (žr. [E2E testai](#e2e-testai)), `pnpm format`.

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
5. Testai: prisijungimas, produktas su nuotraukomis, lango skelbimas su atsiėmimo informacija ir be jos, krepšelis po perkrovimo, užsakymas ir patvirtinimo puslapis, užsakymo būsenos admin panelėje (įvykdžius pažymima „Apmokėtas“), kiekių lenktynės, dvigubas paspaudimas, lango uždarymas, užsakymo atšaukimas (kiekiai grąžinami), lango su užsakymu atšaukimas, horizontalus slinkimas 390 px pločiu visuose puslapiuose.
6. API perleidžiamas su Turnstile „visada atmeta“ secret ir paleidžiamas `turnstile-fail` testas (pranešimas pirkėjui).
7. Viską sustabdo, net jei testai nepavyko ar paspaudėte Ctrl+C. Serverių logai: `e2e/.logs/`.

Trukmė: apie 30–40 s su buildu (kai turbo talpykloje jo nėra) ir apie 25 s su `E2E_SKIP_BUILD=1` (Linux konteineryje; lėtesniame kompiuteryje ar Windows gali užtrukti iki kelių minučių). Pirmas paleidimas ilgesnis: atsisiunčiamas mongod. Kiekvienas paleidimas pradeda nuo tuščios DB.

- Cloudinary įkėlimai ir nuotraukos perimami naršyklėje (atsakymas pasirašomas e2e Cloudinary paslaptimi, API jį tikrina kaip produkcijoje).
- Turnstile: naudojami [Cloudflare testiniai raktai](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, nesėkmei `2x0000000000000000000000000000000AA`). Jei `challenges.cloudflare.com` nepasiekiamas (uždara CI aplinka), naudojamas vietinis pakaitalas, kuris elgiasi kaip šie raktai. Priverstinai: `E2E_TURNSTILE=real` arba `E2E_TURNSTILE=fake`.
- `E2E_SKIP_BUILD=1`: nekompiliuoti (naudoti esamus `dist/` ir `.next/`). `E2E_HEADED=1`: matoma naršyklė.

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

#### Užsakymų laiškai (Resend)

API siunčia laiškus per [Resend](https://resend.com) (`apps/api/src/notifications/`):

- **Pardavėjui** (`ORDER_NOTIFY_EMAIL`): naujas užsakymas su pirkėjo vardu, telefonu, el. paštu, pastabomis ir nuoroda į admin panelę. Atsakius į laišką, atsakymas nueina pirkėjui.
- **Pirkėjui** (kol kas išjungta): užsakymas gautas; būsena pasikeitė į patvirtintas, paruoštas atsiimti, atšauktas (su priežastimi). Atsakymai nueina pardavėjui (`SELLER.email`).

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

- **Tik mūsų web serveris.** Produkcijoje `POST /orders` priimamas tik su teisinga `X-Internal-Secret` (`INTERNAL_API_SECRET`), kitaip 403 `FORBIDDEN_CLIENT`. Todėl `INTERNAL_API_SECRET` privalomas ir web projekte (Vercel): be jo svetainė veikia, bet užsakymai nepateikiami (pirkėjui „Užsakymo pateikti nepavyko. Bandykite vėliau.“, Vercel loguose aiški klaida). Kitaip API visus pirkėjus ribotų kaip vieną Vercel IP.
- **Ribojimas pagal pirkėjo IP** (atmintyje, viena API instancija): `POST /orders` 5 per 10 min. ir 20 per parą, `GET /orders/access/:token` 60 per min., admin prisijungimas `ADMIN_LOGIN_RATE_LIMIT` per `ADMIN_LOGIN_RATE_WINDOW_SECONDS`. Skaičiuojamas kiekvienas bandymas; viršijus 429 `TOO_MANY_REQUESTS` su `Retry-After`. Visos ribos `apps/api/src/rate-limit/rate-limits.ts`.
- **Pirkėjo IP.** Web ir admin serveriai perduoda naršyklės IP (`X-Client-IP`, priimamas tik su paslaptimi). Tiesioginėms užklausoms Railway produkcijoje naudojamas `X-Real-IP`, kurį Railway edge nustato pats ([Railway: Public Networking specs](https://docs.railway.com/networking/public-networking/specs-and-limits)); `X-Forwarded-For` paskutinis šuolis gali būti vidinis Railway proxy. Kitur (vystant) `req.ip`.
- **Cloudflare Turnstile.** Užsakymo formoje valdiklis (`interaction-only`, lietuviškai); API tikrina tokeną per `siteverify` (5 s limitas) prieš rezervuodamas kiekius. Netinkamas: 403 `TURNSTILE_FAILED`; Cloudflare nepasiekiamas: 503 `TURNSTILE_UNAVAILABLE` (užsakymas nepriimamas, klaida loguose). Jau sukurto užsakymo pakartojimui (tas pats `clientRequestId`) tokeno nereikia.

Turnstile nustatymas: Cloudflare → Turnstile → Add widget, **Widget Mode: Managed**, hostnames: parduotuvės domenas. Site key → Vercel web `NEXT_TURNSTILE_SITE_KEY` (skaitomas serveryje, perdiegti nebūtina), Secret key → Railway `TURNSTILE_SECRET_KEY`. Produkcijoje (`NODE_ENV=production`, taip pat Vercel Preview) privalomi abu: API be `TURNSTILE_SECRET_KEY` nepasileidžia (klaida Railway deploy loguose), o web be `NEXT_TURNSTILE_SITE_KEY` veikia, bet užsakymų nepateikia (klaida Vercel loguose). Vystant ir testuose be jų naudojami Cloudflare testiniai „visada praeina“ raktai. Nustatyk abu kartu.

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

| Nustatymas     | web                                                                                                                                                   | admin                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root Directory | `apps/web`                                                                                                                                            | `apps/admin`                                                                             |
| Framework      | Next.js                                                                                                                                               | Next.js                                                                                  |
| Build Command  | `cd ../.. && pnpm turbo run build --filter=@desert-web/web`                                                                                           | `cd ../.. && pnpm turbo run build --filter=@desert-web/admin`                            |
| Env            | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (ta pati kaip Railway), `NEXT_TURNSTILE_SITE_KEY`; visi trys privalomi, neprivaloma `SITE_URL` | `API_URL=https://<api domenas>`, `INTERNAL_API_SECRET` (privaloma, ta pati kaip Railway) |

Web naršyklė į API nesikreipia: puslapius ir užsakymo pateikimą (Server Action) atlieka web Next.js serveris. `NEXT_PUBLIC_API_URL` nebenaudojamas (jei liko Vercel, ištrink). Produkcijoje web be `API_URL` **nepasileidžia** (aiški klaida Vercel runtime loguose, `src/instrumentation.ts`). Be `INTERNAL_API_SECRET` ar `NEXT_TURNSTILE_SITE_KEY` svetainė veikia, bet užsakymo forma grąžina „Užsakymo pateikti nepavyko. Bandykite vėliau.“, o Vercel loguose kiekvieną kartą klaida su trūkstamų kintamųjų sąrašu (kaip admin prisijungimas be paslapties). Su `INTERNAL_API_SECRET` web serveris API perduoda tikrą pirkėjo IP (`X-Client-IP`), o API produkcijoje užsakymus priima tik su ja. `SITE_URL` (pvz., `https://desertai.lt`) naudojamas absoliutiems OG adresams.

Pardavėjo vardas ir kontaktai (poraštė, `/privatumas`, laiškai pirkėjams ir jų Reply-To) yra `packages/shared/src/shop.ts` (`SELLER`, pažymėta TODO).

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
- [x] Laiškai per Resend: pardavėjui apie naują užsakymą; pirkėjui (gautas, būsenos) paruošta, bet išjungta iki domeno patvirtinimo
- [x] Užsakymo kūrimas su atomine kiekio rezervacija ir limitu vienam pirkėjui (idempotentiškas pagal `clientRequestId`)
- [x] Pirkėjų parduotuvė: krepšelis, užsakymas (tik atsiėmimas, apmokama atsiimant), užsakymo puslapis, `/privatumas`
- [x] Užsakymų apsauga: tik per web serverį, ribojimas pagal pirkėjo IP, Cloudflare Turnstile
- [x] E2E testai (`pnpm e2e`)
- [ ] Patvirtinti domeną Resend ir įjungti laiškus pirkėjams
- [ ] Specialūs užsakymai
- [ ] Mokėjimai (tiekėjas dar nepasirinktas)
- [ ] ESLint, CI
