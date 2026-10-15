import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';

async function resetSuperAdmin() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find existing super admin
    const existingAdmin = await UserModel.findOne({ role: 'SUPER_ADMIN' });

    if (!existingAdmin) {
      console.log('No super admin found. Please use setup-super-admin first.');
      process.exit(1);
    }

    console.log('Found Super Admin:');
    console.log('- Email:', existingAdmin.email);
    console.log('- Mobile:', existingAdmin.mobile);
    console.log('- Name:', existingAdmin.fullName);

    // Ask for new password
    const newPassword = 'AdminPassword123'; // Change this to your desired password

    const passwordHash = await bcrypt.hash(newPassword, 12);
    existingAdmin.passwordHash = passwordHash;
    await existingAdmin.save();

    console.log('\n✅ Super Admin password reset successfully!');
    console.log('New Password:', newPassword);
    console.log('Email:', existingAdmin.email);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetSuperAdmin();
