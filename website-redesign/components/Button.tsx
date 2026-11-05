'use client';
import { Children, cloneElement, isValidElement } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'transparent' | 'white';
export type PreviewState = 'default' | 'hover' | 'focus' | 'disabled';
type ButtonStyle = { variant?: ButtonVariant; size?: 'desktop' | 'mobile' | 'responsive' };
type Props = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle & { previewState?: PreviewState };
function label(children: ReactNode): ReactNode {
  return Children.map(children, child => {
    if (typeof child === 'string' || typeof child === 'number') {
      const text=String(child);
      return <span className="button-label"><span className="button-readable">{text}</span><span className="button-roll" aria-hidden="true"><span>{text}</span><span className="button-roll-copy">{text}</span></span></span>;
    }
    if (isValidElement<{children?: ReactNode}>(child) && child.props.children != null) return cloneElement(child as ReactElement<{children?:ReactNode}>, {}, label(child.props.children));
    return child;
  });
}
export function Button({ variant = 'primary', size = 'desktop', previewState, className = '', disabled, children, ...props }: Props) {
  return <button {...props} disabled={disabled || previewState === 'disabled'} data-preview={previewState} className={`button button--${variant} button--${size} ${className}`}>{label(children)}</button>;
}
export function ButtonLink({ variant = 'primary', size = 'desktop', className = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & ButtonStyle) {
  return <a {...props} className={`button button--${variant} button--${size} ${className}`}>{label(children)}</a>;
}
