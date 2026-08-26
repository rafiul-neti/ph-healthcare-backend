import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment();
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Appointment booked! Thank you for being with us.",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { redirectURL } =
      await AppointmentService.bookAppointmentCallback(req.query);

    res.redirect(redirectURL);

    /* 
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.CREATED,
      message: "Appointment booked! Thank you for being with us.",
      data: executedPaymentResult,
    });
    */
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};
