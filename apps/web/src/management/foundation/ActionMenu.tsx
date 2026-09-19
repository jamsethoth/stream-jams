import { createPortal } from "react-dom";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import "./action-menu.css";

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

const viewportMargin = 8;
const menuGap = 4;

export function ActionMenu({
  items,
  label,
  triggerClassName = "button button--secondary",
  triggerLabel = "More"
}: ActionMenuProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ left: 0, top: 0, visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    let active = true;

    const placeMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (trigger === null || menu === null) {
        return;
      }

      const anchor = trigger.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchor.bottom - viewportMargin;
      const spaceAbove = anchor.top - viewportMargin;
      const placeAbove = menuBounds.height > spaceBelow && spaceAbove > spaceBelow;
      const preferredTop = placeAbove
        ? anchor.top - menuGap - menuBounds.height
        : anchor.bottom + menuGap;
      const top = Math.max(
        viewportMargin,
        Math.min(preferredTop, window.innerHeight - viewportMargin - menuBounds.height)
      );
      const preferredLeft = anchor.right - menuBounds.width;
      const left = Math.max(
        viewportMargin,
        Math.min(preferredLeft, window.innerWidth - viewportMargin - menuBounds.width)
      );

      setPosition({ left, top, visibility: "visible" });
    };

    placeMenu();
    const focusFrame = window.requestAnimationFrame(() => {
      if (active) {
        menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
      }
    });

    const closeForOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    document.addEventListener("pointerdown", closeForOutsidePointer);
    return () => {
      active = false;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
      document.removeEventListener("pointerdown", closeForOutsidePointer);
    };
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const menuItems = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    let nextItem: HTMLButtonElement | undefined;

    switch (event.key) {
      case "ArrowDown":
        nextItem = menuItems[(currentIndex + 1) % menuItems.length];
        break;
      case "ArrowUp":
        nextItem = menuItems[(currentIndex - 1 + menuItems.length) % menuItems.length];
        break;
      case "Home":
        nextItem = menuItems[0];
        break;
      case "End":
        nextItem = menuItems.at(-1);
        break;
      case "Escape":
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }

    event.preventDefault();
    nextItem?.focus();
  }

  return (
    <>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={triggerClassName}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel}
      </button>
      {open
        ? createPortal(
            <div
              aria-label={label}
              className="management-action-menu"
              id={menuId}
              onKeyDown={handleMenuKeyDown}
              ref={menuRef}
              role="menu"
              style={position}
            >
              {items.map((item) => (
                <button
                  aria-label={item.accessibleLabel}
                  className={item.tone === "danger" ? "management-action-menu__item management-action-menu__item--danger" : "management-action-menu__item"}
                  disabled={item.disabled}
                  key={item.accessibleLabel}
                  onClick={() => {
                    closeAndRestoreFocus();
                    item.onSelect();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
