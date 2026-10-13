/** An error from a listener or a count, reduced to what an operator can act on. */
export const describe = (error) => {
  if (error?.code === "permission-denied") {
    return "This account is not allowed to read this. The admin claim may not have reached your token yet — sign out and back in.";
  }
  if (error?.code === "failed-precondition" && /index/i.test(error.message || "")) {
    return "This view needs a Firestore index. Run: firebase deploy --only firestore:indexes";
  }
  return error?.message || "Could not load this.";
};
