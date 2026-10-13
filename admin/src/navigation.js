/**
 * The console's map, kept out of the component file so that editing a label
 * does not blow away the shell's state on every hot reload.
 *
 * Sections without a screen stay listed and marked. Hiding them would make the
 * console look finished when it isn't, and while you are the only operator the
 * phase you are in is useful information.
 */
export const SECTIONS = [
  { path: "/", label: "Overview", built: true, end: true },
  { path: "/users", label: "Users", built: true },
  { path: "/activity", label: "Activity", built: true },
  { path: "/subscriptions", label: "Subscriptions", built: true },
  { path: "/payments", label: "Payments", built: true },
  { path: "/revenue", label: "Revenue", built: true },
  { path: "/usage", label: "Usage", built: true },
  { path: "/errors", label: "Errors", built: true },
  { path: "/webhooks", label: "Webhooks", built: true },
  { path: "/limits", label: "Limits", built: true },
  { path: "/audit", label: "Audit", built: true },
  { path: "/reports", label: "Reports", built: true },
  { path: "/settings", label: "Settings", built: true },
];
