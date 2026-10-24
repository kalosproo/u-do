import { useEffect, useRef, useState } from "react";

/** A toast that clears itself; set it again to show another. */
export function useToast(ms = 4000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (message, onUndo) => {
    clearTimeout(timer.current);
    setToast({ message, onUndo });
    timer.current = setTimeout(() => setToast(null), ms);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setToast(null);
  };
  return [toast, show, hide];
}
