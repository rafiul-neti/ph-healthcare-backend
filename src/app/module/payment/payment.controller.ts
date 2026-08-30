import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentService } from "./payment.service";

const getMyPayments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PaymentService.getMyPayments(
    req.validatedQuery,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payments Retrieved Successfully.",
    data,
    meta,
  });
});

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PaymentService.getAllPayments(
    req.validatedQuery,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payments Retrieved Successfully.",
    data,
    meta,
  });
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getSinglePayment(
    req.params.paymentId as string,
    req.user!,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Payment Retrieved Successfully.",
    data: result,
  });
});

export const PaymentController = {
  getMyPayments,
  getAllPayments,
  getSinglePayment,
};
