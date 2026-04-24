/**
 * MobileChatButton — intentionally renders nothing.
 *
 * Previously this shipped a black chat-bubble launcher on mobile. The
 * public mobile site now uses the ORANGE Tawk launcher as the single,
 * canonical chat entry point — keeping the custom button produced a
 * double-icon regression in the bottom-right corner on mobile.
 *
 * The component is retained as a no-op so existing imports and call
 * sites (App.tsx) don't need to be touched whenever this flag flips.
 */
export default function MobileChatButton() {
  return null;
}
