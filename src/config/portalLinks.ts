// Customer-portal link config (CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001).
// Social links mirror the site footer (SharedFooter.tsx) — the only configured,
// owned PawTenant social accounts. Review links: Trustpilot is the configured
// review platform used elsewhere in the app; the Google review URL is a
// PLACEHOLDER — the owner must paste the exact Google Business "write a review"
// link (e.g. https://g.page/r/<place-id>/review) for the Google button to appear.

export interface SocialLink {
  icon: string;
  href: string;
  label: string;
  handle: string;
}

export const PAWTENANT_SOCIAL_LINKS: SocialLink[] = [
  { icon: "ri-facebook-fill", href: "https://www.facebook.com/PawTenant/", label: "Facebook", handle: "@PawTenant" },
  { icon: "ri-instagram-line", href: "https://www.instagram.com/pawtenant/", label: "Instagram", handle: "@pawtenant" },
];

export const REVIEW_LINKS = {
  /** Configured review platform used across the app. */
  trustpilot: "https://www.trustpilot.com/review/pawtenant.com",
  /**
   * Google reviews link (provided by owner 2026-07-09). Opens the PawTenant
   * Google Reviews panel in a new tab. The Google review button renders when set.
   */
  google: "https://www.google.com/search?q=PawTenant&sca_esv=08d3373863b39b87&ei=cZtOarawL_zV7M8P5sC1oAM&biw=1920&bih=945&ved=0ahUKEwj2rJOb38OVAxX8KvsDHWZgDTQQ4dUDCBA&uact=5&oq=PawTenant&gs_lp=Egxnd3Mtd2l6LXNlcnAiCVBhd1RlbmFudDIFEAAY7wUyBRAAGO8FMggQABiABBiiBDIFEAAY7wUyBRAAGO8FSPQMUPEIWJcLcAJ4AJABAJgBkwKgAZMCqgEDMi0xuAEDyAEA-AEBmAIDoAKsAsICCxAAGIAEGKIEGLADwgIIEAAY7wUYsAOYAwCIBgGQBgWSBwUyLjAuMaAHsAKyBwMyLTG4B5sCwgcDMi0zyAcRgAgB&sclient=gws-wiz-serp",
} as const;
