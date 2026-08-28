import { randomUUID } from "node:crypto";
import httpStatus from "http-status";
import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";

const bookAppointment = async (payload: any, user: IRequestUser) => {
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Failed to get bkash id_token: getting bkashIdToken from bookAppointment in appointment service.",
    );
  }

  const appointmentId = randomUUID();

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bakend_app_url}/api/v1/appointment/book-appointment/payment/callback`,
        amount: "999",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: appointmentId,
      }),
    },
  );

  if (!bkashCreatePaymentResponse.ok) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed to create bKash payment intent: in bookAppointment at appointment.service",
    );
  }

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        id: appointmentId,
        userId: user.userId,
        status: AppointmentStatus.INITIATED,
      },
    });

    await tx.payment.create({
      data: {
        merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
        appointmentId: appointment.id,
        amount: "999",
        gatewayResponse: bkashCreatePaymentResult,
        bkashPaymentId: bkashCreatePaymentResult.paymentID,
        payerReference: user.email,
      },
    });
  });

  return { bkashURL: bkashCreatePaymentResult.bkashURL };
};

const payForAppointment = async (
  payload: { appointmentId: string },
  user: IRequestUser,
) => {
  const { appointmentId } = payload;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
  });

  if (!existingAppointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment does not exist!");
  }

  const pendingStatuses: AppointmentStatus[] = [
    AppointmentStatus.PENDING,
    AppointmentStatus.INITIATED,
  ];

  if (!pendingStatuses.includes(existingAppointment.status)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Appointment is already paid and confirmed!",
    );
  }

  // re-create the payment
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Failed to get bkash id_token: getting bkashIdToken from payForAppointment in appointment service.",
    );
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bakend_app_url}/api/v1/appointment/book-appointment/payment/callback`,
        amount: "999",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: existingAppointment.id,
      }),
    },
  );

  if (!bkashCreatePaymentResponse.ok) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed to create bKash payment intent: in bookAppointment at appointment.service",
    );
  }

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  await prisma.payment.update({
    where: { appointmentId: existingAppointment.id },
    data: {
      merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      gatewayResponse: bkashCreatePaymentResult,
      bkashPaymentId: bkashCreatePaymentResult.paymentID,
    },
  });

  return { bkashURL: bkashCreatePaymentResult.bkashURL };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const paymentId = query.paymentID;
  if (!paymentId) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment ID is missing!");
  }

  const status = query.status;
  if (!status) {
    throw new AppError(httpStatus.BAD_REQUEST, "Payment status is missing!");
  }

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "BKash Access Token not found!",
    );
  }

  const executedPaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/execute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({ paymentID: paymentId }),
    },
  );

  if (!executedPaymentResponse.ok) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed to execute bKash payment: in bookAppointmentCallback at appointment.service",
    );
  }

  const executedPaymentResult = await executedPaymentResponse.json();

  const isCompleted =
    executedPaymentResult.statusCode === "0000" &&
    executedPaymentResult.transactionStatus === "Completed";

  if (isCompleted) {
    const appointment = await prisma.appointment.update({
      where: { id: executedPaymentResult.merchantInvoiceNumber },
      data: { status: AppointmentStatus.CONFIRMED },
      include: { payment: { select: { id: true } } },
    });

    if (!appointment.payment?.id) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `No payment record found for appointment ${appointment.id}`,
      );
    }

    await prisma.payment.update({
      where: { id: appointment.payment.id },
      data: {
        status: PaymentStatus.PAID,
        bkashTrxId: executedPaymentResult.trxID,
        paidAt: executedPaymentResult.paymentExecuteTime,
        gatewayResponse: executedPaymentResult,
      },
    });

    return {
      executedPaymentResult,
      redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=success`,
    };
  }

  // Not completed — using the redirect's status to distinguish cancel vs failure.
  switch (status) {
    case "failure": {
      await prisma.payment.update({
        where: { bkashPaymentId: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executedPaymentResult,
        },
      });

      return {
        redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
      };
    }

    case "cancel": {
      await prisma.payment.update({
        where: { bkashPaymentId: paymentId },
        data: {
          status: PaymentStatus.CANCELLED,
          gatewayResponse: executedPaymentResult,
        },
      });

      return {
        redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    }

    default: {
      return {
        executedPaymentResult,
        redirectURL: `${config.frontend_url}/dashboard/my-appointments?error=missing-payment-response`,
      };
    }
  }
};

const cancelAppointmentAndGetRefunded = async (
  payload: { appointmentId: string; refundReason?: string },
  user: IRequestUser,
) => {
  const { appointmentId, refundReason } = payload;
  const reason = refundReason ?? "Patient cancelled the appointment!";

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "BKash Access Token not found!",
    );
  }

  const updateResult = await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      userId: user.userId,
      status: AppointmentStatus.CONFIRMED,
    },
    data: { status: AppointmentStatus.CANCELLED },
  });

  if (updateResult.count === 0) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true, userId: true },
    });

    if (!appointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment does not exist!");
    }
    if (appointment.userId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not authorized to cancel this appointment!",
      );
    }
    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Appointment is already cancelled!",
      );
    }
    if (
      appointment.status === AppointmentStatus.PENDING ||
      appointment.status === AppointmentStatus.INITIATED
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This appointment has no completed payment — use the standard cancellation instead.",
      );
    }
    throw new AppError(
      httpStatus.CONFLICT,
      `Appointment is ${appointment.status.toLowerCase()} and can't be cancelled!`,
    );
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: {
      payment: {
        select: {
          id: true,
          bkashTrxId: true,
          amount: true,
          bkashPaymentId: true,
        },
      },
    },
  });

  const bkashRefundPaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/payment/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        paymentID: appointment.payment?.bkashPaymentId,
        trxID: appointment.payment?.bkashTrxId,
        amount: appointment.payment?.amount?.toString(),
        sku: `${user.email}:${appointment.id}`,
        reason,
      }),
    },
  );

  if (!bkashRefundPaymentResponse.ok) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CONFIRMED },
    });

    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed to execute bKash refund: in cancelAndRefundAppointment at appointment.service",
    );
  }

  const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

  const updatePaymentAfterRefunding = await prisma.payment.update({
    where: { appointmentId: appointment.id },
    data: {
      refundTrxId: bkashRefundPaymentResult.refundTrxID,
      refundedAmount: bkashRefundPaymentResult.amount,
      refundReason: reason,
      refundedAt: bkashRefundPaymentResult.completedTime,
      status: PaymentStatus.REFUNDED,
      gatewayResponse: bkashRefundPaymentResult,
    },
  });

  return {
    cancelledAppointment: {
      ...appointment,
      status: AppointmentStatus.CANCELLED,
    },
    refundedPayment: updatePaymentAfterRefunding,
  };
};

export const AppointmentService = {
  bookAppointment,
  payForAppointment,
  bookAppointmentCallback,
  cancelAppointmentAndGetRefunded,
};
