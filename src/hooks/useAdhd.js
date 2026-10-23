import { useContext } from "react";

import { AdhdContext } from "../context/adhdContext";

export const useAdhd = () => useContext(AdhdContext);
