import type { FocusEvent, MouseEvent } from "react";

type SelectableField = HTMLInputElement | HTMLTextAreaElement;

function queueSelect(target: SelectableField) {
  const select = () => target.select();
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(select);
    return;
  }
  setTimeout(select, 0);
}

export function handleAutoSelectField(event: FocusEvent<SelectableField> | MouseEvent<SelectableField>) {
  queueSelect(event.currentTarget);
}

export const autoSelectFieldProps = {
  onFocus: handleAutoSelectField,
  onClick: handleAutoSelectField,
};
