import NumberFlow, { type NumberFlowProps } from '@number-flow/react';

/** The CSP nonce the server put in the page, so NumberFlow's shadow <style> is allowed. */
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
const usable = nonce && nonce !== '__CSP_NONCE__' ? nonce : undefined;

/** NumberFlow with our defaults: tabular display digits, CSP nonce. */
export function Num({ className = '', ...props }: NumberFlowProps) {
  return <NumberFlow nonce={usable} className={`num ${className}`} {...props} />;
}
