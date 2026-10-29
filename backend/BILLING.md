# Billing (Stripe) â€” runbook

Breaklytix already has a complete Stripe Billing integration in code. It is
**not configured in production**: no `STRIPE_*` variables exist in the Vercel
`backend` project, so every checkout attempt currently returns `503` with
"Payments are not available yet". Nothing in this file requires a code change â€”
it is the checklist to switch the existing integration on.

Status on 2026-10-29:

| Item | Status |
|---|---|
| Checkout / portal / webhook routes | Present and deployed (`backend-virid-ten-43.vercel.app`) |
| Webhook rejects unsigned requests | Verified: `POST /billing/webhooks/stripe/billing` â†’ `400` |
| Unit tests (entitlement, idempotency, config guards) | 16 passed (`tests/test_billing.py`) |
| Full backend suite | 313 passed |
| Live Stripe keys | **NOT CONFIGURED** |
| Real checkout â†’ payment â†’ webhook end-to-end | **NOT TESTED** |

## What the code does

| Concern | Where |
|---|---|
| Checkout session, customer creation | `app/billing.py::create_checkout_session` |
| Billing Portal (cards, invoices, cancel) | `app/billing.py::create_billing_portal_session` |
| Webhook verification + idempotency | `app/billing.py::process_stripe_webhook` |
| Entitlement (10 / 50 / unlimited APIs) | `app/billing.py::PLAN_LIMITS`, `check_plan_limit` |
| Routes | `app/routers/billing.py` (`/billing/*`) |

Endpoints:

```
POST /billing/create-checkout-session   (authenticated)
GET  /billing/portal                    (authenticated)
GET  /billing/status                    (authenticated)
POST /billing/webhooks/stripe/billing   (Stripe signature required)
```

Webhook events handled: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`, `invoice.paid`, `invoice.payment_succeeded`.

## 1. Create the products and prices

Stripe Dashboard â†’ **Product catalog** â†’ add three products, each with a
**recurring monthly** price in USD matching the public pricing page:

| Plan | Amount | Reciprocal limit |
|---|---|---|
| Starter | $500 / month | 10 monitored APIs |
| Growth | $2,000 / month | 50 monitored APIs |
| Enterprise | $10,000 / month | unlimited (`-1`) |

Copy each `price_...` id. Do not create new amounts that differ from
`/pricing` â€” the site would then advertise a price Stripe does not charge.

## 2. Set the backend environment variables

Vercel â†’ project **backend** â†’ Settings â†’ Environment Variables â†’ Production
(and Preview if you want to test there):

```
STRIPE_SECRET_KEY=sk_live_...        # or sk_test_... while testing
STRIPE_WEBHOOK_SECRET=whsec_...      # from step 3
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

Never commit these and never paste them into chat. After adding them, redeploy
the backend so the process picks them up.

Local development: put the same keys in `backend/.env` (gitignored).

## 3. Register the webhook

Stripe Dashboard â†’ **Developers â†’ Webhooks â†’ Add endpoint**:

```
https://backend-virid-ten-43.vercel.app/billing/webhooks/stripe/billing
```

Events to send:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.paid`

`invoice.payment_succeeded` is also handled, but `invoice.paid` is the
canonical event; subscribing to both is harmless because events are deduped by
`stripe_event_id`.

The signing secret for that endpoint is `STRIPE_WEBHOOK_SECRET`. The route
refuses to process anything without a valid signature.

### Local webhook testing (no production keys needed)

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:8000/billing/webhooks/stripe/billing
# copy the printed whsec_... into backend/.env as STRIPE_WEBHOOK_SECRET
```

Then buy a test subscription with card `4242 4242 4242 4242` (any future
expiry, any CVC) in Stripe **test mode**.

## 4. Database

`db/schema_phase3.sql` already defines everything billing needs:

- `users.stripe_customer_id`, `users.stripe_subscription_id`
- `users.plan_status`, `users.monitored_api_limit`
- `plan_usage` (one row per user per billing period)
- `stripe_webhook_events.stripe_event_id text unique` (idempotency)

Apply it once if it has not been applied:

```powershell
# Supabase SQL editor, or:
psql "$env:DATABASE_URL" -f db/schema_phase3.sql
```

No migration is required for this change set.

## 5. Verify (test mode, before live keys)

1. Log in as a normal user, open `/dashboard/billing`.
2. Click **Upgrade** â†’ Stripe Checkout opens with the correct amount.
3. Pay with `4242 4242 4242 4242`.
4. Stripe redirects to `/dashboard/billing?success=true`.
5. Stripe CLI shows `checkout.session.completed` â†’ `200`; the DB row for that
   user has `plan_status=active`, `stripe_subscription_id=sub_...`,
   `monitored_api_limit` = the plan value.
6. In Stripe, cancel the subscription â†’ `customer.subscription.deleted` â†’ DB
   shows `plan_status=canceled`, limit `0`.
7. Retry a failed card â†’ `invoice.payment_failed` sets `past_due`; a successful
   retry (`invoice.paid`) restores `active`.

Nothing above has been run against a real Stripe account yet. Treat the
integration as **unverified until these seven steps pass in test mode**.

## 6. Behaviour you should know

- **Trial semantics.** New accounts get a 10-day unlimited in-app trial
  (`created_at + 10 days`). Stripe Checkout does **not** set
  `trial_period_days`, so a subscription purchased on day 3 starts billing
  immediately. The pricing page says "Start Free Trial" on every card; for an
  already-registered user that click goes straight to Checkout. If you want a
  card-required trial instead, that is a product decision and a code change.
- **Dunning.** `past_due` keeps the existing plan limit while Stripe retries the
  card. Only `canceled` / `incomplete*` / `paused` drop the limit to `0`.
- **Unknown prices.** If a subscription bills at a price id that is not in the
  env vars and carries no `plan` metadata, the stored limit is left untouched
  and a warning is logged. The old behaviour silently downgraded to Starter.
- **Config guards.** Missing `STRIPE_SECRET_KEY` or a plan price id returns
  `503` with a user-facing message; missing `STRIPE_WEBHOOK_SECRET` makes the
  webhook return `503`. Environment variable names are only written to logs.
- **Refunds and taxes** are not implemented in code; use the Stripe Dashboard
  or the Billing Portal.
- **Stripe availability.** Stripe only onboards businesses in supported
  countries (https://stripe.com/global). Pakistan is not on that list, so a
  Pakistan-registered entity cannot complete Stripe onboarding; a foreign
  entity (US LLC / UK Ltd) with its own tax id and bank account is the only
  legitimate route, and that is a legal/tax decision, not a code change.
  Merchant-of-record alternatives that list Pakistan as a supported seller
  country (Paddle, verified 2026-10-29) would need their own adapter â€” none is
  implemented. Do not promise customers card payments before the account is
  approved.

## 7. If Stripe is not an option

Do not put fake keys in production to "make the button work". The options, in
order of effort:

| Option | What it needs | Status |
|---|---|---|
| Stripe + foreign entity | Incorporation, foreign tax id, foreign bank account | Code ready, account **BLOCKED** for a Pakistan-based entity |
| Paddle (merchant of record) | Paddle seller account + product/price ids; adapter now implemented (`app/paddle_billing.py`, `PADDLE.md`) | Implemented; configure `PAYMENT_PROVIDER=paddle` + keys |
| Local gateway (e.g. Safepay) | Merchant account + adapter | Not implemented |

Until one of these is approved and configured, checkout correctly returns
`503` and the pricing page tells the customer to contact support.

## 8. Security notes

- Return URLs are pinned to the configured frontend origin; an authenticated
  user cannot turn Checkout into an open redirect.
- Webhook payloads are verified with the signing secret before any DB write.
- Event ids are unique in the database, so a retried delivery cannot grant a
  plan twice.
- A failed handler releases its idempotency claim, so Stripe's retry is
  processed rather than being swallowed as `already_processed`.
- The frontend never sees `STRIPE_SECRET_KEY`; it only receives the Checkout /
  Portal URL.
