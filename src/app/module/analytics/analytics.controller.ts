import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AnalyticsService } from "./analytics.service";

const getPatientAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await AnalyticsService.getPatientAnalytics(req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Patient analytics retrieved successfully,",
    data: result,
  });
});

const getDoctorAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await AnalyticsService.getDoctorAnalytics(req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Doctor analytics retrieved successfully,",
    data: result,
  });
});

const getAdminAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await AnalyticsService.getAdminAnalytics();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Admin analytics retrieved successfully,",
    data: result,
  });
});

export const AnalyticsController = {
    getPatientAnalytics, getDoctorAnalytics, getAdminAnalytics
}
