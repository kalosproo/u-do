import { FieldValue } from "firebase-admin/firestore";

/**
 * adminAuditLogs is append-only: rules deny every client write, and nothing in
 * this codebase updates or deletes an entry. An admin action that changes state
 * writes here in the same call that performs it.
 */
export const writeAuditLog = async (db, {
  admin,
  action,
  targetUid = null,
  metadata = {},
  outcome = "success",
}) => {
  await db.collection("adminAuditLogs").add({
    adminUid: admin.uid,
    adminRole: admin.role,
    adminEmail: admin.email,
    action,
    targetUid,
    metadata,
    outcome,
    requestId: admin.requestId,
    createdAt: FieldValue.serverTimestamp(),
  });
};

/**
 * A read that touched another person's account is worth recording too, but at
 * a lower volume than every list refresh — so this only logs detail views.
 */
export const writeAccessLog = (db, { admin, targetUid, surface }) =>
  writeAuditLog(db, {
    admin,
    action: "user.view",
    targetUid,
    metadata: { surface },
  });
