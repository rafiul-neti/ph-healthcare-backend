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

const recreatePaymentForFailedPayment = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AppointmentService.payForAppointment(
      req.body,
      req.user!,
    );
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message:
        "Appointment initiated! Please make payment to confirm this booking",
      data: result,
    });
  },
);

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

const cancelAppointmentAndGetRefunded = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AppointmentService.cancelAppointmentAndGetRefunded(
      req.body,
      req.user!,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Appointment cancelled! Thank you for being with us.",
      data: result,
    });
  },
);

const updateAppointmentStatus = catchAsync(
  async (req: Request, res: Response) => {
    const appointmentId = req.params.appointmentId as string;

    const result = await AppointmentService.updateAppointmentStatus(
      appointmentId,
      req.body,
      req.user!,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Appointment status updated successfully.",
      data: result,
    });
  },
);

const getMyAppointments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await AppointmentService.getMyAppointments(
    req.validatedQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Patient appointments retieved successfully.",
    data,
    meta,
  });
});

const getDoctorAppointments = catchAsync(
  async (req: Request, res: Response) => {
    const { data, meta } = await AppointmentService.getDoctorAppointments(
      req.validatedQuery,
      req.user!,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Doctor appointments retieved successfully.",
      data,
      meta,
    });
  },
);

const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await AppointmentService.getAllAppointments(
    req.validatedQuery,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointments retieved successfully.",
    data,
    meta,
  });
});

const getSingleAppointment = catchAsync(async (req: Request, res: Response) => {
  const appointmentId = req.params.appointmentId as string;

  const result = await AppointmentService.getSingleAppointment(
    appointmentId,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Appointment retieved successfully.",
    data: result,
  });
});

export const AppointmentController = {
  bookAppointment,
  recreatePaymentForFailedPayment,
  bookAppointmentCallback,
  cancelAppointmentAndGetRefunded,
  updateAppointmentStatus,
  getMyAppointments,
  getDoctorAppointments,
  getAllAppointments,
  getSingleAppointment,
};
