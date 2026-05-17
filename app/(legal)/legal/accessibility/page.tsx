import DraftBanner from "../../_components/DraftBanner";

export const metadata = {
  title: "Accessibility · Space Field",
  description: "How Space Field works toward WCAG 2.1 AA conformance.",
};

// Legal copy changes only on deploy. 1-hour ISR.
export const revalidate = 3600;

export default function AccessibilityPage() {
  return (
    <>
      <DraftBanner level="review" />
      <h2>Accessibility statement</h2>

      <p>
        Space Field aims to make its product usable for people with the
        broadest possible range of abilities. We&apos;re targeting{" "}
        <strong>WCAG 2.1 Level AA</strong> conformance and improving rough
        edges as we find them.
      </p>

      <h3>Where we are today</h3>
      <p>
        The product has not yet been audited end-to-end against WCAG 2.1 AA.
        We&apos;re scheduled to run a full audit (automated via axe DevTools
        + manual keyboard-navigation + screen-reader testing) before our
        public launch and to publish the findings here.
      </p>

      <h3>Known gaps we&apos;re fixing</h3>
      <ul>
        <li>Some interactive controls lack visible focus rings.</li>
        <li>A handful of icon-only buttons are missing accessible labels.</li>
        <li>Right-to-left (Arabic) layout pass is in progress.</li>
        <li>
          Colour-contrast verification across both the light and dark themes
          is not yet complete.
        </li>
      </ul>

      <h3>What works well</h3>
      <ul>
        <li>Semantic HTML throughout most of the application.</li>
        <li>Keyboard-reachable navigation on the primary surfaces.</li>
        <li>Dark mode + light mode with user-controlled toggle.</li>
        <li>Responsive layout that adapts down to phone screens.</li>
      </ul>

      <h3>Report an issue</h3>
      <p>
        If you encounter an accessibility barrier, please email{" "}
        <a href="mailto:accessibility@spacefield.co">
          accessibility@spacefield.co
        </a>{" "}
        with the page URL, what you tried, and what happened. We&apos;ll
        acknowledge within 5 business days.
      </p>
    </>
  );
}
