import "./studio.css";
import "./style.css";
import PageReady from "./components/PageReady";
import VisitNotification from "./components/VisitNotification";
import { UserProvider } from "./components/product/UserSession";
import "./landing.css";
import "./product.css";
import "./brand.css";
export const metadata = {
  title: "AlgoTy — Make your move",
  description: "Your space to explore markets, trade with virtual funds, and find a fresh perspective.",
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/brand/font-2.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/brand/orbit.svg" as="image" />
      </head>
      <body><VisitNotification/><UserProvider><PageReady>{children}</PageReady></UserProvider><noscript><style>{`.page-preloader{display:none!important}.ready-content{visibility:visible!important}`}</style></noscript></body>
    </html>
  );
}
