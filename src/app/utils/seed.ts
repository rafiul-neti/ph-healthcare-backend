import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

export const seedSuperAdmin = async () => {
  try {
    const isSuperAdminExists = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdminExists) {
      console.log("A Super Admin is Already Exists!");
      return;
    }

    if (!config.super_admin_email || !config.seed_password) {
      throw new Error("Email or password missing: seeding super admin!");
    }

    const hashedPassword = await bcrypt.hash(
      config.seed_password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name: config.super_admin_name ?? "Super Admin",
        email: config.super_admin_email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Super admin created", superAdmin);
  } catch (error) {
    console.log("error seeding super admin", error);
    await prisma.user.delete({
      where: {
        email: config.super_admin_email,
      },
    });
  }
};

export const seedTesterAdmin = async () => {
  try {
    const isTesterAdminExists = await prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
      },
    });

    if (isTesterAdminExists) {
      console.log("A tester admin is already exists!");
      return;
    }

    if (!config.tester_admin_email || !config.seed_password) {
      throw new Error("Email or password missing: seeding tester admin!");
    }

    const hashedPassword = await bcrypt.hash(
      config.seed_password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerAdmin = await prisma.user.create({
      data: {
        name: config.tester_admin_name ?? "Tester Admin",
        email: config.tester_admin_email,
        password: hashedPassword,
        role: Role.ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Tester admin created", testerAdmin);
  } catch (error) {
    console.log("error seeding tester admin", error);
    await prisma.user.delete({
      where: {
        email: config.tester_admin_email,
      },
    });
  }
};

export const seedTesterDoctor = async () => {
  try {
    const isTesterDoctorExists = await prisma.user.findFirst({
      where: {
        role: Role.DOCTOR,
      },
    });

    if (isTesterDoctorExists) {
      console.log("A tester doctor is already Exists!");
      return;
    }

    if (!config.tester_doctor_email || !config.seed_password) {
      throw new Error("Email or password missing: seeding tester doctor!");
    }

    const hashedPassword = await bcrypt.hash(
      config.seed_password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerDoctor = await prisma.user.create({
      data: {
        name: config.tester_doctor_name ?? "Tester Doctor",
        email: config.tester_doctor_email,
        password: hashedPassword,
        role: Role.DOCTOR,
        needPasswordChange: false,
        emailVerified: true,
        doctor: {
          create: {
            email: config.tester_doctor_email,
            experienceYears: 4,
            licenseNumber: "BMDC014582365",
            qualifications: "FCPS",
            speicialization: "Neurology",
          },
        },
      },
    });

    console.log("Tester doctor created", testerDoctor);
  } catch (error) {
    console.log("error seeding tester doctor", error);
    await prisma.user.delete({
      where: {
        email: config.tester_doctor_email,
      },
    });
  }
};
