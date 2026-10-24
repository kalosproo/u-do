import { useEffect, useState } from "react";

import { keepWarm, readWarm } from "../../utils/warm";

/** Like useState(null), but starts from what this screen showed last time. */
export function useWarm(key) {
  const [value, setValue] = useState(() => readWarm(key) ?? null);
  useEffect(() => keepWarm(key, value), [key, value]);
  return [value, setValue];
}
