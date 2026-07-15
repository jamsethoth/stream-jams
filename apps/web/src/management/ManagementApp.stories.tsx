import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementApp, type ManagementAppProps } from "./ManagementApp.js";
import { createStoryAssetApi, createStoryManagementApi } from "../stories/mock-apis.js";

const meta = {
  title: "Management/ManagementApp",
  component: ManagementApp,
  parameters: {
    docs: {
      description: {
        component: "Full management shell with the real navigation and panel routing."
      }
    }
  }
} satisfies Meta<typeof ManagementApp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullShell: Story = {
  args: {
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  render: (args) => <ManagementAppAtRoute args={args} path="/" />,
  parameters: {
    docs: {
      description: {
        story: "Use this to inspect the setup and configuration shell before drilling into individual pages."
      }
    }
  }
};

export const NestedAlerts: Story = {
  args: {
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  render: (args) => <ManagementAppAtRoute args={args} path="/manage/modules/alerts" />,
  parameters: {
    docs: {
      description: {
        story: "Nested Modules and Alerts selection with the alert-set workspace and breadcrumb context."
      }
    }
  }
};

function ManagementAppAtRoute({ args, path }: { readonly args: ManagementAppProps; readonly path: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", path);
    setReady(true);
  }, [path]);
  return ready ? <ManagementApp {...args} /> : null;
}
