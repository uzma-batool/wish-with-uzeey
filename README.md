# wish-with-uzeey

## Local setup

Copy `.env.example` to `.env`, then replace the Stripe placeholders with your Test Mode keys and webhook signing secret. Keep `.env` private; it is excluded by `.gitignore`. A local MongoDB server can use the example URI; MongoDB Atlas can be used by replacing it with an Atlas connection string.

`PAYMENT_AMOUNT=99900` is Rs 999 in minor units. `PAYMENT_CURRENCY=pkr` sets the checkout currency. The Stripe account must support the configured currency and payment method. `STRIPE_PUBLISHABLE_KEY` is included for client-side Stripe integrations; the current hosted Checkout flow uses the secret key on the server.

Install and start the API and React app together:

```sh
npm install
npm run dev
```

Vite runs at `http://127.0.0.1:5173/` (or the next available port). Its `/api` requests are proxied to Express on port `5000` (`PORT`).

In a second terminal, install and run the Stripe CLI, then copy its printed `whsec_...` signing secret into `STRIPE_WEBHOOK_SECRET` in `.env` and restart the API:

```sh
stripe listen --forward-to localhost:5000/api/webhook
```

Use Stripe test-mode keys and test payment details during development. For production, configure the public app URL in `APP_BASE_URL` and register `POST /api/webhook` as a Stripe webhook endpoint for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

## Payment and share flow

`POST /api/wishes` validates and saves the wish with `paid: false`, creates a Stripe Checkout session, and returns its URL. The browser redirects to Stripe. A verified webhook marks the wish paid; the success page waits for this confirmation before showing the share URL. `GET /api/wishes/:id` returns content only for paid wishes, and `/view/:id` renders that page. Canceled checkout can be retried from the cancellation screen.

Local photo files are currently stored as metadata only. Upload image bytes to object storage before persisting local photos for production use.
