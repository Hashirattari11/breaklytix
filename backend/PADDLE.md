# Paddle Billing — runbook

Breaklytix now ships a Paddle Billing adapter alongside the existing Stripe
adapter. Select the provider with `PAYMENT_PROVIDER` (`stripe` default, `paddle`
to use Paddle). Everything below assumes `PAYMENT_PROVIDER=paddle`.

Status on 2026-10-29:

| Item | Status |
|---|---|
| Paddle adapter code (`app/paddle_billing.py`) | Present |
| Checkout / portal / webhook routes | Present (`/billing/*`, `/billing/webhooks/paddle/billing`) |
| Unit tests (signature, idempotency, entitlement, checkout payload) | 15 passed (`tests/test_paddle_billing.py`) |
| Full backend suite | 330 passed |
| Paddle account + sandbox keys | **NOT CONFIGURED** (user must provide) |
| Approved domain `breaklytix.site` in Paddle | **NOT DONE** |
| Real checkout → payment → webhook end-to-end | **NOT TESTED** |

## Commercial terms (user must approve)

Paddle is a merchant of record. Before going live you must accept Paddle's
seller terms, fees (typically 5% + $0.50 per transaction, plus tax handling)
and the fact that Paddle is the legal seller of record. These are commercial
decisions, not code changes.

## 1. Create the Paddle account and sandbox

1. Sign up at https://www.paddle.com (use the same email you want for payouts).
2. Complete identity/KYC for Pakistan (Paddle supports Pakistan-based sellers;
   verified 2026-10-29 against
   https://developer.paddle.com/concepts/sell/supported-countries-locales).
3. In the dashboard, switch to **Sandbox** for all testing.

## 2. Create products and prices

Paddle Dashboard → Catalog → Products → create one product per plan, each with
a recurring monthly price in USD matching `/pricing`:

| Plan | Amount | Monitored API limit |
|---|---|---|
| Starter | $500 / month | 10 |
| Growth | $2,000 / month | 50 |
| Enterprise | $10,000 / month | unlimited (`-1`) |

Copy each `pri_...` price id.

## 3. Approve the domain

Paddle Dashboard → Checkout → Website approval → add `https://breaklytix.site`
(and `http://localhost:3000` for local testing). Paddle returns a checkout URL
only for approved domains. Until this is done, `checkout.url` creation fails.

## 4. Set backend environment variables

Vercel → project **backend** → Settings → Environment Variables → Production
(and Preview):

```
PAYMENT_PROVIDER=paddle
PADDLE_API_KEY=pdl_...                 # sandbox: test_... / live_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...   # from step 5
PADDLE_ENVIRONMENT=sandbox             # or production
PADDLE_PRICE_STARTER=pri_...
PADDLE_PRICE_GROWTH=pri_...
PADDLE_PRICE_ENTERPRISE=pri_...
```

Local dev: same keys in `backend/.env` (gitignored).

## 5. Register the webhook

Paddle Dashboard → Developer Tools → Notifications → New destination:

```
https://backend-virid-ten-43.vercel.app/billing/webhooks/paddle/billing
```

Subscribe to at least:
- `transaction.completed`
- `subscription.created`
- `subscription.updated`
- `subscription.activated`
- `subscription.past_due`
- `subscription.paused`
- `subscription.canceled`
- `subscription.resumed`

Copy the endpoint's secret key into `PADDLE_WEBHOOK_SECRET`.

### Local webhook testing (sandbox)

Paddle has a built-in webhook simulator:
Paddle Dashboard → Developer Tools → Notifications → your destination →
**Simulate event**. Pick `transaction.completed` / `subscription.created` and
send to `http://127.0.0.1:8000/billing/webhooks/paddle/billing` (via a tunnel
such as ngrok) or directly to the deployed URL.

There is no `paddle` CLI listen equivalent; use the simulator or replay a
captured payload. Verify the `Paddle-Signature` header is present and that the
endpoint returns `2xx` within 5 seconds.

## 6. Frontend environment variables

Vercel → project **autofix** (frontend) → Environment Variables:

```
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_...   # sandbox client-side token
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox      # or production
```

The `/checkout` page (`frontend/app/checkout/page.tsx`) loads Paddle.js v2 from
`https://cdn.paddle.com/paddle/v2/paddle.js`, calls `Paddle.Initialize` with
the token and `checkout.settings.successUrl`, and opens the transaction passed
via the `_ptxn` query parameter.

## 7. Database

Apply `db/migration_paddle_billing.sql` (once):

```powershell
# Supabase SQL editor, or:
psql "$env:DATABASE_URL" -f db/migration_paddle_billing.sql
```

Adds `users.paddle_customer_id`, `users.paddle_subscription_id`, and the
`paddle_webhook_events` table (idempotency by `event_id`).

## 8. Verify (sandbox, before live keys)

1. Log in, open `/dashboard/billing`, click **Upgrade** → Paddle checkout opens
   with the correct amount.
2. Pay with a Paddle sandbox test card.
3. Paddle redirects to `/checkout?_ptxn=txn_...` → checkout completes →
   `/dashboard/billing?success=true`.
4. Webhook simulator shows `transaction.completed` / `subscription.created` →
   `200`; DB row has `plan_status=active`, `paddle_subscription_id=sub_...`,
   `monitored_api_limit` = plan value.
5. In Paddle, cancel the subscription → `subscription.canceled` → DB shows
   `plan_status=canceled`, limit `0`.
6. Failed payment → `subscription.past_due` keeps the plan cap during dunning;
   a successful retry (`subscription.updated` → active) restores access.
7. Billing portal link opens the Paddle-hosted portal.

Nothing above has been run against a real Paddle account yet. Treat the adapter
as **unverified until these seven steps pass in sandbox**.

## 9. Behaviour you should know

- **Provider switch.** `PAYMENT_PROVIDER` selects the adapter. Default is
  `stripe` so existing behaviour is unchanged; set `paddle` to enable Paddle.
  Code for both providers is retained.
- **Trial semantics.** Same as Stripe path: 10-day unlimited in-app trial;
  Paddle checkout does not add a trial period, so a purchase bills immediately.
- **Dunning.** `past_due` keeps the existing plan limit while Paddle retries.
  `paused` / `canceled` drop the limit to `0`.
- **Plan mapping.** The billed price id decides the plan; `custom_data.plan`
  is only a fallback. Unknown prices leave the stored limit untouched and log
  a warning.
- **Config guards.** Missing `PADDLE_API_KEY` returns `503` with a support
  message; missing `PADDLE_WEBHOOK_SECRET` makes the webhook return `503`.
  Environment variable names are only written to logs.
- **Customer portal.** `POST /customers/{id}/portal-sessions` returns
  `urls.general.overview`; subscription deep links are included when a
  `paddle_subscription_id` exists.

## 10. Security notes

- Return URLs are pinned to the configured frontend origin (shared helper).
- Webhook payloads are verified with HMAC-SHA256 over `ts:raw_body` with a
  5-second tolerance before any DB write.
- Event ids (`notification_id`) are unique in the database, so a retried
  delivery cannot grant a plan twice.
- A failed handler releases its idempotency claim, so Paddle's retry is
  processed rather than swallowed as `already_processed`.
- The frontend never sees `PADDLE_API_KEY`; it only receives the client token
  and the checkout URL.

## 11. What is still NOT TESTED

- Any real Paddle account, keys, or webhook delivery.
- Domain approval (`breaklytix.site`) in Paddle.
- End-to-end checkout → payment → webhook → entitlement in sandbox.
- Paddle.js rendering in production browsers (CSP, script loading).
- Subscription upgrades/downgrades via the Paddle portal.
- Refunds, taxes (handled by Paddle, but not verified by us).
- Migration of existing Stripe customers to Paddle (not implemented).
