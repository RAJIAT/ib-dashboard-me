import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { LanguageProvider, useLang } from "@/i18n/LanguageProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "AIB — Upload Insurance Documents" },
      { name: "description", content: "Fast and secure document upload for Al Raha Insurance Broker." },
      { name: "theme-color", content: "#1c244b" },
      { property: "og:title", content: "AIB — Upload Insurance Documents" },
      { name: "twitter:title", content: "AIB — Upload Insurance Documents" },
      { property: "og:description", content: "Fast and secure document upload for Al Raha Insurance Broker." },
      { name: "twitter:description", content: "Fast and secure document upload for Al Raha Insurance Broker." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3086bdb9-b2ff-4c20-9e25-46a06b7844b9/id-preview-20d429f8--9c8d3e3e-fe20-40d1-bfe3-50d8fdcffe9a.lovable.app-1777279503753.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3086bdb9-b2ff-4c20-9e25-46a06b7844b9/id-preview-20d429f8--9c8d3e3e-fe20-40d1-bfe3-50d8fdcffe9a.lovable.app-1777279503753.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Tajawal:wght@400;500;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <LanguageProvider>
      <AppChrome />
    </LanguageProvider>
  );
}

function AppChrome() {
  const { dir } = useLang();
  return (
    <>
      <DemoBanner />
      <Outlet />
      <Toaster position="top-center" richColors closeButton dir={dir} />
    </>
  );
}
