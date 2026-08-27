import { randomUUID } from "node:crypto";
import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { IRequestUser } from "../auth/auth.interface";

const bookAppointment = async (payload: any, user: IRequestUser) => {
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error(
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
    throw new Error(
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
    throw new Error("Appointment does not exist!");
  }

  const pendingStatuses: AppointmentStatus[] = [
    AppointmentStatus.PENDING,
    AppointmentStatus.INITIATED,
  ];

  if (!pendingStatuses.includes(existingAppointment.status)) {
    throw new Error("Appointment is already paid and confirmed!");
  }

  // re-create the payment
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error(
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
    throw new Error(
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
    throw new Error("Payment ID is missing!");
  }

  const status = query.status;
  if (!status) {
    throw new Error("Payment status is missing!");
  }

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error("BKash Access Token not found!");
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
    throw new Error(
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
      throw new Error(
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

  const isAppointmentExist = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!isAppointmentExist) {
    throw new Error("Appointment does not exist!");
  }

  if (
    isAppointmentExist.status === AppointmentStatus.ONGOING ||
    isAppointmentExist.status === AppointmentStatus.COMPLETED
  ) {
    throw new Error(
      `Appointment is ${isAppointmentExist.status.toLowerCase()} and can't be cancelled!`,
    );
  }

  if (isAppointmentExist.status === AppointmentStatus.CANCELLED) {
    throw new Error("Appointment is already cancelled!");
  }

  const updateAppointment = await prisma.appointment.update({
    where: { id: isAppointmentExist.id },
    data: { status: AppointmentStatus.CANCELLED },
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

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error("BKash Access Token not found!");
  }

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
        paymentID: updateAppointment.payment?.bkashPaymentId,
        trxID: updateAppointment.payment?.bkashTrxId,
        amount: updateAppointment.payment?.amount?.toString(),
        sku: `${user.email}:${updateAppointment.id}`,
        reason: refundReason ?? "Patient cancelled the appointment!",
      }),
    },
  );

  if (!bkashRefundPaymentResponse.ok) {
    await prisma.appointment.update({
      where: { id: isAppointmentExist.id },
      data: { status: isAppointmentExist.status },
    });

    throw new Error(
      "Failed to execute bKash refund: in cancelAndRefundAppointment at appointment.service",
    );
  }

  const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

  const updatePaymentAfterRefunding = await prisma.payment.update({
    where: { appointmentId: updateAppointment.id },
    data: {
      refundTrxId: bkashRefundPaymentResult.refundTrxID,
      refundedAmount: bkashRefundPaymentResult.amount,
      refundReason: refundReason ?? "Patient cancelled the appointment!",
      refundedAt: bkashRefundPaymentResult.completedTime,
      status: PaymentStatus.REFUNDED,
      gatewayResponse: bkashRefundPaymentResult,
    },
  });

  return {
    cancelledAppointment: updateAppointment,
    refundedPayment: updatePaymentAfterRefunding,
  };
};

export const AppointmentService = {
  bookAppointment,
  payForAppointment,
  bookAppointmentCallback,
  cancelAppointmentAndGetRefunded,
};
