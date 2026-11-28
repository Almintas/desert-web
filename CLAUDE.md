# Desert Web: instrukcijos agentams

Desertų parduotuvė, kurioje užsakyti galima tik per admino atidarytą pardavimo langą. Specialūs užsakymai (dideli kiekiai) vyksta kaip užklausa, kurią patvirtina adminas.

## Stekas

- pnpm workspaces + Turborepo. Node 24, pnpm 10.
- `apps/api`: NestJS 11, Mongoose 8, MongoDB Atlas. Diegiamas į Railway.
- `apps/web`, `apps/admin`: Next.js (App Router), React 19. Diegiami į Vercel.
- `packages/shared`: Zod 4 schemos, DTO tipai, enum'ai, helperiai. Kompiliuojamas į CJS `dist/`.

## Taisyklės

- Pinigai saugomi tik centais (`*Cents`, integer). Float sumų nenaudojam.
- Datos DB saugomos UTC, rodomos `Europe/Vilnius` laiku (`SHOP_TIMEZONE`).
- Įvesties validacija: Zod schema `shared` pakete, o API ją naudoja per `ZodValidationPipe`. `class-validator` nenaudojam.
- API atsakymai yra `*Dto` tipai iš `shared` (ID kaip string, datos kaip ISO string). Mongoose dokumentų tiesiai negrąžinam.
- Ar langas atidarytas, tikrina backendas kiekvieno užsakymo metu. Kiekis rezervuojamas vienu atominiu `updateOne` su sąlyga `quantityAvailable >= qty` ir `$inc` per `arrayFilters`, transakcijoje kartu su užsakymo sukūrimu.
- Užsakymuose saugomos produkto pavadinimo ir kainos kopijos.
- UI tekstai rašomi lietuviškai.

## Komandos

- `pnpm dev`, `pnpm build`, `pnpm typecheck`
- Vienai aplikacijai: `pnpm turbo run <task> --filter=@desert-web/<api|web|admin|shared>`

## Git

- Prieš commit'inant nustatyk autorių: `git config user.name "Almintas"` ir `git config user.email "107874379+Almintas@users.noreply.github.com"`.
- Commit'ų ir PR aprašymuose nerašyk `Co-Authored-By: Claude`, `Claude-Session` ar `Generated with Claude Code` eilučių.
