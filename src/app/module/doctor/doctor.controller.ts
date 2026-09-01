import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const resume = files?.["resume"] ? files?.["resume"][0] : null;
  const additionalFiles = files?.["additionalFiles"] || [];

  const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(
    JSON.parse(req.body.data),
  );

  if (!zodValidationResult.success) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      zodValidationResult.error.issues[0].message,
    );
  }

  const payload = zodValidationResult.data;

  const result = await DoctorService.applyAsDoctor(
    payload,
    resume,
    additionalFiles,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Apllication received. You will be contacted as soon as possible.",
    data: result,
  });
});

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.verifyDoctorEmail(req.body);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctor email verified successfully.",
    data: result,
  });
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.approveDoctor(req.body, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctor status has been changed.",
    data: result,
  });
});

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await DoctorService.getAllDoctors(req.query);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctors retrieved successfully!",
    data,
    meta,
  });
});

const updateDoctorProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.updateDoctorProfile(req.query, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctor profile updated successfully!",
    data: result,
  });
});

const getAvailableDoctorByTodaysSchedule = catchAsync(
  async (req: Request, res: Response) => {
    const { data, meta } =
      await DoctorService.getAvailableDoctorsByTodaysSchedule(req.query);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Today's Available Doctors Retrieved Successfully",
      data,
      meta,
    });
  },
);

const getAllDoctorsListPublic = catchAsync(
  async (req: Request, res: Response) => {
    const { data, meta } = await DoctorService.getAllDoctorsPublicProfile(
      req.query,
    );
    
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Doctors Retrieved Successfully",
      data,
      meta,
    });
  },
);

const getSingleDoctorPublicProfile = catchAsync(
  async (req: Request, res: Response) => {
    const doctorId = req.params.doctorId as string;

    const result = await DoctorService.getSingleDoctorPublicProfile(doctorId);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Doctor Profile Retrieved Successfully",
      data: result,
    });
  },
);

export const DoctorController = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctors,
  updateDoctorProfile,
  getAllDoctorsListPublic,
  getAvailableDoctorByTodaysSchedule,
  getSingleDoctorPublicProfile,
};
