import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PushExplorer from "./PushExplorer";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PushExplorer />
  </StrictMode>
);
