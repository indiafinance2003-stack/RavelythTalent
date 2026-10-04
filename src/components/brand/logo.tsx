import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

/**
 * Brand logo.
 *
 * The ONLY approved asset is /public/logo.svg (supplied by the owner). This
 * component never invents a symbol: if that file is missing it degrades to a
 * plain text wordmark - "Ravelyth" in navy, "Talent" in teal - in the brand UI
 * font, with no icon of any kind.
 */

const LOGO_PUBLIC_PATH = "/logo.svg";

function logoFileExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", "logo.svg"));
  } catch {
    return false;
  }
}

const SIZE_CLASSES = {
  sm: { img: "h-7", text: "text-lg" },
  md: { img: "h-9", text: "text-2xl" },
  lg: { img: "h-12", text: "text-3xl" },
} as const;

export type LogoSize = keyof typeof SIZE_CLASSES;

export function Logo({
  size = "md",
  className = "",
  href = "/",
  showTagline = false,
}: {
  size?: LogoSize;
  className?: string;
  href?: string | null;
  showTagline?: boolean;
}) {
  const hasLogo = logoFileExists();
  const sizes = SIZE_CLASSES[size];

  const content = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {hasLogo ? (
        <img
          src={LOGO_PUBLIC_PATH}
          alt="Ravelyth Talent"
          className={`${sizes.img} w-auto`}
          width={180}
          height={48}
        />
      ) : (
        <span
          className={`font-extrabold tracking-tight leading-none ${sizes.text} whitespace-nowrap`}
        >
          <span className="text-navy">Ravelyth</span>{" "}
          <span className="text-teal">Talent</span>
        </span>
      )}
      {showTagline ? (
        <span className="sr-only">
          Connecting Great People with Great Opportunities
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal focus-visible:ring-offset-2"
      aria-label="Ravelyth Talent home"
    >
      {content}
    </Link>
  );
}

export default Logo;
