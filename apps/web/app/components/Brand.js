import { markPath } from "../../brand/geometry.mjs";
export function BrandMark({ className = "" }) {
  return (
    <svg
      className={"algoty-mark " + className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path d={markPath} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}
export default function Brand({ href = "/", className = "" }) {
  return (
    <a
      href={href}
      className={"algoty-logo " + className}
      aria-label="AlgoTy home"
    >
      <BrandMark />
      <span className="algoty-name">algoty</span>
      <sup className="algoty-registered" aria-hidden="true">
        ®
      </sup>
    </a>
  );
}
