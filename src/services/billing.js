import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "./firebase";

/**
 * Upgrading to Pro through Razorpay Checkout.
 *
 * The browser only collects the payment. It never decides who is Pro: the
 * server starts the subscription, Razorpay's signed webhook activates it, and
 * the Plan card follows billing/{uid} as it changes. Closing this tab mid-way
 * loses nothing — the webhook still arrives.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading;

const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout didn't load.")));
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Couldn't reach the payment page. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
};

/**
 * Pro's price, or null while Pro isn't on sale. Sale needs both a price and
 * a Razorpay plan id at planLimits/pro; until then the app offers nothing.
 */
export const readProOffer = async () => {
  const snapshot = await getDoc(doc(db, "planLimits", "pro"));
  const pro = snapshot.exists() ? snapshot.data() : {};
  const onSale = typeof pro.priceMinor === "number" && pro.priceMinor > 0 && Boolean(pro.razorpayPlanId);
  return onSale ? { priceMinor: pro.priceMinor, currency: pro.currency || "INR", interval: pro.interval || "month" } : null;
};

const message = (error, fallback) => error?.message || fallback;

/**
 * Opens Checkout. Resolves "paid" when Razorpay reports the payment went
 * through (the plan follows once the webhook lands), "closed" if the person
 * backed out.
 */
export const startPro = async (user) => {
  const [Razorpay, created] = await Promise.all([
    loadCheckout(),
    httpsCallable(functions, "createProSubscription")().catch((error) => {
      throw new Error(message(error, "Couldn't start checkout."));
    }),
  ]);
  const { subscriptionId, keyId } = created.data;

  // A failed attempt stays inside Checkout, which shows why and lets them retry.
  return new Promise((resolve) => {
    const checkout = new Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "U.Do",
      description: "U.Do Pro",
      prefill: { name: user?.displayName || "", email: user?.email || "" },
      theme: { color: "#111111" },
      handler: () => resolve("paid"),
      modal: { ondismiss: () => resolve("closed") },
    });
    checkout.open();
  });
};

/** Pro until the end of the period already paid for, then Free. */
export const cancelPro = async () => {
  try {
    await httpsCallable(functions, "cancelProSubscription")();
  } catch (error) {
    throw new Error(message(error, "Couldn't cancel right now."));
  }
};
