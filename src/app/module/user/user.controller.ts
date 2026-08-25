import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { UserService } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new Error("No file provided!");
  }

  const result = await UserService.uploadProfileImage(
    req.file?.buffer,
    req.user?.userId as string,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Image uploaded and updated successfully!",
    data: result,
  });
});

export const UserController = { uploadProfileImage };
