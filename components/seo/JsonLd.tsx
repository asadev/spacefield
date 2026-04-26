// Re-export of the root-level JsonLd component so callers can import it
// from the /seo namespace alongside sibling helpers like Breadcrumbs and
// RelatedTools. Keeping a single implementation avoids two divergent
// <script> renderers.
export { default } from "@/components/JsonLd";
