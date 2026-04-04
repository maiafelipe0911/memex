import { auth, signOut } from "@/lib/auth";

export default async function NavBar() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <nav className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
      <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
        Memex
      </span>
      <div className="flex items-center gap-3">
        {session.user.image && (
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full"
          />
        )}
        <span className="text-sm text-zinc-300">
          {session.user.name ?? session.user.email}
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
