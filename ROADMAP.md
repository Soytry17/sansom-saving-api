# Sonsam Saving API — Implementation Roadmap

Tracks remaining work to bring the API to feature-parity with
`FinanceTracker_API_Database_Docs (2).md`.

Last updated: 2026-04-29

---

## Status legend

- ✅ Done
- 🟡 In progress
- ⬜ Not started

---

## Phase 0 — Foundations (✅ Done)

- ✅ NestJS scaffold, Prisma 7, PostgreSQL adapter
- ✅ Schema models: User, Account, Category, Transfer, Transaction, Notification
- ✅ Auth module (register / login / logout, JWT, bcrypt)
- ✅ User module (`/users/me` GET + PUT)
- ✅ Account module (`/account/me`, `/account/qr`)
- ✅ `/api` global prefix, Swagger at `/docs`
- ✅ BigInt JSON serialization patch
- ✅ `dotenv/config` preload (fixes JWT sign/verify mismatch)
- ✅ Collision-safe account-number generator (`ACC-YYYYMMDD-NNNNN` per-day sequence + retry)
- ✅ Unified `ApiResponseDto` envelope, `@ApiMessage` decorator, `ResponseInterceptor`
- ✅ Typed Swagger wrappers (`ApiOkResponseWrapped`, `ApiCreatedResponseWrapped`, `ApiPaginatedResponse`)
- ✅ Full Swagger annotations on existing endpoints

---

## Phase 1 — Category module ⬜ (≈30 min)

**Why first:** small, no dependencies, unblocks Transactions and Transfers.

### Files to create
```
src/category/
  category.module.ts
  category.controller.ts
  category.service.ts
  dto/
    create-category.dto.ts        // { name, type }
    update-category.dto.ts        // { name }
    category-response.dto.ts      // { id, name, type, createdAt }
    list-categories-query.dto.ts  // { type? }
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | filter by `?type=income\|expense` |
| POST | `/api/categories` | create custom |
| PUT | `/api/categories/:id` | block names `Transfer In` / `Transfer Out` → 403 |
| DELETE | `/api/categories/:id` | soft-delete (`is_deleted = true`); same protection |

### Business rules
- Soft-delete only (set `isDeleted = true`).
- Categories `Transfer In` and `Transfer Out` cannot be edited or deleted (return `ForbiddenException`).
- Existing transactions retain their `categoryId` even after soft-delete.
- All operations are user-scoped (filter by `userId`).

### Acceptance criteria
- [ ] Newly registered user sees their 12 default categories at `GET /categories`.
- [ ] Custom category creation appears in subsequent list response.
- [ ] Editing a soft-deleted category fails (404).
- [ ] Editing/deleting `Transfer In` / `Transfer Out` returns 403.

---

## Phase 2 — Transaction module ⬜ (≈1.5 h)

**Why second:** core feature, depends on Category. Introduces the *atomic balance update* pattern reused by Transfers.

### Files to create
```
src/transaction/
  transaction.module.ts
  transaction.controller.ts
  transaction.service.ts
  dto/
    create-transaction.dto.ts        // { amount, type, categoryId, date, note? }
    update-transaction.dto.ts        // partial of create
    list-transactions-query.dto.ts   // { type?, source?, categoryId?, start?, end?, page?, limit? }
    transaction-response.dto.ts      // { id, amount, type, source, category{id,name}, date, note, refId, createdAt }
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/api/transactions` | filters + pagination, returns `PaginatedDataDto<TransactionResponseDto>` |
| GET | `/api/transactions/:id` | single, scoped to user |
| POST | `/api/transactions` | manual only, balance check on `expense`, returns `{ ...tx, newBalance }` |
| PUT | `/api/transactions/:id` | manual only; `source = 'transfer'` rows are immutable |
| DELETE | `/api/transactions/:id` | manual only; reverses balance |

### Business rules
- All writes wrap in `prisma.$transaction([...])`:
  - On **create expense**: assert `account.balance >= amount`, then `UPDATE accounts SET balance = balance - amount`, then `INSERT transactions`.
  - On **create income**: `UPDATE accounts SET balance = balance + amount`, then `INSERT transactions`.
  - On **update**: reverse the *old* delta and apply the *new* delta in a single transaction.
  - On **delete**: reverse the delta and delete the row.
- Reject `source = 'transfer'` updates/deletes with 403.
- Validate `categoryId` belongs to the user and `category.type === transaction.type`.
- Date must be a valid `YYYY-MM-DD` (use `@IsDateString()` and store as `DATE`).

### Risks / considerations
- Decimal arithmetic — use `Prisma.Decimal` for balance math, not JS numbers.
- Concurrent transactions on the same account — Prisma `$transaction` uses a snapshot, but we should add a `WHERE balance >= amount` predicate on the UPDATE to atomically reject overdrafts.
- Pagination defaults: `page=1`, `limit=20`. Cap `limit` at 100.

### Acceptance criteria
- [ ] Create income → balance increases; transaction listed.
- [ ] Create expense within balance → balance decreases.
- [ ] Create expense exceeding balance → 400, balance unchanged.
- [ ] Update transaction amount → balance reflects new amount.
- [ ] Delete transaction → balance restored.
- [ ] Transfer-sourced transactions cannot be updated/deleted.
- [ ] Filters by type/source/category/date all work and combine correctly.

---

## Phase 3 — Transfer module ⬜ (≈1 h)

**Why third:** depends on Category (`Transfer In`/`Transfer Out`), Transaction, and Notification.

### Files to create
```
src/transfer/
  transfer.module.ts
  transfer.controller.ts
  transfer.service.ts
  dto/
    create-transfer.dto.ts        // { receiverAccountNumber, amount, note? }
    list-transfers-query.dto.ts   // { direction?, start?, end? }
    transfer-response.dto.ts      // { transferId, amount, receiver{accountNumber,name}, newBalance }
    transfer-history-item.dto.ts  // { transferId, direction, amount, note, counterpart, createdAt }
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| POST | `/api/transfer` | atomic 5-step flow described below |
| GET | `/api/transfer/history` | filter by `?direction=sent\|received&start&end` |

### Atomic transfer flow (single `prisma.$transaction`)
1. Validate `receiverAccountNumber` exists and is **not** the sender's own account.
2. Assert `senderAccount.balance >= amount`.
3. `UPDATE accounts SET balance = balance - amount WHERE id = sender AND balance >= amount` (predicate guards races).
4. `UPDATE accounts SET balance = balance + amount WHERE id = receiver`.
5. `INSERT INTO transfers (...)`.
6. `INSERT INTO transactions x2`:
   - sender: `type=expense, source=transfer, refId=transfer.id, categoryId=<sender's Transfer Out>`.
   - receiver: `type=income,  source=transfer, refId=transfer.id, categoryId=<receiver's Transfer In>`.
7. `INSERT INTO notifications` for receiver.

### Business rules
- Transfer to self → 400.
- Receiver category lookup must use the receiver's **own** `Transfer In` category, not the sender's.
- Transfers are immutable (no UPDATE/DELETE endpoints).

### Acceptance criteria
- [ ] Successful transfer: both balances change, 1 transfer + 2 transactions inserted, receiver has a notification.
- [ ] Insufficient balance → 400, no rows inserted, balances unchanged.
- [ ] Unknown receiver → 404.
- [ ] Self-transfer → 400.
- [ ] Concurrent transfers from same sender don't allow overdraft (verified manually with parallel curls).

---

## Phase 4 — Notification module ⬜ (≈30 min)

**Why fourth:** depends on Transfer (which writes notifications). The basic CRUD is independent and small.

### Decision needed before starting
The docs include `POST /notifications/settings` with `{ transferAlert, monthlyReport, lowBalanceAlert, lowBalanceThreshold }`, but **the schema has no `notification_settings` table**. Pick one:

1. **Skip** — drop the `/settings` endpoint from this phase. *(Recommended for now.)*
2. **Add a `NotificationSettings` model** to `schema.prisma`, run a migration, then implement the endpoint.

### Files to create
```
src/notification/
  notification.module.ts
  notification.controller.ts
  notification.service.ts
  dto/
    notification-response.dto.ts      // { id, title, message, isRead, createdAt }
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications` | newest first |
| PUT | `/api/notifications/:id/read` | mark one as read |
| PUT | `/api/notifications/read-all` | mark all as read for current user |
| (POST | `/api/notifications/settings` | only if option 2 chosen above) |

### Acceptance criteria
- [ ] Receiver of a transfer sees a notification at `GET /notifications`.
- [ ] Marking one read sets `isRead = true`.
- [ ] Read-all updates only the current user's notifications.

---

## Phase 5 — Dashboard module ⬜ (≈30 min)

**Why fifth:** read-only aggregations. No schema impact.

### Files to create
```
src/dashboard/
  dashboard.module.ts
  dashboard.controller.ts
  dashboard.service.ts
  dto/
    dashboard-summary.dto.ts          // { totalBalance, totalIncome, totalExpense, period }
    dashboard-recent-item.dto.ts
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/api/dashboard/summary` | optional `?month=N&year=YYYY`, defaults to current month |
| GET | `/api/dashboard/recent` | optional `?limit=N` (default 10) |

### SQL strategy
Use `prisma.transaction.groupBy` and `prisma.transaction.aggregate`. Default month range = first–last day of current month in user's timezone (treat all dates as UTC for now).

### Acceptance criteria
- [ ] Summary totals match the sum of transactions for that period.
- [ ] Period label formatted as `"May 2026"`.
- [ ] Recent endpoint returns `limit` items, newest first.

---

## Phase 6 — Reports module ⬜ (≈45 min)

### Files to create
```
src/reports/
  reports.module.ts
  reports.controller.ts
  reports.service.ts
  dto/
    monthly-report.dto.ts            // { month, totalIncome, totalExpense, netSavings }
    category-report.dto.ts           // { type, period, grandTotal, breakdown:[{category,total,count,percentage}] }
    trends-report.dto.ts             // [{ month, income, expense, savings }]
```

### Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | `/api/reports/monthly` | required `?month=N&year=YYYY` |
| GET | `/api/reports/category` | required `?type=income\|expense`, optional `month/year` |
| GET | `/api/reports/trends` | optional `?months=N` (default 6) |

### Acceptance criteria
- [ ] Category breakdown percentages sum to ~100 (allow for rounding).
- [ ] Trends returns the requested number of months in chronological order.
- [ ] Monthly = totalIncome − totalExpense = netSavings.

---

## Phase 7 — Quality & polish ⬜ (≈45 min)

- [ ] Migration cleanup — squash the 5 messy migration folders into one fresh `init` (separate destructive task; needs explicit consent).
- [ ] Replace `as any` and other untyped escape hatches if any remain.
- [ ] Global `HttpExceptionFilter` to enforce the `{ statusCode, message, error }` error envelope (currently relying on Nest defaults; output already matches the docs but a custom filter makes BigInt/Decimal-safe error payloads guaranteed).
- [ ] E2E test in `test/` covering a full flow:
  register → login → create category → create transaction → transfer → check notification → list reports.
- [ ] Replace placeholder `README.md` with a proper one (env setup, Prisma commands, run instructions, link to `/docs`).
- [ ] Optional: Postman/Insomnia collection generated from the OpenAPI spec.

---

## Suggested execution order

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5  →  Phase 6  →  Phase 7
Category    Transaction  Transfer    Notification  Dashboard  Reports   Polish
30 min      90 min       60 min      30 min        30 min     45 min    45 min
```

**Total remaining estimate: ~5 hours of focused work.**

---

## Cross-cutting conventions to maintain

When building each module, follow these existing patterns:

1. **Controllers**: thin. Return raw data. Use `@ApiMessage('...')`, `@ApiOkResponseWrapped(Dto)`, `@ApiBearerAuth`.
2. **Services**: contain business rules. Take `bigint` IDs, return DTO-shaped objects.
3. **DTOs**: use both `class-validator` (`@IsString`, `@IsEmail`, ...) and `@ApiProperty(Optional)` for Swagger.
4. **Authorization**: every protected controller has class-level `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()`.
5. **BigInt → string** at the service-DTO boundary (`id.toString()`).
6. **Decimal → string** at the service-DTO boundary (`balance.toString()`).
7. **All multi-step writes**: `prisma.$transaction([...])` with predicate-guarded `UPDATE`s for race safety.
8. **No comments narrating obvious code.** Comments only for non-obvious intent or constraints.
