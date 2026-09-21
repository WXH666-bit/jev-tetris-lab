import { createContext } from "react";
import type { Quality } from "./tokens";
export const VisualContext = createContext<Quality>("enhanced");
