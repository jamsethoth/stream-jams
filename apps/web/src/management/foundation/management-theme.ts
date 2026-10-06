import { createTheme, defaultVariantColorsResolver, type CSSVariablesResolver } from "@mantine/core";

// Semantic CSS tokens remain the only authored palette, including portal surfaces.
export const managementTheme = createTheme({
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontFamily: "inherit" },
  defaultRadius: "sm",
  radius: { sm: "6px", md: "8px" },
  respectReducedMotion: true,
  primaryColor: "teal",
  variantColorResolver(input) {
    const semantic = ({ teal: "accent", green: "positive", yellow: "warning", red: "negative", blue: "info" } as Record<string, string>)[input.color ?? "teal"];
    if (semantic === undefined) return defaultVariantColorsResolver(input);
    const color = `var(--color-${semantic})`;
    const hover = `var(--color-${semantic === "accent" || semantic === "negative" ? `${semantic}-hover` : semantic})`;
    if (input.variant === "filled") return { background: color, hover, color: "var(--color-on-action)", border: "transparent" };
    if (input.variant === "light") return { background: `var(--color-${semantic}-soft)`, hover: `var(--color-${semantic}-soft)`, color, border: "transparent" };
    if (input.variant === "outline") return { background: "var(--color-surface)", hover: "var(--color-surface-subtle)", color, border: color };
    if (input.variant === "default") return { background: "var(--color-surface)", hover: "var(--color-surface-subtle)", color: "var(--color-text)", border: "var(--color-border-strong)" };
    return { background: "transparent", hover: `var(--color-${semantic}-soft)`, color, border: "transparent" };
  },
  components: {
    // Mantine UnstyledButton defaults native commands to type="button";
    // explicit type="submit" is preserved by direct Button/ActionIcon props.
    Button: { defaultProps: { size: "sm" }, classNames: { root: "management-command", label: "management-command__label" } },
    ActionIcon: { defaultProps: { size: "lg" } },
    Input: { defaultProps: { size: "sm" } },
    Modal: { defaultProps: { zIndex: 1000 }, classNames: { title: "management-modal-heading" } },
    Menu: { defaultProps: { zIndex: 1100, withinPortal: true }, classNames: { dropdown: "management-menu", item: "management-menu__item" } },
    Select: { defaultProps: { comboboxProps: { zIndex: 1200, withinPortal: true } } }
  }
});

export const managementCssVariables: CSSVariablesResolver = () => ({
  variables: {
    "--mantine-color-body": "var(--color-canvas)",
    "--mantine-color-text": "var(--color-text)",
    "--mantine-color-dimmed": "var(--color-text-muted)",
    "--mantine-color-error": "var(--color-negative)",
    "--mantine-color-placeholder": "var(--color-text-muted)",
    "--mantine-color-default": "var(--color-surface)",
    "--mantine-color-default-hover": "var(--color-surface-subtle)",
    "--mantine-color-default-color": "var(--color-text)",
    "--mantine-color-default-border": "var(--color-border-strong)",
    "--mantine-primary-color-filled": "var(--color-accent)",
    "--mantine-primary-color-filled-hover": "var(--color-accent-hover)",
    "--mantine-primary-color-light": "var(--color-accent-soft)",
    "--mantine-primary-color-light-color": "var(--color-accent)",
    "--mantine-color-anchor": "var(--color-accent)"
  },
  light: {}, dark: {}
});
