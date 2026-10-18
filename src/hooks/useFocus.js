import { useContext } from "react";

import { FocusContext } from "../context/focusContext";

export const useFocus = () => useContext(FocusContext);
