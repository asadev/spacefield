export const metadata = {
  title: "Cohort Retention Analyzer",
  description:
    "Paste a CSV of user_id, signup_date, last_active_date. Renders a monthly cohort retention heatmap up to 12 months.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
