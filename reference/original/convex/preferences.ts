import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const COLOR_THEMES = [
  "healthcare",
  "spring",
  "summer",
  "autumn",
  "rain",
  "winter",
  "animal",
  "spider",
] as const;

export const ANIMATION_INTENSITIES = ["off", "low", "medium", "high"] as const;

export const getMyColorTheme = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const pref = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .unique();
    return pref?.colorTheme ?? "healthcare";
  },
});

export const setMyColorTheme = mutation({
  args: { colorTheme: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!(COLOR_THEMES as readonly string[]).includes(args.colorTheme)) {
      throw new Error("Invalid theme");
    }
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { colorTheme: args.colorTheme });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        colorTheme: args.colorTheme,
      });
    }
    return { success: true };
  },
});

export const getMyAnimationIntensity = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const pref = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .unique();
    return pref?.animationIntensity ?? "medium";
  },
});

export const setMyAnimationIntensity = mutation({
  args: { animationIntensity: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (
      !(ANIMATION_INTENSITIES as readonly string[]).includes(
        args.animationIntensity,
      )
    ) {
      throw new Error("Invalid animation intensity");
    }
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        animationIntensity: args.animationIntensity,
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        colorTheme: "healthcare",
        animationIntensity: args.animationIntensity,
      });
    }
    return { success: true };
  },
});
