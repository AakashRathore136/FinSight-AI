import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/src/lib/themeContext";
import { Button } from "@/src/components/ui/button";

type ThemeOption = "dark" | "light" | "system";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Cycle through themes: dark -> light -> system -> dark
  const cycleTheme = () => {
    const themes: ThemeOption[] = ["dark", "light", "system"];
    const currentIndex = themes.indexOf(theme as ThemeOption);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
  };

  const getIcon = () => {
    if (theme === "system") {
      return <Monitor className="h-4 w-4" />;
    }
    return theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />;
  };

  const getLabel = () => {
    if (theme === "system") return "Switch to dark mode";
    return theme === "dark" ? "Switch to light mode" : "Switch to system mode";
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className="h-9 w-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : theme === "light" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
    </Button>
  );
}
