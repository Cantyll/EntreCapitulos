/** Logo do Google nas quatro cores da marca, como no protótipo. Decorativo. */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z"
        fill="#4285F4"
      />
      <path
        d="M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.8.9-3 .9a5.3 5.3 0 0 1-5-3.6H4v2.4A9 9 0 0 0 12 21z"
        fill="#34A853"
      />
      <path d="M7 13.8a5.3 5.3 0 0 1 0-3.5V7.9H4a9 9 0 0 0 0 8.2z" fill="#FBBC05" />
      <path
        d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.9l3 2.4a5.3 5.3 0 0 1 5-3.7z"
        fill="#EA4335"
      />
    </svg>
  );
}
