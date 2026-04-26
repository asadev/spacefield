export const metadata = {
  title: "Crypto P/L Tracker (FIFO)",
  description:
    "Log buy and sell transactions per symbol. Compute realized P/L using FIFO cost basis, plus unrealized P/L at user-supplied prices.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
