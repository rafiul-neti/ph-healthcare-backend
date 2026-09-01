import path from "node:path";
import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import { addDays, startOfDay } from "date-fns";
import ejs from "ejs";
import httpStatus from "http-status";
import {
  DoctorVerificationStatus,
  Role,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import type { DoctorWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import {
  Actions,
  RedisKeyPrefix,
  redisActions,
} from "../../utils/redisActions";
import type { IRequestUser } from "../auth/auth.interface";
import type {
  IApplyDoctor,
  IApproveDoctorPayload,
  IGetAllDoctorsQuery,
  IGetAvailableDoctorsByTodaysScheduleQuery,
  IUpdateDoctorProfilePayload,
  IVerifyDoctorEmailPayload,
} from "./doctor.interface";

const applyAsDoctor = async (
  payload: IApplyDoctor,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isDoctorExists = await prisma.doctor.findUnique({
    where: { email: payload.user.email },
  });

  if (isDoctorExists) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A doctor is already exists with this email!",
    );
  }

  const uploadResumeAndGetLink = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: "auto" }, async (error, result) => {
          if (error) {
            return reject(error);
          }

          if (!result) {
            return reject(
              new AppError(
                httpStatus.INTERNAL_SERVER_ERROR,
                "No result returned from Cloudinary: at applyAsDoctor in doctor.service; uploading resume!",
              ),
            );
          }

          resolve(result);
        })
        .end(resume?.buffer);
    },
  );

  const uploadAdditionalFiles = await Promise.all(
    additionalFiles.map((file, indx) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ resource_type: "auto" }, async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  `No result returned from Cloudinary: at applyAsDoctor in doctor.service; uploading additional files, file number ${indx + 1}, title: ${file.originalname}!`,
                ),
              );
            }

            resolve(result);
          })
          .end(file.buffer);
      });
    }),
  );

  console.log(uploadResumeAndGetLink.original_filename, uploadResumeAndGetLink);

  const hashedPassword = await bcrypt.hash(
    config.seed_password,
    Number(config.bcrypt_salt_rounds),
  );

  const doctorApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      doctor: {
        create: {
          email: payload.user.email,
          ...payload.doctor,
          resume: uploadResumeAndGetLink.secure_url,
          resumePublicId: uploadResumeAndGetLink.public_id,
          additionalFiles: uploadAdditionalFiles.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },
    include: {
      doctor: true,
    },
    omit: { password: true },
  });

  const expirationSeconds = 60 * 60;

  const OTP = await redisActions({
    keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
    keySuffix: payload.user.email,
    action: Actions.SET_OTP,
    expirationSeconds,
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/doctor-registration-OTP.ejs",
  );

  const userRegistrationOTPVerificationEmail = await ejs.renderFile(
    templatePath,
    {
      otp: OTP,
      name: payload.user.name,
      expiryMinutes: expirationSeconds / 60,
    },
  );

  transporter.sendMail({
    from: config.email_sender,
    to: payload.user.email,
    subject: "Doctor Application - Verify Your Email",
    html: userRegistrationOTPVerificationEmail,
  });

  return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
  const { otp } = payload;
  const email = payload.email.trim().toLowerCase();

  const isDoctorExists = await prisma.user.findFirst({
    where: { email, role: Role.DOCTOR },
  });

  if (!isDoctorExists) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Failed to found doctor application! Please apply again.",
    );
  }

  if (isDoctorExists.emailVerified) {
    throw new AppError(httpStatus.CONFLICT, "Email already verified!");
  }

  const OTP = await redisActions({
    keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
    keySuffix: email,
    action: Actions.GET_OTP,
  });

  if (!OTP) {
    throw new AppError(
      httpStatus.GONE,
      "OTP expired. Your application window has closed! Please apply again.",
    );
  }

  if (OTP !== otp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid OTP! Please provide the valid one.",
    );
  }

  await redisActions({
    keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
    keySuffix: email,
    action: Actions.DEL_OTP,
  });

  const verifyDoctor = await prisma.user.update({
    where: { id: isDoctorExists.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { doctor: { omit: { id: true, userId: true, email: true } } },
  });

  return verifyDoctor;
};

const approveDoctor = async (
  payload: IApproveDoctorPayload,
  reviewer: IRequestUser,
) => {
  const { doctorId, verificationStatus, rejectionReason } = payload;

  const isDoctorExists = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { user: { omit: { password: true } } },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor application not found!");
  }

  if (isDoctorExists.isDeleted) {
    throw new AppError(httpStatus.GONE, "Doctor application has been deleted!");
  }

  if (!isDoctorExists.user.emailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Docotor hasn't verified their email yet! Application cannot be reviewed!",
    );
  }

  if (isDoctorExists.verificatonStatus !== DoctorVerificationStatus.PENDING) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Doctor application has already been ${isDoctorExists.verificatonStatus.toLowerCase()}.`,
    );
  }

  const updateDoctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      verificatonStatus: verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? (rejectionReason ?? null)
          : null,
      reviewAt: new Date(),
      reviewedBy: reviewer.userId,
    },
    include: { user: { select: { name: true } } },
  });

  const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

  const templatePath = path.join(
    process.cwd(),
    `src/app/templates/${isApproved ? "doctor-application-approve-email.ejs" : "doctor-application-reject-email.ejs"}`,
  );

  const html = await ejs.renderFile(templatePath, {
    name: updateDoctor.user.name,
    ...(!isApproved && rejectionReason && { rejectionReason }),
  });

  transporter.sendMail({
    from: config.email_sender,
    to: updateDoctor.email,
    subject: isApproved
      ? "Your PH Healthcare Doctor Application Has Been Approved"
      : "Update Regarding Your PH Healthcare Doctor Application",
    html,
  });

  return updateDoctor;
};

// have to add search, sort, pagination
const getAllDoctors = async (query: IGetAllDoctorsQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andCondition: DoctorWhereInput[] = [];

  // handling search
  if (query.searchTerm) {
    andCondition.push({
      OR: [
        { email: { contains: query.searchTerm, mode: "insensitive" } },
        {
          specialization: { contains: query.searchTerm, mode: "insensitive" },
        },
      ],
    });
  }

  // handle filtering
  if (query.specialization) {
    andCondition.push({
      specialization: { contains: query.specialization, mode: "insensitive" },
    });
  }

  if (query.email) {
    andCondition.push({
      email: { contains: query.email, mode: "insensitive" },
    });
  }

  if (query.verificationStatus) {
    andCondition.push({
      verificatonStatus: query.verificationStatus,
    });
  }

  andCondition.push({ isDeleted: false });

  const allDoctors = await prisma.doctor.findMany({
    where: { AND: andCondition ?? undefined },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    include: {
      user: { omit: { password: true } },

      // schedules: true,
      // appointments: true,
      // prescriptions: true
    },
  });

  const countTotalDoctors = await prisma.doctor.count({
    where: { AND: andCondition },
  });

  return {
    data: allDoctors,
    meta: {
      page,
      limit,
      total: countTotalDoctors,
      totalPages: Math.ceil(countTotalDoctors / limit),
    },
  };
};

const updateDoctorProfile = async (
  payload: IUpdateDoctorProfilePayload,
  user: IRequestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const updateDoctor = await prisma.doctor.update({
    where: {
      id: doctor.id,
    },
    data: payload,
  });

  return updateDoctor;
};

const getAvailableDoctorsByTodaysSchedule = async (
  query: IGetAvailableDoctorsByTodaysScheduleQuery,
) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfTommorrow = addDays(startOfToday, 1);

  const andConditions: DoctorWhereInput[] = [
    { isDeleted: false },
    { verificatonStatus: DoctorVerificationStatus.APPROVED },
    {
      schedules: {
        some: {
          isDeleted: false,
          status: ScheduleStatus.PUBLISHED,
          availableSlots: { gt: 0 },
          startDateTime: {
            gte: startOfToday,
            lt: startOfTommorrow,
            gt: now,
          },
        },
      },
    },
  ];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { user: { name: { contains: query.searchTerm, mode: "insensitive" } } },
        { specialization: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.specialization) {
    andConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }

  const availableDoctors = await prisma.doctor.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    select: {
      id: true,
      user: { select: { name: true } },
      specialization: true,
      licenseNumber: true,
      qualifications: true,
      experienceYears: true,
      bio: true,
      consultationFee: true,
      createdAt: true,
      schedules: {
        where: {
          isDeleted: false,
          status: ScheduleStatus.PUBLISHED,
          availableSlots: { gt: 0 },
          startDateTime: {
            gte: startOfToday,
            lt: startOfTommorrow,
            gt: now,
          },
        },
        orderBy: { startDateTime: "asc" },
        select: {
          id: true,
          startDateTime: true,
          endDateTime: true,
          availableSlots: true,
          totalSlots: true,
        },
      },
    },
  });

  return {
    data: availableDoctors,
    meta: {
      page,
      limit,
      total: availableDoctors.length,
      totalPages: Math.ceil(availableDoctors.length / limit),
    },
  };
};

const getAllDoctorsPublicProfile = async (query: IGetAllDoctorsQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: DoctorWhereInput[] = [
    { isDeleted: false },
    { verificatonStatus: DoctorVerificationStatus.APPROVED },
  ];

  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { user: { name: { contains: query.searchTerm, mode: "insensitive" } } },
        { specialization: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  if (query.specialization) {
    andConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }

  const allDoctors = await prisma.doctor.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
    select: {
      id: true,
      user: { select: { name: true } },
      specialization: true,
      licenseNumber: true,
      qualifications: true,
      experienceYears: true,
      bio: true,
      consultationFee: true,
      createdAt: true,
    },
  });

  return {
    data: allDoctors,
    meta: {
      page,
      limit,
      total: allDoctors.length,
      totalPages: Math.ceil(allDoctors.length / limit),
    },
  };
};

const getSingleDoctorPublicProfile = async (doctorId: string) => {
  const doctor = await prisma.doctor.findUnique({
    where: {
      id: doctorId,
      isDeleted: false,
      verificatonStatus: DoctorVerificationStatus.APPROVED,
    },
    select: {
      id: true,
      user: { select: { name: true } },
      specialization: true,
      licenseNumber: true,
      qualifications: true,
      experienceYears: true,
      bio: true,
      consultationFee: true,
      createdAt: true,
    },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  return doctor;
};

export const DoctorService = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctors,
  updateDoctorProfile,
  getAllDoctorsPublicProfile,
  getAvailableDoctorsByTodaysSchedule,
  getSingleDoctorPublicProfile,
};
