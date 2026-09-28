import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL is not set (see .env.example).");

const convex = new ConvexReactClient(url);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {/* sessionStorage: sign-in ends when the browser closes, which suits
        shared front-desk machines (plan SEC-08). */}
    <ConvexAuthProvider client={convex} storage={window.sessionStorage}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
