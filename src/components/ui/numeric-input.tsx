import { forwardRef, useCallback, useEffect, useRef, type InputHTMLAttributes } from "react";

type NumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** For forms whose existing parser explicitly accepts a decimal comma. */
  allowDecimalComma?: boolean;
};

/**
 * A directly editable number: no steppers or wheel increments, and select-all
 * on entry. A native number input checks range/step constraints without exposing
 * its spinbutton UI. Values stay as strings, including an empty pending value.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput({
  allowDecimalComma = false,
  min,
  max,
  step = 1,
  required,
  disabled,
  readOnly,
  value,
  defaultValue,
  inputMode,
  onChange,
  onFocus,
  onBlur,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  ...props
}, forwardedRef) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const probeRef = useRef<HTMLInputElement | null>(null);
  const pointerEntry = useRef(false);

  const validate = useCallback((input: HTMLInputElement) => {
    input.setCustomValidity("");
    if (disabled || readOnly) return;
    const raw = input.value.trim();
    if (!raw) {
      if (required && input.value) input.setCustomValidity("Complete este campo con un número.");
      return;
    }
    const probe = probeRef.current ?? document.createElement("input");
    probeRef.current = probe;
    probe.type = "number";
    probe.min = min === undefined ? "" : String(min);
    probe.max = max === undefined ? "" : String(max);
    probe.step = String(step);
    probe.value = allowDecimalComma ? raw.replace(",", ".") : raw;
    if (!probe.value || probe.validity.badInput) input.setCustomValidity("Escriba un número válido.");
    else if (probe.validity.rangeUnderflow) input.setCustomValidity(`El valor mínimo es ${min}.`);
    else if (probe.validity.rangeOverflow) input.setCustomValidity(`El valor máximo es ${max}.`);
    else if (probe.validity.stepMismatch) input.setCustomValidity(step === 1 || step === "1" ? "Escriba un número entero." : `Use incrementos de ${step}.`);
  }, [allowDecimalComma, disabled, max, min, readOnly, required, step]);

  const attachRef = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    if (typeof forwardedRef === "function") forwardedRef(input);
    else if (forwardedRef) forwardedRef.current = input;
  }, [forwardedRef]);

  useEffect(() => {
    if (inputRef.current) validate(inputRef.current);
  }, [defaultValue, validate, value]);

  return <input
    {...props}
    ref={attachRef}
    type="text"
    inputMode={inputMode ?? (step === 1 || step === "1" ? "numeric" : "decimal")}
    min={min}
    max={max}
    step={step}
    required={required}
    disabled={disabled}
    readOnly={readOnly}
    value={value}
    defaultValue={defaultValue}
    onChange={(event) => { validate(event.currentTarget); onChange?.(event); }}
    onFocus={(event) => { event.currentTarget.select(); onFocus?.(event); }}
    onBlur={(event) => { pointerEntry.current = false; onBlur?.(event); }}
    onPointerDown={(event) => {
      pointerEntry.current = document.activeElement !== event.currentTarget;
      onPointerDown?.(event);
    }}
    onPointerUp={(event) => {
      if (pointerEntry.current) event.currentTarget.select();
      pointerEntry.current = false;
      onPointerUp?.(event);
    }}
    onPointerCancel={(event) => { pointerEntry.current = false; onPointerCancel?.(event); }}
  />;
});
