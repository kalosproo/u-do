import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";

import { db } from "../firebaseAdmin.js";

import { ADMIN_ROLES, requireAdmin } from "./guard.js";
import { writeAuditLog } from "./audit.js";
import { DEFAULT_USAGE, PLANS, PLAN_IDS } from "../schema/plans.js";


const monthKey = () => new Date().toISOString().slice(0, 7);

/**
 * Publishes the plan table from schema/plans.js into Firestore, where the
 * admin app and (later) the consumer app read it. Safe to run repeatedly.
 *
 * priceMinor is merged rather than overwritten once set, so seeding again
 * after you have chosen a Pro price does not wipe it back to null.
 */
export const seedPlanLimits = onCall(async (request) => {
  const admin = requireAdmin(request, { minimumRole: ADMIN_ROLES.OWNER });

  const batch = db.batch();

  for (const plan of Object.values(PLANS)) {
    const ref = db.collection("planLimits").doc(plan.planId);
    const existing = await ref.get();
    const keepPrice =
      plan.priceMinor === null && existing.exists && typeof existing.data().priceMinor === "number";

    batch.set(
      ref,
      {
        ...plan,
        priceMinor: keepPrice ? existing.data().priceMinor : plan.priceMinor,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();

  await writeAuditLog(db, {
    admin,
    action: "plans.seed",
    metadata: { planIds: Object.keys(PLANS) },
  });

  return { ok: true, planIds: Object.keys(PLANS) };
});

/**
 * Gives every existing account a billing record and a usage record.
 *
 * Without this the Overview would report zero users, because every count on
 * the dashboard is derived from `billing` rather than from Auth. Run it once
 * after deploying, then again only if you import accounts some other way.
 *
 * Existing documents are never overwritten — a user already on Pro stays on
 * Pro. Auth is paged 1000 at a time and writes go out in batches of 400, so
 * this holds steady on a large user base.
 */
export const backfillBilling = onCall({ timeoutSeconds: 540 }, async (request) => {
  const admin = requireAdmin(request, { minimumRole: ADMIN_ROLES.OWNER });

  const auth = getAuth();
  let pageToken;
  let scanned = 0;
  let created = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    pageToken = page.pageToken;
    scanned += page.users.length;

    for (let index = 0; index < page.users.length; index += 400) {
      const slice = page.users.slice(index, index + 400);
      const refs = slice.map((user) => db.collection("billing").doc(user.uid));
      const existing = await db.getAll(...refs);
      const batch = db.batch();
      let writes = 0;

      slice.forEach((user, position) => {
        if (existing[position].exists) return;

        const createdAt = user.metadata.creationTime
          ? Timestamp.fromDate(new Date(user.metadata.creationTime))
          : FieldValue.serverTimestamp();

        batch.set(refs[position], {
          uid: user.uid,
          email: user.email || null,
          planId: PLAN_IDS.FREE,
          subscriptionStatus: null,
          subscriptionId: null,
          provider: null,
          disabled: user.disabled === true,
          currentPeriodEnd: null,
          grantedProUntil: null,
          createdAt,
          updatedAt: FieldValue.serverTimestamp(),
          source: "backfill",
        });

        batch.set(
          db.collection("usageCounters").doc(user.uid),
          {
            uid: user.uid,
            counters: DEFAULT_USAGE,
            monthKey: monthKey(),
            lastActiveAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        writes += 1;
      });

      if (writes > 0) {
        await batch.commit();
        created += writes;
      }
    }
  } while (pageToken);

  await writeAuditLog(db, {
    admin,
    action: "billing.backfill",
    metadata: { scanned, created },
  });

  return { ok: true, scanned, created };
});
