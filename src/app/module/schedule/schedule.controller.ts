import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ScheduleService } from "./schedule.service";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.createSchedule(req.body, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Schedule created successfully.",
    data: result,
  });
});

const getMySchedules = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.getMySchedules(
    req.validatedQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedules retrieved successfully.",
    data: result,
  });
});

const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.getAllSchedules(req.validatedQuery);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedules retrieved successfully.",
    data: result,
  });
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.getScheduleById(
    req.params.scheduleId as string,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedule retrieved successfully.",
    data: result,
  });
});

const getTodaysSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.getTodaysSchedule(req.validatedQuery);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Todays schedules retrieved successfully.",
    data: result,
  });
});

const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.updateSchedule(
    req.params.scheduleId as string,
    req.body,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedule updated successfully.",
    data: result,
  });
});

const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await ScheduleService.deleteSchedule(
    req.params.scheduleId as string,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedule deleted successfully.",
    data: result,
  });
});

export const ScheduleController = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  getTodaysSchedule,
  updateSchedule,
  deleteSchedule,
};
