import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { sendDigest } from "@/lib/digest";
import { sql } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  // Verify the shared cron secret so only Vercel Cron (or an admin) can trigger this
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.DIGEST_CRON_SECRET}`;
  if (!process.env.DIGEST_CRON_SECRET || authHeader !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Fetch all users who have a verified email and haven't received a digest in the last 7 days
  const allUsers = await db
    .select({ id: users.id, lastDigestAt: users.lastDigestAt })
    .from(users);

  const due = allUsers.filter((u) => {
    if (!u.lastDigestAt) return true; // never sent
    return Date.now() - u.lastDigestAt.getTime() >= SEVEN_DAYS_MS;
  });

  let sent = 0;
  let failed = 0;

  for (const user of due) {
    const ok = await sendDigest(user.id);
    ok ? sent++ : failed++;
  }

  return Response.json({ due: due.length, sent, failed });
}
