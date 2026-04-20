"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeDisplayProps {
  barcodeNumber?: string;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
}

export default function BarcodeDisplay({ barcodeNumber, size = "md", showNumber = true }: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeNumber && svgRef.current) {
      try {
        JsBarcode(svgRef.current, barcodeNumber, {
          format: "EAN13",
          width: size === "sm" ? 1 : size === "lg" ? 3 : 2,
          height: size === "sm" ? 40 : size === "lg" ? 80 : 60,
          displayValue: false,
          margin: 5,
        });
      } catch (err) {
        console.error("Error generating barcode:", err);
      }
    }
  }, [barcodeNumber, size]);

  if (!barcodeNumber) {
    return <div className="text-xs text-gray-400">No barcode</div>;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg ref={svgRef} />
      {showNumber && <div className="text-xs font-mono text-gray-600">{barcodeNumber}</div>}
    </div>
  );
}
