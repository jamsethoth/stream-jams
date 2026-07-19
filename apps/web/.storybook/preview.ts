import type { Preview } from "@storybook/react-vite";
import "../src/App.css";

const rtlLanguages = new Set(["ar", "fa", "he", "ur"]);

const preview: Preview = {
  initialGlobals: { locale: "en" },
  globalTypes: {
    locale: {
      description: "Preview language and direction",
      toolbar: {
        icon: "globe",
        items: [
          { value: "en", title: "English (LTR)" },
          { value: "ar", title: "Arabic (RTL)" }
        ]
      }
    }
  },
  decorators: [
    (Story, context) => {
      const locale = typeof context.globals.locale === "string" ? context.globals.locale : "en";
      if (typeof document !== "undefined") {
        document.documentElement.lang = locale;
        document.documentElement.dir = rtlLanguages.has(locale.split("-")[0]?.toLowerCase() ?? "en") ? "rtl" : "ltr";
      }
      return Story();
    }
  ],
  parameters: {
    a11y: {
      context: "#storybook-root",
      config: {
        rules: [
          {
            id: "region",
            enabled: false
          }
        ]
      }
    }
  }
};

export default preview;
