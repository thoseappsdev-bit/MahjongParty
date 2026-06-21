import React from "react";
import { createRoot } from "react-dom/client";
import "@mahjong/ui/theme.css";
import "./styles.css";
import { App } from "./App";
import { ErrorBoundary } from "./monitoring/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
