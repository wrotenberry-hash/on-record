"use client";

/** Opens the browser's print box, where "Save as PDF" is one of the printers. */
export function PrintButton() {
  return <button type="button" className="office-button" onClick={() => window.print()}>Print or save as PDF</button>;
}
