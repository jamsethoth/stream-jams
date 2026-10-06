import { Button, Menu } from "@mantine/core";
import { useRef, useState } from "react";

export interface ActionMenuItem {
  readonly accessibleLabel: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: "default" | "danger";
}
export interface ActionMenuProps {
  readonly items: readonly ActionMenuItem[];
  readonly label: string;
  readonly triggerClassName?: string;
  readonly triggerLabel?: string;
}
export function ActionMenu({ items, label, triggerClassName, triggerLabel = "More" }: ActionMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const firstEnabled = items.findIndex(item => !item.disabled);
  return <Menu opened={opened} onChange={setOpened} position="bottom-end" loop withinPortal returnFocus={false} withInitialFocusPlaceholder={false} transitionProps={{ duration: 0 }}>
    <Menu.Target>
      <Button aria-label={label} className={triggerClassName} ref={trigger} variant="default" onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpened(true); }
      }}>{triggerLabel}</Button>
    </Menu.Target>
    <Menu.Dropdown aria-label={label} onKeyDown={(event) => {
      if (event.key === "Escape") trigger.current?.focus();
    }}>
      {items.map((item, index) => <Menu.Item key={item.accessibleLabel} aria-label={item.accessibleLabel} disabled={item.disabled ?? false} data-autofocus={index === firstEnabled || undefined} data-danger={item.tone === "danger" || undefined} onClick={() => {
        // Mantine's delayed menu returnFocus would steal focus from a new modal.
        // Give the new modal a valid workflow trigger before running the action.
        trigger.current?.focus();
        setOpened(false);
        item.onSelect();
      }}>{item.label}</Menu.Item>)}
    </Menu.Dropdown>
  </Menu>;
}
