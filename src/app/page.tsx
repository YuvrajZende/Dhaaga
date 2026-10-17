import { getSessionUser } from "@/lib/auth/session";
import Landing from "@/components/landing/landing";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <Landing
      user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
    />
  );
}
