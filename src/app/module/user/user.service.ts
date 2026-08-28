import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true, imagePublicID: true },
  });

  const imageUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: "auto" }, async (err, result) => {
          if (err) {
            console.error(
              err,
              "cloudinary error from uploadProfileImage service.",
            );
            return reject(err);
          }

          if (!result) {
            return reject(
              new AppError(
                httpStatus.INTERNAL_SERVER_ERROR,
                "No result returned from cloudinary!",
              ),
            );
          }

          resolve(result);
        })
        .end(buffer);
    },
  );

  const updateUser = await prisma.user.update({
    where: { id: userId },
    data: {
      image: imageUploadResult?.secure_url,
      imagePublicID: imageUploadResult?.public_id,
    },
    omit: { password: true },
  });

  if (currentUser?.imagePublicID && currentUser?.image) {
    await cloudinary.uploader.destroy(currentUser.imagePublicID);
  }

  return updateUser;
};

export const UserService = { uploadProfileImage };
