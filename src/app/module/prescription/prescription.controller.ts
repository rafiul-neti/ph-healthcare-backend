import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PrescriptionService } from "./prescription.service";

const createPrescription = catchAsync(async (req: Request, res: Response) => {
  const result = await PrescriptionService.createPrescription(
    req.body,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Prescription created and emailed to patient successfully.",
    data: result,
  });
});

const getPrescription = catchAsync(async (req: Request, res: Response) => {
  const result = await PrescriptionService.getsinglePrescription(
    req.params.appointmentId as string,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Prescription retrieved successfully.",
    data: result,
  });
});

export const PrescriptionController = { createPrescription, getPrescription };
