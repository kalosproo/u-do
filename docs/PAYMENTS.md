# Payments (Pro via Razorpay)

Pro is **off until you switch it on**. Until all of the steps below are done,
the app shows no Plan card to Free accounts and the functions refuse to start
a checkout — nothing can be charged by accident.

## How it works

1. Profile → **Upgrade to Pro** calls `createProSubscription`. The server
   creates a Razorpay subscription with the account's uid in `notes.uid`.
2. Razorpay Checkout opens in the browser and collects the payment.
3. Razorpay calls `razorpayWebhook`. The function checks the signature, then
   writes `subscriptions/{id}`, `billing/{uid}` and `payments/{id}`.
   **Only the webhook makes an account Pro** — never the browser.
4. Profile → **Cancel Pro** calls `cancelProSubscription`: Pro until the end
   of the paid period, then Free.
5. Deleting an account cancels a live subscription immediately, before any
   data is deleted. If Razorpay can't be reached, the deletion doesn't start.

Each webhook event id is recorded once in `webhookEvents` (type and outcome
only, never the payload), so Razorpay's retries are never applied twice.

## Switch it on

1. **Razorpay dashboard → Subscriptions → Plans**: create a monthly plan at
   the Pro price. Copy its id (`plan_…`).
2. **Razorpay → Settings → API keys**: generate a key pair.
3. **Razorpay → Settings → Webhooks**: add
   `https://<region>-<project>.cloudfunctions.net/razorpayWebhook`
   (the URL `firebase deploy` prints), with a long random secret
   (at least 16 characters) and these events:
   `subscription.activated`, `subscription.charged`, `subscription.halted`,
   `subscription.cancelled`, `subscription.completed`, `payment.failed`,
   `payment.captured`.
4. Store the three secrets — they live in Secret Manager, never in the repo
   or the app:

   ```sh
   firebase functions:secrets:set RAZORPAY_KEY_ID
   firebase functions:secrets:set RAZORPAY_KEY_SECRET
   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
   ```

5. In Firestore, on `planLimits/pro`, set:
   - `priceMinor` — the price in **paise** (₹99 → `9900`)
   - `razorpayPlanId` — the `plan_…` id from step 1
6. `firebase deploy --only functions`

The Plan card appears for Free accounts as soon as step 5 is saved.

### Deploying before you sell Pro

`firebase deploy` asks for every secret a function declares. If you're not
selling yet, enter `none` for all three. That is safe: no checkout starts
without step 5, and the webhook refuses everything while its secret is
shorter than 16 characters.

## Test mode first

Use Razorpay **test** keys and a test plan for steps 1–5, buy Pro with a
test card, and watch Profile flip to Pro once the webhook lands. Then cancel
and check it says "Pro until …". Switch to live keys only after that works.

## Android app

Google Play requires Play Billing for subscriptions bought inside an app.
The Plan card therefore never offers an upgrade inside the Android app (it
detects the `android-app://` referrer); people upgrade on the website, and
Pro then applies everywhere they sign in.

## Not verified here

- No real or test-mode Razorpay call has been made from this repo — the
  network to Razorpay isn't reachable from where this was built. The webhook
  handling, signature checks and deletion-cancel were tested against the
  Firestore emulator with Razorpay faked (`npm run test:functions`).
- Checkout opening in a real browser is **UNVERIFIED** until step "Test mode
  first" above is done.
