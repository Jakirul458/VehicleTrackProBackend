import bcrypt from "bcryptjs";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";

async function seedAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_MOBILE, ADMIN_PASSWORD } = env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_MOBILE || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_MOBILE, and ADMIN_PASSWORD in backend/.env first.");
  }
  if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");

  await connectDatabase();
  const email = ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        role: "SUPER_ADMIN",
        fullName: ADMIN_NAME,
        email,
        mobile: ADMIN_MOBILE,
        passwordHash,
        status: "ACTIVE",
      },
      $unset: { agentCode: "", plan: "", businessName: "" },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  console.info(`Administrator account ready: ${email}`);
  await UserModel.db.close();
}

seedAdmin().catch(async (error: unknown) => {
  console.error("Could not seed administrator", error);
  await UserModel.db.close();
  process.exitCode = 1;
});
