// Prototype button (PR #337, components/Button.tsx): the label rolls on hover,
// the readable copy stays for screen readers and crawlers.
import { Children, cloneElement, isValidElement } from "react";
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";

export type SiteButtonVariant = "primary" | "secondary" | "tertiary" | "transparent" | "white";

function label(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      const text = String(child);
      return (
        <span className="button-label">
          <span className="button-readable">{text}</span>
          <span className="button-roll" aria-hidden="true">
            <span>{text}</span>
            <span className="button-roll-copy">{text}</span>
          </span>
        </span>
      );
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children != null) {
      return cloneElement(child as ReactElement<{ children?: ReactNode }>, {}, label(child.props.children));
    }
    return child;
  });
}

type SiteButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: SiteButtonVariant;
  size?: "desktop" | "mobile" | "responsive";
};

export function SiteButtonLink({
  variant = "primary",
  size = "responsive",
  className = "",
  children,
  ...props
}: SiteButtonLinkProps) {
  return (
    <a {...props} className={`button button--${variant} button--${size} ${className}`.trim()}>
      {label(children)}
    </a>
  );
}
