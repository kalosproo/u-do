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
  { path: "/subscriptions", label: "Subscriptions", phase: 3 },
  { path: "/payments", label: "Payments", phase: 3 },
  { path: "/revenue", label: "Revenue", phase: 3 },
  { path: "/usage", label: "Usage", phase: 3 },
  { path: "/errors", label: "Errors", phase: 4 },
  { path: "/webhooks", label: "Webhooks", phase: 4 },
  { path: "/limits", label: "Limits", phase: 4 },
  { path: "/audit", label: "Audit", phase: 4 },
  { path: "/reports", label: "Reports", phase: 5 },
  { path: "/settings", label: "Settings", phase: 5 },
];
