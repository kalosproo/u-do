# Android app

U.Do ships to the Play Store as a **Trusted Web Activity (TWA)**: a small
Android app that opens https://u-do-sigma.vercel.app full-screen in Chrome,
with no browser bar. It is Google's supported way to publish a web app.

What that means in practice:

- **No second codebase.** Every website deploy updates the app instantly. No
  Play Store review for a bug fix.
- **Push notifications work.** The app delegates them to Chrome, so the
  reminders U.Do already sends arrive as the app's own notifications.
- **Sign-in, the AI assistant and offline caching** work exactly as on the
  web.

The whole app is described by one file, [`android/twa-manifest.json`](../android/twa-manifest.json).
The Android project is generated from it by Bubblewrap, Google's tool for
TWAs, and is not committed — regenerate it rather than editing it.

## Build it (once, on any computer with Node)

```bash
npm install -g @bubblewrap/cli
cd android
bubblewrap build
```

The first run offers to download a JDK and the Android SDK into
`~/.bubblewrap` — say yes. It then asks to **create a signing key** at
`../../u-do-upload.keystore` (outside the repository, on purpose) and for two
passwords.

> **Keep the keystore file and both passwords somewhere safe and private.**
> Every future update must be signed with this same key. Never commit it —
> `.gitignore` already refuses `*.keystore`.

You get two files in `android/`:

| File | Use |
| --- | --- |
| `app-release-bundle.aab` | Upload to the Play Store |
| `app-release-signed.apk` | Install directly on a phone to test |

## Prove the app and the website belong together

Without this, Android shows a browser bar at the top of the app.

1. After the first build, Bubblewrap writes `android/assetlinks.json`. Copy
   its contents over [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json)
   (which is `[]` — "no app linked" — until then).
2. In the Play Console, open **Test and release → App integrity → App
   signing** and copy the **SHA-256** of the *app signing key*. Google re-signs
   Play installs with its own key, so add that one too:

   ```bash
   bubblewrap fingerprint add <SHA-256 from the Play Console>
   bubblewrap fingerprint generateAssetLinks
   ```

   and copy the regenerated file over `public/.well-known/assetlinks.json`
   again.
3. Deploy the website. Check it is live:
   https://u-do-sigma.vercel.app/.well-known/assetlinks.json

## Play Store listing — what Google will ask for

| Asked for | Answer |
| --- | --- |
| Privacy policy URL | https://u-do-sigma.vercel.app/privacy |
| Account deletion | In-app: Profile → Delete account. Web: email the address in the privacy policy's "Who runs U.Do" section. |
| Data safety | Email, name and photo (from Google sign-in); user content (tasks, habits, plans, finance entries); app activity counts; crash logs (no account id). Data is encrypted in transit; users can delete it. Not sold, not shared for advertising beyond AdSense on the web. |
| Ads | Yes — AdSense shows on the Free plan. |
| Target audience | 13+ |

## Updating

- **Website changes:** nothing to do. The app shows the new site immediately.
- **App changes** (name, icon, colours, shortcuts): edit
  `android/twa-manifest.json`, raise `appVersionCode` by 1, run
  `bubblewrap update && bubblewrap build`, upload the new `.aab`.

## Not done here, and why

The app could not be built in the environment it was prepared in: Google's
Android download server was unreachable there, so the SDK could not be
installed. The configuration was validated by Bubblewrap and the Android
project generated from it successfully (target SDK 36, notifications
enabled); the final compile and signing happen on your machine with the
commands above.
