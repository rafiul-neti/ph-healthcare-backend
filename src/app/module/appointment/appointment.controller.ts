import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment(req.body, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message:
      "Appointment initiated! Please make payment to confirm this booking",
    data: result,
  });
});

const recreatePaymentForFailedPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.payForAppointment(req.body, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message:
      "Appointment initiated! Please make payment to confirm this booking",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { redirectURL } = await AppointmentService.bookAppointmentCallback(
      req.query,
    );

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

const cancelAppointmentAndGetRefunded = catchAsync(async(req: Request, res: Response) => {
  const result = await AppointmentService.cancelAppointmentAndGetRefunded(req.body, req.user!);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment cancelled! Thank you for being with us.",
    data: result,
  });
})

export const AppointmentController = {
  bookAppointment,
  recreatePaymentForFailedPayment,
  bookAppointmentCallback,
  cancelAppointmentAndGetRefunded,
};
