import { ImageIcon } from "./icons";
import { cx } from "./ui";

/**
 * A photo from the authenticated photo route. Plain <img> on purpose:
 * Next's image optimiser would fetch without the user's login cookie.
 */
export function Photo({
  photoKey,
  alt,
  size = "thumb",
  className,
}: {
  photoKey: string | null | undefined;
  alt: string;
  size?: "thumb" | "full";
  className?: string;
}) {
  if (!photoKey) {
    return (
      <div className={cx("flex items-center justify-center bg-gray-100 text-gray-400", className)} role="img" aria-label="No photo">
        <ImageIcon size={28} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/photos/${photoKey}${size === "thumb" ? "?size=thumb" : ""}`}
      alt={alt}
      loading={size === "full" ? "eager" : "lazy"}
      decoding="async"
      className={cx("bg-gray-100 object-cover", className)}
    />
  );
}
