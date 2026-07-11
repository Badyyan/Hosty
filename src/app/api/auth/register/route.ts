import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiHandler, json } from "@/lib/api";
import { ApiError } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

export const POST = apiHandler(
  async (req) => {
    const input = schema.parse(await req.json());
    const email = input.email.toLowerCase().trim();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, "An account with this email already exists.");

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        subscription: { create: { plan: "FREE" } },
      },
    });
    return json({ id: user.id }, { status: 201 });
  },
  { limit: { n: 5, windowSeconds: 60, key: "register" } }
);
