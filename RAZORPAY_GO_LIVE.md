# Take U.Do Pro live with Razorpay

Steps 1–4 require Rahul's own Razorpay account and access to the target Firebase project. An agent cannot perform these steps on his behalf. Start in Razorpay **Test Mode** with a U.Do test deployment pointed at a test Firebase project.

1. **Set the monthly Pro price.** Decide the amount in INR and convert it to paise. In Firestore, set `priceMinor` on the `planLimits/pro` document to that positive integer. The field path is `planLimits/pro.priceMinor`. [U.Do plan schema](functions/src/schema/plans.js)

2. **Create the matching Razorpay Plan.** In Rahul's Razorpay Dashboard, open **Subscriptions → Plans** and create a monthly INR plan. Check that the amount shown in rupees matches the Firestore amount in paise. Copy the generated Plan ID into the string field `planLimits/pro.razorpayPlanId`. [Razorpay plan setup](https://razorpay.com/docs/payments/subscriptions/create-plans/)

3. **Set the three Firebase secrets.** Use the API key ID and key secret from the current Razorpay mode. Choose a separate webhook signing secret of at least 16 characters for step 4. From the repo root, replace the project placeholder and enter each value at its CLI prompt.

   ```sh
   firebase functions:secrets:set RAZORPAY_KEY_ID --project "<FIREBASE_PROJECT_ID>"
   firebase functions:secrets:set RAZORPAY_KEY_SECRET --project "<FIREBASE_PROJECT_ID>"
   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project "<FIREBASE_PROJECT_ID>"
   ```

   Redeploy the functions that read these secrets so they pick up the new versions. [Firebase secret management](https://firebase.google.com/docs/functions/config-env#managing_secrets)

   ```sh
   firebase deploy --only "functions:createProSubscription,functions:cancelProSubscription,functions:deleteMyAccount,functions:razorpayWebhook" --project "<FIREBASE_PROJECT_ID>"
   ```

4. **Register the webhook.** Copy the deployed HTTPS trigger URL for `razorpayWebhook` from Firebase. In the same Razorpay mode, open **Account & Settings → Webhooks**, add that URL and enter the same webhook signing secret. Select the subscription lifecycle events, including `subscription.activated`, as well as `payment.captured` and `payment.failed`. [U.Do webhook handler](functions/src/billing/razorpay.js) · [Razorpay webhook setup](https://razorpay.com/docs/webhooks/setup-edit-payments/)

5. **Verify one subscription end to end in Test Mode.** Sign in to U.Do as a Free test user, select **Upgrade to Pro** and finish Checkout with a Razorpay test payment method. In Razorpay, confirm the active subscription's webhook was delivered successfully. In the test project's Firestore, check that `webhookEvents/<EVENT_ID>.status` is `processed` and that `billing/<TEST_UID>.planId` changed from `free` to `pro` with `subscriptionStatus` set to `active`. [U.Do event handling](functions/src/billing/razorpayCore.js)

After the test passes, use **Live Mode** and the production Firebase project. Set the agreed price, create the matching live Plan, install the live API keys and a separate live webhook secret, redeploy the functions and register the production webhook. Publish the live Plan ID at `planLimits/pro.razorpayPlanId` when the live webhook is ready to receive subscriptions.
