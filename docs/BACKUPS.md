# Backups

U.Do's Firestore database had **no backups at all**. One bad deploy, one buggy
migration, or one mistaken delete in the console would have destroyed every
person's tasks, habits, plans and money records permanently.

Firestore has managed backups built in, so this needs no code: two commands,
run once, by someone with Owner on the `u-do-0` project.

## Turn it on

```bash
gcloud config set project u-do-0

# 1. A daily backup of the whole database, each kept for 7 days.
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d

# 2. Point-in-time recovery: restore the database to any minute in the last 7 days.
gcloud firestore databases update \
  --database='(default)' \
  --enable-pitr
```

Check it took:

```bash
gcloud firestore backups schedules list --database='(default)'
gcloud firestore backups list --location=<your-database-location>
```

The first backup appears within a day. Your database location is shown in the
Firebase console under **Firestore → Database → (default)**, e.g. `asia-south1`.

**7 days is deliberate.** The privacy policy tells people a deleted account
survives in backups for at most 7 days. Keep the retention at 7 days or less,
or change the policy (and bump its version in `src/utils/consent.js`) first.

## Restore

A restore never overwrites the live database. It creates a **new** database,
so you can inspect it before deciding anything.

```bash
# From a backup
gcloud firestore backups list --location=<location>
gcloud firestore databases restore \
  --source-backup=projects/u-do-0/locations/<location>/backups/<backup-id> \
  --destination-database=restored-YYYYMMDD

# Or read the live database as it was at a past minute (PITR) —
# useful for recovering a few documents rather than everything:
#   any Firestore read with readTime set within the last 7 days.
```

Then copy back only what was lost. Never point the app at the restored
database without checking it: anyone who deleted their account in the gap
would be brought back.

## What this does NOT cover

- **Sign-in accounts.** Firebase Authentication is separate from Firestore and
  is not in these backups. Export it periodically:
  `firebase auth:export users.json --project u-do-0`. That file contains
  password hashes — store it somewhere private, never in this repository.
- **Your own mistakes with the console.** A backup restores data, not
  security rules or indexes; those live in this repository.

## Cost

Billed per GB stored for backups and PITR. At U.Do's current size this is a
few rupees a month. Check **Billing** in the Google Cloud console after the
first week.
