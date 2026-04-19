import { LoginForm } from "./login-form";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readStringParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = readStringParam(params, "error");
  const sent = readStringParam(params, "sent") === "1";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <LoginForm error={error} sent={sent} />
    </main>
  );
}
