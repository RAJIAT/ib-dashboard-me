import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/Logo";
import { useLang } from "@/i18n/LanguageProvider";

export const Route = createFileRoute("/success")({
  head: () => ({
    meta: [
      { title: "Submitted — AIB" },
      { name: "description", content: "Your insurance documents were submitted successfully." },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-background">
      <header className="px-4 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size={40} />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-20 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/5">
          <Check className="h-12 w-12 text-success" strokeWidth={3} />
        </div>
        <h1 className="mt-8 text-2xl font-bold text-foreground sm:text-3xl">{t.success.title}</h1>
        <p className="mt-3 max-w-md text-base text-muted-foreground">{t.success.subtitle}</p>
        <Link
          to="/"
          className="mt-10 inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
        >
          {t.success.back}
        </Link>
      </main>
    </div>
  );
}
