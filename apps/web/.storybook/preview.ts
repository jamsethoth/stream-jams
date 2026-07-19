import type { Preview } from "@storybook/react-vite";
import "../src/App.css";

if (typeof document !== "undefined") {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
}

const preview: Preview = {
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
