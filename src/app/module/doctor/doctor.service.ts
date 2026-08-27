import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import type { IApplyDoctor } from "./doctor.interface";

const applyAsDoctor = async (
  payload: IApplyDoctor,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isDoctorExists = await prisma.doctor.findUnique({
    where: { email: payload.user.email },
  });

  if (isDoctorExists) {
    throw new Error("A doctor is already exists with this email!");
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
              new Error(
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
                new Error(
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

  return doctorApplication;
};

export const DoctorService = { applyAsDoctor };
