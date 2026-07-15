import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementApp, type ManagementAppProps } from "./ManagementApp.js";
import { createStoryAlertApi, createStoryAssetApi, createStoryManagementApi } from "../stories/mock-apis.js";

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
    alertApi: createStoryAlertApi(),
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  render: (args) => <ManagementAppAtRoute args={args} path="/" />,
  parameters: {
    docs: {
      description: {
        story: "Use this to inspect the default operator shell before drilling into individual panel states."
      }
    }
  }
};

export const NestedAlerts: Story = {
  args: {
    alertApi: createStoryAlertApi(),
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  render: (args) => <ManagementAppAtRoute args={args} path="/modules/alerts" />,
  parameters: {
    docs: {
      description: {
        story: "Nested Modules and Alerts selection with breadcrumb and the temporary alert configuration adapter."
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
