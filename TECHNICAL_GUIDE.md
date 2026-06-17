# Sonsam Saving API — Technical Guide (Beginner Friendly)

This document explains **how the API works**, **what technologies it uses**, and **how to call each endpoint**. It is written for developers who are new to NestJS, Prisma, JWT auth, or Firebase push notifications.

---

## Table of contents

1. [What is this project?](#1-what-is-this-project)
2. [Big picture — how a request travels](#2-big-picture--how-a-request-travels)
3. [Technologies, libraries, and configuration](#3-technologies-libraries-and-configuration)
4. [Project folder structure](#4-project-folder-structure)
5. [Database (Prisma + PostgreSQL)](#5-database-prisma--postgresql)
6. [Authentication and OTP email flow](#6-authentication-and-otp-email-flow)
7. [Firebase push notifications and device tokens](#7-firebase-push-notifications-and-device-tokens)
8. [Feature flows (business logic)](#8-feature-flows-business-logic)
9. [API reference — how to use every endpoint](#9-api-reference--how-to-use-every-endpoint)
10. [Common errors and tips](#10-common-errors-and-tips)

---

## 1. What is this project?

**Sonsam Saving API** is a backend for a personal finance / saving app. It lets users:

- Register and log in securely
- Track income and expenses
- Transfer money to other users (P2P)
- View dashboard summaries and reports
- Receive in-app and push notifications

The Android app talks to this API over HTTP. All routes live under the prefix:

```
/api/
```

Example base URLs:

| Environment | Base URL |
|-------------|----------|
| Local (emulator) | `http://10.0.2.2:3000/api/` |
| Local (phone on same Wi‑Fi) | `http://192.168.x.x:3000/api/` |
| Production (Render) | `https://your-service.onrender.com/api/` |

Interactive docs (Swagger UI): `/docs`  
OpenAPI JSON: `/docs-json`

---

## 2. Big picture — how a request travels

```mermaid
sequenceDiagram
    participant Client as Android / Web client
    participant Nest as NestJS (main.ts)
    participant Guard as JwtAuthGuard
    participant Ctrl as Controller
    participant Svc as Service
    participant DB as PostgreSQL (via Prisma)

    Client->>Nest: HTTP request (JSON)
    Nest->>Nest: ValidationPipe (check body/query)
    alt Protected route
        Nest->>Guard: Check Bearer JWT
        Guard-->>Nest: req.user = { userId, email }
    end
    Nest->>Ctrl: Route handler
    Ctrl->>Svc: Business logic
    Svc->>DB: Prisma queries / transactions
    DB-->>Svc: Rows
    Svc-->>Ctrl: Result DTO
    Ctrl-->>Nest: Raw data
    Nest->>Nest: ResponseInterceptor wraps envelope
    Nest-->>Client: { statusCode, message, data }
```

**Step by step:**

1. **Client** sends HTTP request with JSON body (and `Authorization: Bearer <token>` when logged in).
2. **`main.ts`** applies global prefix `api`, CORS, validation, and exception filter.
3. **`JwtAuthGuard`** (on protected routes) validates the JWT and attaches `req.user`.
4. **Controller** receives the request and calls a **Service**.
5. **Service** uses **Prisma** to read/write the **PostgreSQL** database.
6. **`ResponseInterceptor`** wraps the result in a standard envelope before sending JSON back.

---

## 3. Technologies, libraries, and configuration

### 3.1 NestJS — the web framework

| What | Why we use it |
|------|----------------|
| **NestJS** | Organizes code into **modules**, **controllers** (routes), and **services** (logic). Similar ideas to Angular/Spring. |
| **@nestjs/config** | Loads `.env` variables (`DATABASE_URL`, `JWT_SECRET`, etc.). |
| **@nestjs/swagger** | Auto-generates API docs at `/docs`. |
| **@nestjs/schedule** | Runs cron jobs (e.g. monthly report push on the 1st of each month). |
| **class-validator + class-transformer** | Validates request bodies (email format, min password length, etc.). |

**Key file:** `src/main.ts` — starts the server, enables CORS, sets global prefix `api`, registers Swagger.

### 3.2 Prisma — database ORM

| What | Why we use it |
|------|----------------|
| **Prisma** | Type-safe way to talk to PostgreSQL. Schema lives in `prisma/schema.prisma`. |
| **@prisma/client** | Generated client used in services (`prisma.user.findUnique(...)`) |
| **@prisma/adapter-pg** | Connects Prisma to PostgreSQL using the `pg` driver |

**Key files:**

- `prisma/schema.prisma` — table definitions (User, Account, Transaction, Device, …)
- `prisma/migrations/` — SQL migration history
- `prisma.config.ts` — points migrations at `DATABASE_URL`
- `src/prisma/prisma.service.ts` — injectable Prisma client for the whole app

**Important:** IDs in the database are `BigInt`. The API **returns them as strings** in JSON (e.g. `"id": "7"`) because JSON does not support BigInt natively.

### 3.3 PostgreSQL — where data is stored

This project stores data in **PostgreSQL**. The connection string is in `.env`:

```env
DATABASE_URL="postgres://...@pooled.db.prisma.io:5432/postgres?sslmode=require"
```

That host (`pooled.db.prisma.io`) is **Prisma Postgres** — a managed PostgreSQL service from Prisma.

#### What about Supabase?

**Supabase is not used in this codebase today.** Supabase is another popular way to host PostgreSQL. Because NestJS + Prisma only need a `DATABASE_URL`, you *could* point `DATABASE_URL` at a Supabase Postgres connection string in the future — the app code would stay the same. Right now, all tables and migrations are managed through **Prisma**, not the Supabase dashboard.

### 3.4 JWT authentication

| Library | Role |
|---------|------|
| **@nestjs/jwt** | Signs tokens on login / verify-email |
| **passport + passport-jwt** | Reads `Authorization: Bearer ...` header |
| **bcrypt** | Hashes passwords (never store plain text) |

**Flow:**

1. User logs in → server checks password with `bcrypt.compare`.
2. Server signs a JWT containing `{ sub: userId, email }` using `JWT_SECRET`.
3. Client stores the token and sends it on every protected request.
4. `JwtStrategy` validates the token and exposes `@CurrentUser()` to controllers.

**Config (`.env`):**

```env
JWT_SECRET="your-long-random-secret"
JWT_EXPIRES_IN="7d"
```

**Key files:**

- `src/auth/auth.service.ts` — register, login, forgot/reset password
- `src/auth/strategies/jwt.strategy.ts` — validates JWT
- `src/auth/guards/jwt-auth.guard.ts` — protects routes

**Note:** Logout is **stateless** — the server does not keep a session list. The client deletes the token locally.

### 3.5 Email OTP (Nodemailer + Gmail SMTP)

Registration and password reset use **6-digit codes** sent by email.

| Library | Role |
|---------|------|
| **nodemailer** | Sends SMTP email |
| **OtpService** | Generates code, hashes it, stores in `email_otps` table |

**Config (`.env`):**

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=your@gmail.com
MAIL_PASS=your-gmail-app-password
MAIL_FROM_ADDRESS=your@gmail.com
MAIL_FROM_NAME=Sonsam-Saving
```

**Key files:**

- `src/mail/mail.service.ts` — `sendVerificationCode`, `sendPasswordResetCode`
- `src/otp/otp.service.ts` — issue / verify codes
- `src/otp/otp.constants.ts` — 10 min expiry, 60s resend cooldown, max 5 attempts

### 3.6 Firebase Cloud Messaging (FCM) — push notifications

Push notifications alert the phone even when the app is in the background.

| Library | Role |
|---------|------|
| **firebase-admin** | Server-side SDK to send pushes to device tokens |

**Config (`.env`):**

```env
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 of serviceAccount.json>
PUSH_TEST_ENABLED=false   # set true in dev to allow POST /notifications/test
```

**How it fits together:**

1. **Android app** gets an FCM token from Firebase SDK.
2. App calls **`POST /api/devices`** with that token (after login).
3. Backend stores token in **`devices`** table (linked to `userId`).
4. When something happens (transfer received, low balance, monthly report), backend:
   - Creates a row in **`notifications`** (in-app inbox)
   - Calls **`FcmService.sendToUser()`** to push to all registered devices

**Key files:**

- `src/push/fcm.service.ts` — initializes Firebase Admin, sends data-only messages
- `src/push/push-payload.ts` — push `type`, title, message contract
- `src/devices/devices.service.ts` — register / unregister tokens
- `src/transfer/transfer.service.ts` — sends push **after** DB transaction commits
- `src/notification/jobs/monthly-report.job.ts` — cron job for monthly summary push

**Push types (`push-payload.ts`):**

| type | When |
|------|------|
| `transfer_received` | Someone sent you money |
| `low_balance` | Your balance dropped below your threshold |
| `monthly_report` | 1st of month summary |
| `transfer_sent` | Reserved for future use |

Messages are **data-only** (no FCM `notification` block) so the Android app always handles display consistently.

### 3.7 Other useful libraries

| Library | Used for |
|---------|----------|
| **qrcode** | Generate QR code for account number (`GET /account/qr`) |
| **dotenv** | Load `.env` before Nest boot (see top of `main.ts`) |

### 3.8 Environment variables summary

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `JWT_SECRET` | Yes | Sign/verify JWT |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `PORT` | No | Server port (default `3000`; Render sets this) |
| `MAIL_*` | Yes (for OTP) | Gmail SMTP |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | No* | Push notifications (*API works without it; pushes disabled) |
| `PUSH_TEST_ENABLED` | No | Allow test push endpoint |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |

See `.env.example` for a template.

---

## 4. Project folder structure

```
sonsam-saving-api/
├── prisma/
│   ├── schema.prisma          # Database models
│   └── migrations/            # Versioned SQL migrations
├── src/
│   ├── main.ts                # App entry + Swagger + CORS
│   ├── app.module.ts          # Root module — imports all feature modules
│   ├── auth/                  # Register, login, JWT, forgot password
│   ├── otp/                   # OTP issue/verify logic
│   ├── mail/                  # Nodemailer email sending
│   ├── user/                  # Profile GET/PUT
│   ├── account/               # Balance, account number, QR
│   ├── category/              # Income/expense categories
│   ├── transaction/           # Manual income/expense CRUD
│   ├── transfer/              # P2P money transfer
│   ├── dashboard/             # Summary + recent transactions
│   ├── report/                # Monthly, category, trends, weekly reports
│   ├── notification/          # In-app notifications + settings + cron job
│   ├── devices/               # FCM token register/unregister
│   ├── push/                  # Firebase Admin wrapper
│   ├── prisma/                # PrismaService (DB connection)
│   └── common/                # Shared interceptor, filters, pipes, DTOs
├── render.yaml                # Render.com deployment blueprint
├── openapi.json               # Generated OpenAPI spec
└── .env                       # Secrets (never commit)
```

**NestJS pattern (repeat everywhere):**

```
Module → Controller (HTTP routes) → Service (logic) → Prisma (database)
```

---

## 5. Database (Prisma + PostgreSQL)

### 5.1 Main tables

| Table | Purpose |
|-------|---------|
| `users` | Registered users (after email verification) |
| `pending_registrations` | Temporary signup data before OTP verified |
| `email_otps` | Hashed OTP codes for verify-email and reset-password |
| `accounts` | One wallet per user (`balance`, `account_number`) |
| `categories` | User's income/expense labels |
| `transactions` | Every money movement (manual or from transfer) |
| `transfers` | P2P transfer records between two accounts |
| `notifications` | In-app notification inbox |
| `notification_settings` | User preferences (alerts on/off, low balance threshold) |
| `devices` | FCM tokens for push notifications |

### 5.2 Relationships (simplified)

```
User (1) ── (1) Account
User (1) ── (*) Category
User (1) ── (*) Transaction
User (1) ── (*) Notification
User (1) ── (1) NotificationSettings
User (1) ── (*) Device

Transfer links two Accounts (sender → receiver)
Transaction may link to Transfer via refId when source = transfer
```

### 5.3 Migrations

When the schema changes:

```bash
pnpm prisma migrate dev --name describe_change   # local dev
pnpm prisma migrate deploy                        # production (Render build)
pnpm prisma generate                              # regenerate TypeScript client
```

---

## 6. Authentication and OTP email flow

### 6.1 Registration (two steps)

```mermaid
sequenceDiagram
    participant App
    participant API
    participant Mail as Gmail SMTP
    participant DB

    App->>API: POST /auth/register
    API->>DB: Save pending_registrations
    API->>DB: Create email_otp (VERIFY_EMAIL)
    API->>Mail: Send 6-digit code
    API-->>App: { email, message }

    App->>API: POST /auth/verify-email { email, code }
    API->>DB: Verify OTP, create User + Account + Categories + NotificationSettings
    API-->>App: { token, user, account }
```

**What gets created on verify-email:**

- `User` row
- `Account` with `balance = 0` and unique `ACC-YYYYMMDD-NNNNN` number
- Default categories (Salary, Food, Transfer In, Transfer Out, …)
- Default `notification_settings`

Until verify-email succeeds, **no User exists** — so `forgot-password` will not send email for that address (by design, to avoid leaking which emails exist).

### 6.2 Login

```
POST /auth/login { email, password }
→ bcrypt.compare
→ return JWT token + user profile
```

### 6.3 Forgot password (two steps — password NOT changed until step 2)

```mermaid
sequenceDiagram
    participant App
    participant API
    participant Mail

    App->>API: POST /auth/forgot-password { email }
    Note over API: Only if User exists
    API->>Mail: Send RESET_PASSWORD OTP
    API-->>App: 200 OK (always same message)

    App->>API: POST /auth/reset-password { email, code, newPassword }
    Note over API: Verify OTP first, then hash new password
    API-->>App: Password updated
```

**Important:** Clicking "forgot password" does **not** change the password. The old password still works until the user completes `reset-password` with a valid OTP.

### 6.4 Using the token

All protected endpoints need:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 7. Firebase push notifications and device tokens

### 7.1 End-to-end push flow

```mermaid
sequenceDiagram
    participant App as Android app
    participant FCM as Firebase
    participant API
    participant DB

    App->>FCM: Get FCM token
    App->>API: POST /devices { fcmToken, platform: "android" }
    API->>DB: Upsert devices row

    Note over API: User receives a transfer
    API->>DB: Transaction commits (balance, transfer, notification row)
    API->>DB: Load user's device tokens
    API->>FCM: sendEachForMulticast(data-only message)
    FCM->>App: Push received
    App->>App: Show notification + refresh inbox
```

### 7.2 When to register / unregister device

| App event | API call |
|-----------|----------|
| After login | `POST /devices` |
| FCM token refreshed | `POST /devices` again (upsert) |
| Logout | `POST /devices/unregister` |

### 7.3 FCM payload shape (all values are strings)

```json
{
  "type": "transfer_received",
  "notificationId": "42",
  "title": "Transfer Received",
  "message": "You received 100.00 from John",
  "createdAt": "2026-06-17T03:00:00.000Z",
  "amount": "100.00"
}
```

---

## 8. Feature flows (business logic)

### 8.1 Manual transaction (income / expense)

```
POST /transactions
```

1. Validate category belongs to user and matches type (income vs expense).
2. Inside a DB transaction:
   - Insert `transactions` row (`source = manual`)
   - **Income** → `balance += amount`
   - **Expense** → `balance -= amount` only if `balance >= amount` (no overdraft)

Transfer-sourced transactions **cannot** be edited or deleted manually.

### 8.2 P2P transfer

```
POST /transfer
```

Atomic steps in one `prisma.$transaction`:

1. Debit sender (fails if insufficient balance)
2. Credit receiver
3. Insert `transfers` row
4. Create paired transactions (sender: Transfer Out expense, receiver: Transfer In income)
5. Optionally create notification for receiver (if `transferAlert` enabled)
6. Optionally low-balance notification for sender

**After commit:** FCM pushes are sent (never inside the transaction — avoids phantom pushes on rollback).

### 8.3 Dashboard and reports

| Feature | Endpoint | What it calculates |
|---------|----------|-------------------|
| Summary | `GET /dashboard/summary` | Balance + income/expense totals |
| Recent | `GET /dashboard/recent` | Latest transactions |
| Monthly | `GET /reports/monthly` | Income, expense, net savings for a month |
| Category | `GET /reports/category` | Spending/income per category |
| Trends | `GET /reports/trends` | Last N months comparison |
| Weekly | `GET /reports/weekly` | Week buckets within a month |

### 8.4 Notifications

- **In-app:** rows in `notifications` table; list via `GET /notifications`
- **Push:** optional; gated by user settings (`transferAlert`, `lowBalanceAlert`, `monthlyReport`)
- **Monthly cron:** `MonthlyReportJob` runs `0 0 1 * *` UTC (1st of each month)

---

## 9. API reference — how to use every endpoint

### 9.1 Response format (all endpoints)

**Success:**

```json
{
  "statusCode": 200,
  "message": "Login successful",
  "data": { ... }
}
```

**Error:**

```json
{
  "statusCode": 400,
  "message": "Insufficient balance",
  "data": null,
  "error": "Bad Request"
}
```

**Paginated lists** (`data` shape):

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "items": [ ... ],
    "pagination": { "page": 1, "limit": 20, "total": 45 }
  }
}
```

**Conventions:**

- Send `Content-Type: application/json`
- Money amounts: numbers in requests, **strings in responses** (e.g. `"100.50"`)
- IDs in responses: **strings**; `categoryId` in `POST /transactions`: **number**

---

### 9.2 Auth — no token required

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | `{ fullName, email, password, phone? }` | Sends verify OTP |
| POST | `/auth/verify-email` | `{ email, code }` | Returns JWT + account |
| POST | `/auth/resend-verification` | `{ email }` | Only if pending registration exists |
| POST | `/auth/login` | `{ email, password }` | Returns JWT |
| POST | `/auth/forgot-password` | `{ email }` | Sends reset OTP if user exists |
| POST | `/auth/reset-password` | `{ email, code, newPassword }` | Changes password |

**Example — register then verify:**

```http
POST /api/auth/register
{ "fullName": "John", "email": "john@example.com", "password": "securepass123" }

POST /api/auth/verify-email
{ "email": "john@example.com", "code": "123456" }
```

---

### 9.3 Auth — token required

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/logout` | Client should delete token locally |

---

### 9.4 User profile — token required

| Method | Path | Body |
|--------|------|------|
| GET | `/users/me` | — |
| PUT | `/users/me` | `{ fullName?, phone? }` |

---

### 9.5 Account — token required

| Method | Path | Returns |
|--------|------|---------|
| GET | `/account/me` | `accountNumber`, `balance` (string) |
| GET | `/account/qr` | QR image (base64) for receiving transfers |

---

### 9.6 Categories — token required

| Method | Path | Notes |
|--------|------|-------|
| GET | `/categories` | Query: `type=income\|expense` optional |
| POST | `/categories` | `{ name, type }` |
| PUT | `/categories/:id` | Rename (Transfer In/Out protected) |
| DELETE | `/categories/:id` | Soft delete |

---

### 9.7 Transactions — token required

| Method | Path | Notes |
|--------|------|-------|
| GET | `/transactions` | Filters: `type`, `categoryId`, `start`, `end`, `page`, `limit` |
| GET | `/transactions/:id` | Single detail |
| POST | `/transactions` | `{ amount, type, categoryId, date, note? }` — `categoryId` is a **number** |
| PUT | `/transactions/:id` | Manual only |
| DELETE | `/transactions/:id` | Reverses balance effect |

**Seed balance (for testing):** create an **income** transaction — balance increases immediately.

---

### 9.8 Transfer — token required

| Method | Path | Body / query |
|--------|------|--------------|
| POST | `/transfer` | `{ receiverAccountNumber, amount, note? }` |
| GET | `/transfer/history` | `direction`, `start`, `end` optional |

`receiverAccountNumber` format: `ACC-YYYYMMDD-NNNNN`

---

### 9.9 Dashboard — token required

| Method | Path | Query |
|--------|------|-------|
| GET | `/dashboard/summary` | `month`, `year` (both or neither) |
| GET | `/dashboard/recent` | `limit` (default 10, max 100) |

---

### 9.10 Reports — token required

| Method | Path | Query |
|--------|------|-------|
| GET | `/reports/monthly` | `month`, `year` (required) |
| GET | `/reports/category` | `type`, `month?`, `year?` |
| GET | `/reports/trends` | `months` (default 6, max 24) |
| GET | `/reports/weekly` | `month`, `year` (required) |

---

### 9.11 Notifications — token required

| Method | Path | Notes |
|--------|------|-------|
| GET | `/notifications` | Paginated; `isRead`, `page`, `limit` |
| PUT | `/notifications/:id/read` | Mark one read |
| PUT | `/notifications/read-all` | Mark all read |
| GET | `/notifications/settings` | Get preferences |
| POST | `/notifications/settings` | Save preferences |
| POST | `/notifications/test` | Test push (dev only unless `PUSH_TEST_ENABLED=true`) |

**Settings body example:**

```json
{
  "transferAlert": true,
  "monthlyReport": true,
  "lowBalanceAlert": true,
  "lowBalanceThreshold": 50
}
```

---

### 9.12 Devices (FCM) — token required

| Method | Path | Body |
|--------|------|------|
| POST | `/devices` | `{ fcmToken, platform: "android" }` |
| POST | `/devices/unregister` | `{ fcmToken }` |

---

### 9.13 Typical app journey (API call order)

```mermaid
flowchart TD
    A[Register] --> B[Verify email OTP]
    B --> C[Save JWT]
    C --> D[Register FCM device token]
    D --> E[GET account/me + dashboard]
    E --> F{User action}
    F --> G[Create transaction]
    F --> H[Transfer money]
    F --> I[View reports]
    H --> J[Receiver gets notification + push]
```

1. Register → verify email → store token  
2. `POST /devices` with FCM token  
3. `GET /account/me`, `GET /dashboard/summary`  
4. Daily use: transactions, transfers, notifications  
5. Logout → `POST /devices/unregister` → delete token locally  

---

## 10. Common errors and tips

| HTTP | Message | Likely cause |
|------|---------|--------------|
| 401 | Unauthorized | Missing/expired JWT |
| 400 | Insufficient balance | Expense or transfer exceeds balance |
| 400 | Invalid or expired verification code | Wrong OTP or expired (10 min) |
| 429 | Please wait Ns before requesting another code | OTP resend cooldown (60s) |
| 400 | Email already registered | Email taken |

**Tips for beginners:**

- Always read `statusCode` and `message` from the envelope — do not assume `200` means `data` is non-null.
- Use Swagger at `/docs` to try endpoints interactively (click **Authorize** and paste `Bearer <token>`).
- Regenerate `openapi.json` after code changes: `pnpm exec ts-node scripts/generate-openapi.ts`
- Never commit `.env` — use Render dashboard or `.env.example` as reference.
- Forgot-password returns success even for unknown emails — this is intentional security behavior.

---

## Related documents in this repo

| File | Contents |
|------|----------|
| `ANDROID_APP_INSTRUCTIONS.md` | Android MVI integration guide |
| `FIREBASE_NESTJS_GUIDE.md` | Deep dive on Firebase setup |
| `RENDER_DEPLOYMENT.md` | Deploy to Render.com |
| `BACKEND_RESPONSES.md` | Answers to Android team requests |
| `openapi.json` | Machine-readable full API spec |

---

*Last updated for API version 1.0 — NestJS + Prisma 7 + Firebase Admin push notifications.*
