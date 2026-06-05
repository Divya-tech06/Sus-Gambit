import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[a-zA-Z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const signupSchema = z
  .object({
    username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().trim().email().toLowerCase(),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false)
});

export const profileSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  avatar: z.string().url().nullable().optional()
});

export const createRoomSchema = z.object({
  roomName: z.string().trim().min(3).max(40),
  playerCount: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
  botDifficulty: z.enum(["BEGINNER", "EASY", "MEDIUM"]),
  meetingCooldown: z.union([z.literal(5), z.literal(7), z.literal(10)]),
  votingTimer: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  discussionTimer: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  visibility: z.enum(["PUBLIC", "PRIVATE"])
});
