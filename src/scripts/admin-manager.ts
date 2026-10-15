import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { UserModel } from '../models/User.js';

/**
 * Super Admin Management Script
 *
 * Usage:
 * npm run admin:setup     - Create new super admin (if none exists)
 * npm run admin:reset     - Reset super admin password
 * npm run admin:info      - Show super admin info
 * npm run admin:delete    - Delete super admin (dangerous!)
 */

const ACTION = process.argv[2];

async function setupSuperAdmin() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const existingAdmin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
    if (existingAdmin) {
      console.log('❌ Super Admin already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Name:', existingAdmin.fullName);
      console.log('\nTo reset password, run: npm run admin:reset');
      process.exit(1);
    }

    const fullName = 'Super Admin';
    const email = 'admin@vehicletrack.com';
    const password = 'Admin123456'; // Easy to remember
    const mobile = '9876543210';

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({
      fullName,
      email: email.toLowerCase(),
      mobile,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    console.log('✅ Super Admin created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('📱 Mobile:', mobile);
    console.log('👤 Name:', fullName);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Save these credentials safely!');
    console.log('🔐 You can change password anytime with: npm run admin:reset\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function resetSuperAdminPassword() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const admin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
    if (!admin) {
      console.log('❌ No Super Admin found!');
      console.log('Run: npm run admin:setup to create one');
      process.exit(1);
    }

    const newPassword = 'Admin123456'; // Easy to remember
    const passwordHash = await bcrypt.hash(newPassword, 12);

    admin.passwordHash = passwordHash;
    await admin.save();

    console.log('✅ Super Admin password reset successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', admin.email);
    console.log('🔑 New Password:', newPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function showSuperAdminInfo() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const admin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
    if (!admin) {
      console.log('❌ No Super Admin found!');
      console.log('Run: npm run admin:setup to create one');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Super Admin Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', admin.email);
    console.log('👤 Name:', admin.fullName);
    console.log('📱 Mobile:', admin.mobile);
    console.log('📅 Created:', admin.createdAt);
    console.log('🔒 Status:', admin.status);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔐 To reset password, run: npm run admin:reset\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function deleteSuperAdmin() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const admin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
    if (!admin) {
      console.log('❌ No Super Admin found!');
      process.exit(1);
    }

    console.log('⚠️  WARNING: This will delete the Super Admin!');
    console.log('Email:', admin.email);
    console.log('\nType "DELETE" to confirm:');

    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data) => {
      if (data.toString().trim() === 'DELETE') {
        await UserModel.deleteOne({ role: 'SUPER_ADMIN' });
        console.log('✅ Super Admin deleted successfully!');
        console.log('Run: npm run admin:setup to create a new one\n');
        process.exit(0);
      } else {
        console.log('❌ Cancelled\n');
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 Super Admin Management Commands');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('npm run admin:setup     - Create new super admin');
  console.log('npm run admin:reset     - Reset super admin password');
  console.log('npm run admin:info      - Show super admin info');
  console.log('npm run admin:delete    - Delete super admin (dangerous!)');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(0);
}

switch (ACTION) {
  case 'setup':
    setupSuperAdmin();
    break;
  case 'reset':
    resetSuperAdminPassword();
    break;
  case 'info':
    showSuperAdminInfo();
    break;
  case 'delete':
    deleteSuperAdmin();
    break;
  default:
    showHelp();
}
