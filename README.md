# Sonsam Saving API

Personal-finance tracker REST API built with **NestJS 11**, **Prisma 7**, and **PostgreSQL**.
Implements user accounts, categories, manual income/expense tracking, peer-to-peer transfers, notifications with low-balance alerts, dashboard summaries, and analytics reports.

---

## Tech stack

| Layer | Tool |
|---|---|
| Runtime | Node.js 20+ |
| Framework | NestJS 11 (Express) |
| ORM | Prisma 7 (`@prisma/adapter-pg`) |
| Database | PostgreSQL (Prisma Postgres / any Postgres) |
| Auth | JWT (`@nestjs/jwt` + `passport-jwt`) + bcrypt |
| Validation | `class-validator` + `class-transformer` |
| Docs | OpenAPI 3 (Swagger) at `/docs` |

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the env template and fill in real values:

```env
DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"
JWT_SECRET="<long-random-string>"
JWT_EXPIRES_IN="7d"
PORT=3000
```

### 3. Sync the database

```bash
npx prisma migrate deploy   # apply existing migrations
npx prisma generate         # generate the Prisma client
```

For local development you can use `npx prisma migrate dev` instead.

### 4. Run

```bash
npm run start:dev
```

The server boots on `http://localhost:3000`.
Interactive API docs (Swagger UI) live at `http://localhost:3000/docs`.

---

## NPM scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Watch-mode dev server |
| `npm run start` | One-shot start (no watch) |
| `npm run start:prod` | Run pre-compiled `dist/main` |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run lint` | ESLint with auto-fix |
| `npm run format` | Prettier |
| `npm run test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |

---

## API response shape

Every successful response is wrapped by the global `ResponseInterceptor`:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { /* payload */ }
}
```

Every error response is wrapped by the global `HttpExceptionFilter`:

```json
{
  "statusCode": 400,
  "message": "amount must be a positive number",
  "data": null,
  "error": "Bad Request"
}
```

`message` may be a string **or** an array of strings (validation errors).
Decimal amounts are always **strings** (e.g. `"150.00"`) to preserve precision.
BigInt IDs are always **strings** (e.g. `"42"`) to survive JSON serialization.

---

## Authentication

All endpoints except `POST /api/auth/register` and `POST /api/auth/login` require a valid JWT.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs…
```

---

## Endpoint reference

Global prefix: `/api`

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create user, account, and seed 12 default categories |
| `POST` | `/auth/login` | Exchange credentials for a JWT |
| `POST` | `/auth/logout` | Stateless logout (client must drop the token) |

### User
| Method | Path | Description |
|---|---|---|
| `GET` | `/users/me` | Current user's profile |
| `PUT` | `/users/me` | Update full name / phone |

### Account
| Method | Path | Description |
|---|---|---|
| `GET` | `/account/me` | Account number + current balance |
| `GET` | `/account/qr` | PNG-as-base64 QR code of the account number |

### Category
| Method | Path | Description |
|---|---|---|
| `GET` | `/categories` | List the user's categories (filter by `type`) |
| `POST` | `/categories` | Create a new category |
| `PUT` | `/categories/:id` | Rename a category (protected names rejected) |
| `DELETE` | `/categories/:id` | Soft-delete (protected names rejected) |

Protected categories that cannot be renamed or deleted: **`Transfer In`**, **`Transfer Out`**.

### Transaction
| Method | Path | Description |
|---|---|---|
| `GET` | `/transactions` | Paginated list with filters (`type`, `source`, `categoryId`, `start`, `end`, `page`, `limit`) |
| `GET` | `/transactions/:id` | Single transaction by ID |
| `POST` | `/transactions` | Create a manual transaction (rejects overdraft on expense) |
| `PUT` | `/transactions/:id` | Update a manual transaction (transfer-sourced rows are immutable) |
| `DELETE` | `/transactions/:id` | Delete a manual transaction and reverse the balance |

### Transfer
| Method | Path | Description |
|---|---|---|
| `POST` | `/transfer` | P2P transfer; atomic 7-step flow with race-safe debit |
| `GET` | `/transfer/history` | Sent / received history with optional `direction`, `start`, `end` |

A successful transfer:
1. race-safely debits the sender (`balance >= amount` predicate)
2. credits the receiver
3. inserts a `transfers` row
4. inserts paired `transactions` rows (`source = transfer`, linked via `refId`)
5. inserts a `Transfer Received` notification for the receiver
6. (if sender opted in) inserts a `Low Balance Alert` when post-debit balance < their threshold

### Notification
| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | Paginated list (`isRead`, `page`, `limit`) |
| `PUT` | `/notifications/read-all` | Bulk mark all unread as read |
| `PUT` | `/notifications/:id/read` | Mark a single notification as read |
| `POST` | `/notifications/settings` | Upsert per-user preferences |

Settings body:
```json
{
  "transferAlert": true,
  "monthlyReport": true,
  "lowBalanceAlert": true,
  "lowBalanceThreshold": 50
}
```

The low-balance alert is **opt-in**: it only fires for users who have called `POST /notifications/settings` at least once.

### Dashboard
| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard/summary` | Total balance + period income/expense (`month?`, `year?`) |
| `GET` | `/dashboard/recent` | Last N transactions (`limit?`, default 10, max 100) |

### Report
| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/monthly` | Income/expense/net savings for one month |
| `GET` | `/reports/category` | Per-category breakdown with percentages (`type` required, `month`/`year` optional) |
| `GET` | `/reports/trends` | Last N months income/expense/savings (`months?`, default 6, max 24) |
| `GET` | `/reports/weekly` | Per-week buckets within a single month (1-7, 8-14, …) |

`/reports/weekly` is not in the original spec — it was added to feed the weekly bar chart in the analytics screen.

---

## Domain model

Six tables (see `prisma/schema.prisma` for the source of truth):

- **users** — login credentials + profile
- **accounts** — 1-1 with users; holds the running balance
- **categories** — per-user lookup; `Transfer In` / `Transfer Out` are reserved
- **transfers** — completed peer-to-peer transfer record
- **transactions** — every income/expense; `source = manual | transfer`, `refId → transfers.id` for transfer-sourced rows
- **notifications** — receiver notifications, low-balance alerts, etc.
- **notification_settings** — per-user preferences (`lowBalanceThreshold`, etc.)

`onDelete` rules:
- Deleting a user cascades to their account, categories, transactions, notifications and settings.
- Deleting a transfer sets `transactions.refId = NULL` (transfer-sourced rows survive as historical records).

Account balance integrity is preserved by:
- Wrapping every balance-mutating operation in `prisma.$transaction(async tx => ...)`
- Guarding debits with a race-safe `updateMany({ where: { id, balance: { gte: amount } } })` predicate so concurrent expenses cannot overdraw

---

## Project layout

```
src/
├── auth/            register / login / JWT strategy & guard
├── user/            profile read/update
├── account/         account info + QR code
├── category/        per-user category CRUD with protected names
├── transaction/     manual income/expense CRUD
├── transfer/        atomic P2P transfers + history
├── notification/    list, mark-read, settings, low-balance alerting
├── dashboard/       summary + recent
├── report/          monthly / category / trends / weekly
├── prisma/          PrismaService (Pg adapter + connection pool)
└── common/
    ├── decorators/  @ApiMessage / @CurrentUser
    ├── dto/         standard response envelope DTOs
    ├── filters/     HttpExceptionFilter (unified error envelope)
    ├── interceptors/ResponseInterceptor (unified success envelope)
    ├── pipes/       ParseBigIntPipe
    └── swagger/     ApiOkResponseWrapped / ApiCreatedResponseWrapped /
                     ApiPaginatedResponse helpers
```

---

## Notes for contributors

- **Always run `npx prisma generate`** after editing `schema.prisma` — the IDE's TypeScript server may show stale "property does not exist" errors until it does.
- **Add new endpoints with the existing helpers**: use `@ApiMessage(...)` for the success message and `@ApiOkResponseWrapped(Dto)` (or `ApiPaginatedResponse(Dto)`) for accurate Swagger schemas.
- **Prefer `Prisma.Decimal`** for all monetary math — never coerce to `number`.
- **Prefer `BigInt`** for all entity IDs in service code — convert to string only at the DTO boundary.
