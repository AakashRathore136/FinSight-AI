import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ThemeProvider } from "./lib/themeContext.tsx";
import { ErrorBoundary } from "./components/ui/ErrorBoundary.tsx";
import "./index.css";

// Apply initial dark class before render to prevent flash
const storedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = storedTheme === "dark" || (!storedTheme && prefersDark);
if (isDark) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
