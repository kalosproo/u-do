# Morning summary email

An opt-in email each morning: what's due, overdue, planned, and the habits to
tick. Sent through [Resend](https://resend.com). **Off until you switch it on**
— the Profile card stays hidden and the scheduled function sends nothing.

## Rules it follows

- Only to people who switched it on (Profile → Morning email).
- Only to confirmed addresses (or Google sign-ins).
- Only on days with something on. Never an empty email.
- At most once a day, at the time each person picked, in their time zone.
- Every email has a one-tap unsubscribe that works without signing in, plus
  the `List-Unsubscribe` header, so Gmail and Apple Mail show their own button.

## Switch it on

1. Create a Resend account and **verify a domain** you own (Resend → Domains).
   Email from an unverified domain lands in spam or is refused.
2. Create an API key (Resend → API Keys).
3. Set the secrets and the sender:

   ```sh
   firebase functions:secrets:set RESEND_API_KEY
   firebase functions:secrets:set EMAIL_LINK_SECRET   # any long random string, 16+ characters
   ```

   and put the sender in `functions/.env`:

   ```
   EMAIL_FROM=U.Do <hello@your-domain.com>
   ```

4. `firebase deploy --only functions,firestore:rules`
5. In Firestore, create the document **`appConfig/email`** with
   `enabled: true`. The Morning email card appears in Profile.

Not selling email yet but want to deploy? When deploy asks for the two
secrets, enter `none`. Nothing is sent while `EMAIL_FROM` is empty or the link
secret is shorter than 16 characters.

## Not verified here

No real email has been sent from this repo — Resend isn't reachable from where
it was built. The composer, the sending window and the unsubscribe link are
tested (`npm test`, `npm run test:functions`).
