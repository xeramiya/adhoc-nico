import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from "react-router";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <Meta />
        <Links />
      </head>
      <body>
        <Theme appearance="dark" accentColor="violet" radius="medium">
          {children}
        </Theme>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "エラー";
  let details = "予期しないエラーが発生しました。";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "エラー";
    details = error.status === 404 ? "ページが見つかりません。" : error.statusText || details;
  }

  return (
    <main style={{ padding: "4rem 1rem", maxWidth: 600, margin: "0 auto", color: "#fff" }}>
      <h1>{message}</h1>
      <p>{details}</p>
    </main>
  );
}
