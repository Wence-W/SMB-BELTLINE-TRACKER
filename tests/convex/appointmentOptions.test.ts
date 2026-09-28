// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { expectCode, newBackend, seedUser } from "./helpers";

async function setup() {
  const t = newBackend();
  await t.mutation(internal.devSeed.seedPhase1, {});
  const staff = await seedUser(t, { email: "staff@example.invalid" });
  const admin = await seedUser(t, { email: "admin@example.invalid", capabilities: ["admin"] });
  return { t, staff, admin };
}

describe("Booked Tracker Scheduler / Provider options", () => {
  test("staff read the effective lists", async () => {
    const { staff } = await setup();
    expect(await staff.as.query(api.appointmentOptions.list, {})).toEqual({
      schedulers: ["Scheduler A.", "Scheduler B.", "Boost"],
      providersByLocation: {
        Atlanta: ["Dr. Example One", "NP Example Two"],
        Stockbridge: ["Dr. Example One", "PA Example Three"],
        Newnan: ["Dr. Example Four"],
      },
    });
  });

  test("admin: custom values append; removing a built-in hides it; re-adding in another case restores the canonical spelling", async () => {
    const { admin, staff } = await setup();
    await admin.as.mutation(api.appointmentOptions.add, { optionType: "scheduler", value: "  New Person " });
    await admin.as.mutation(api.appointmentOptions.remove, { optionType: "scheduler", value: "scheduler a." });
    let lists = await staff.as.query(api.appointmentOptions.list, {});
    expect(lists.schedulers).toEqual(["Scheduler B.", "Boost", "New Person"]);
    await admin.as.mutation(api.appointmentOptions.add, { optionType: "scheduler", value: "SCHEDULER A." });
    lists = await staff.as.query(api.appointmentOptions.list, {});
    expect(lists.schedulers).toEqual(["Scheduler A.", "Scheduler B.", "Boost", "New Person"]);
  });

  test("provider options are per clinic and validated like the original", async () => {
    const { admin } = await setup();
    await expectCode(
      admin.as.mutation(api.appointmentOptions.add, { optionType: "provider", value: "Dr. X", location: "Mars" }),
      "INVALID_LOCATION",
    );
    await expectCode(
      admin.as.mutation(api.appointmentOptions.add, { optionType: "scheduler", value: "X", location: "Atlanta" }),
      "SCHEDULER_HAS_NO_LOCATION",
    );
    await expectCode(
      admin.as.mutation(api.appointmentOptions.add, { optionType: "scheduler", value: "  " }),
      "VALUE_REQUIRED",
    );
    await admin.as.mutation(api.appointmentOptions.add, { optionType: "provider", value: "Dr. X", location: "Newnan" });
    const lists = await admin.as.query(api.appointmentOptions.list, {});
    expect(lists.providersByLocation.Newnan).toEqual(["Dr. Example Four", "Dr. X"]);
    expect(lists.providersByLocation.Atlanta).not.toContain("Dr. X");
  });

  test("staff cannot change options", async () => {
    const { staff } = await setup();
    await expectCode(
      staff.as.mutation(api.appointmentOptions.add, { optionType: "scheduler", value: "X" }),
      "FORBIDDEN",
    );
    await expectCode(
      staff.as.mutation(api.appointmentOptions.remove, { optionType: "scheduler", value: "Boost" }),
      "FORBIDDEN",
    );
  });
});
