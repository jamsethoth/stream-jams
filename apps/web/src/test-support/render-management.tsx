import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ManagementPresentationProvider } from "../management/foundation/ManagementPresentationProvider.js";

// Retain real portals and focus; never use Mantine env="test" here.
export function renderManagement(ui: ReactElement, options?: RenderOptions): RenderResult {
  const Wrapper = options?.wrapper;
  function Providers({ children }: { readonly children: ReactNode }) {
    const content = <ManagementPresentationProvider>{children}</ManagementPresentationProvider>;
    return Wrapper === undefined ? content : <Wrapper>{content}</Wrapper>;
  }
  return render(ui, { ...options, wrapper: Providers });
}
