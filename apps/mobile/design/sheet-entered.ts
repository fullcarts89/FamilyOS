import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';

/**
 * Inside a Sheet: whether it has finished coming on screen. Null outside any sheet.
 *
 * A field that asks for the keyboard the moment a sheet mounts leaves the sheet behind the
 * keyboard on iPhone: iOS raises the keyboard before the sheet's KeyboardAvoidingView has
 * measured itself, so it never lifts the sheet (reported 2026-11-25: "Add a visitor" showed
 * only the keyboard). Fields in a sheet wait for this instead.
 */
export const SheetEnteredContext = createContext<boolean | null>(null);

export const useSheetEntered = (): boolean | null => useContext(SheetEnteredContext);

/**
 * `autoFocus` that's safe in a sheet: outside one it's the field's own `autoFocus`; inside one
 * the field is focused once the sheet is on screen. Pass the result's `autoFocus` to the input.
 */
export function useSheetAutoFocus<T extends { focus: () => void }>(
  ref: RefObject<T | null>,
  wanted: boolean | undefined,
): { autoFocus: boolean | undefined } {
  const entered = useSheetEntered();
  const inSheet = entered !== null;
  const done = useRef(false);
  useEffect(() => {
    if (!wanted || !inSheet || !entered || done.current) return;
    done.current = true;
    ref.current?.focus();
  }, [wanted, inSheet, entered, ref]);
  return { autoFocus: inSheet ? false : wanted };
}
