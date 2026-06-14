import { auth } from "./auth";
import { db } from "./db";
import { users } from "./schema";

export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";

export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

let devUserEnsured = false;

async function ensureDevUser() {
  if (devUserEnsured) return;
  await db
    .insert(users)
    .values({ id: DEV_USER_ID, name: "Local Dev", email: "dev@localhost" })
    .onConflictDoNothing();
  devUserEnsured = true;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (AUTH_DISABLED) {
    await ensureDevUser();
    return DEV_USER_ID;
  }
  const session = await auth();
  return session?.user?.id ?? null;
}
