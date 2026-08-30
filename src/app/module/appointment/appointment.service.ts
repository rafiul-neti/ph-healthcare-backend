import { randomUUID } from "node:crypto";
import { addMinutes, isBefore, isSameDay } from "date-fns";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import {
  AppointmentStatus,
  PaymentStatus,
  Role,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import type { AppointmentWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";
import type {
  IBookAppointmentPayload,
  IGetAllAppointmentsQuery,
  IGetAppointmentsQuery,
  IUpdateAppointmentStatus,
} from "./appointment.interface";

const bookAppointment = async (
  payload: IBookAppointmentPayload,
  user: IRequestUser,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });
  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient profile not found!");
  }

  const schedule = await prisma.schedule.findFirst({
    where: {
      id: payload.scheduleId,
      isDeleted: false,
      status: ScheduleStatus.PUBLISHED,
    },
    include: { doctor: { select: { id: true, consultationFee: true } } },
  });
  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found!");
  }

  if (schedule.availableSlots === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "All slots have been booked in this schedule.",
    );
  }

  if (!schedule.doctor.consultationFee) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor has not set a consultation fee yet.",
    );
  }

  const now = new Date();
  if (!isSameDay(now, schedule.startDateTime)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This schedule is not available today!",
    );
  }

  if (!isBefore(now, schedule.startDateTime)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This schedule has not started yet!",
    );
  }

  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      scheduleId: schedule.id,
      status: {
        in: [
          AppointmentStatus.INITIATED,
          AppointmentStatus.ONGOING,
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CONFIRMED,
        ],
      },
    },
  });

  if (existingAppointment) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `You already have an appointment in this schedule with status ${existingAppointment.status}. Please try again later.`,
    );
  }

  // the bKash payment intent using the REAL fee.
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Failed to get bkash id_token: getting bkashIdToken from bookAppointment in appointment service.",
    );
  }

  const appointmentId = randomUUID();
  const amount = schedule.doctor.consultationFee.toString();

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
        amount,
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

  //  only DB writes here, all inside the transaction, using tx
  // consistently. Slot decrement should also happen here, atomically.
  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        id: appointmentId,
        status: AppointmentStatus.INITIATED,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    await tx.payment.create({
      data: {
        merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
        appointmentId: appointment.id,
        amount,
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
    include: {
      schedule: { include: { doctor: { select: { consultationFee: true } } } },
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

  if (!existingAppointment.schedule.doctor.consultationFee) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor has not set a consultation fee yet.",
    );
  }

  // re-create the payment
  const amount = existingAppointment.schedule.doctor.consultationFee.toString();
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
        amount: amount,
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
    const appointment = await prisma.appointment.findUnique({
      where: { id: executedPaymentResult.merchantInvoiceNumber },
      include: {
        schedule: {
          select: {
            id: true,
            totalSlots: true,
            availableSlots: true,
            startDateTime: true,
            meetingLink: true,
          },
        },
        patient: { select: { user: { select: { email: true, name: true } } } },
        doctor: {
          select: {
            specialization: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!appointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment not found.");
    }

    const newAvailavleSlots = appointment?.schedule.availableSlots - 1;

    const alreadyBookedSlots =
      appointment.schedule.totalSlots - appointment.schedule.availableSlots;
    const serialNumber = alreadyBookedSlots + 1;

    const joiningTime = addMinutes(
      appointment.schedule.startDateTime,
      (serialNumber - 1) * 20,
    );

    const updateAppointment = await prisma.appointment.update({
      where: { id: executedPaymentResult.merchantInvoiceNumber },
      data: { status: AppointmentStatus.CONFIRMED, joiningTime, serialNumber },
      include: { payment: { select: { id: true } } },
    });

    await prisma.schedule.update({
      where: { id: appointment.schedule.id },
      data: { availableSlots: newAvailavleSlots },
    });

    if (!updateAppointment.payment?.id) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `No payment record found for appointment ${updateAppointment.id}`,
      );
    }

    await prisma.payment.update({
      where: { id: updateAppointment.payment.id },
      data: {
        status: PaymentStatus.PAID,
        bkashTrxId: executedPaymentResult.trxID,
        paidAt: executedPaymentResult.paymentExecuteTime,
        gatewayResponse: executedPaymentResult,
      },
    });

    const pdfDocument = new PDFDocument({ margin: 50 });
    const pdfChunks: Buffer[] = [];

    pdfDocument.on("data", (chunk: Buffer) => {
      pdfChunks.push(chunk);
    });

    const pdfReadyPromise = new Promise<Buffer>((resolve) => {
      pdfDocument.on("end", () => {
        resolve(Buffer.concat(pdfChunks));
      });
    });

    pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
    pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
    pdfDocument.moveDown(2);

    pdfDocument
      .fontSize(12)
      .text(`Patient Name: ${appointment.patient.user.name}`);
    pdfDocument.text(`Patient Email: ${appointment.patient.user.email}`);
    pdfDocument.moveDown();

    pdfDocument
      .fontSize(12)
      .text(`Doctor Name: ${appointment.doctor.user.name}`);
    pdfDocument.text(`Doctor Email: ${appointment.doctor.user.email}`);
    pdfDocument.text(`Specialized in: ${appointment.doctor.specialization}`);
    pdfDocument.moveDown();

    pdfDocument.text(
      `Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
    );

    pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
    pdfDocument.text(`Your Serial Number: ${serialNumber}`);
    pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
    pdfDocument.moveDown();

    pdfDocument.text(`Amount Paid: ${executedPaymentResult.amount} BDT`);
    pdfDocument.text(`Payment Method: bKash`);
    pdfDocument.text(`Transaction ID: ${executedPaymentResult.trxID}`);
    pdfDocument.text(`Paid At: ${executedPaymentResult.paymentExecuteTime}`);

    pdfDocument.end();

    const pdfBuffer = await pdfReadyPromise;

    await transporter.sendMail({
      from: config.email_sender,
      to: appointment.patient.user.email,
      subject: "Your Appointment Invoice - PH Healthcare System",
      text: "Thank you for booking an appointment. Please find your invoice attached.",
      attachments: [
        {
          filename: "invoice.pdf",
          content: pdfBuffer,
        },
      ],
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

  // Step 1: atomically flip CONFIRMED -> CANCELLED, only if currently CONFIRMED.
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
        httpStatus.BAD_REQUEST,
        "Appointment is already cancelled!",
      );
    }
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Appointment is ${appointment.status.toLowerCase()} and can't be cancelled!`,
    );
  }

  // Step 2: fetch what we need for both the timing decision and the refund call.
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: {
      schedule: { select: { id: true, startDateTime: true } },
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

  const oneHourBeforeStart = new Date(
    appointment.schedule.startDateTime.getTime() - 60 * 60 * 1000,
  );
  const isEligibleForRefund = isBefore(new Date(), oneHourBeforeStart);

  // Branch A: too late for a refund. No bKash call. One transaction closes it out.
  if (!isEligibleForRefund) {
    const [updatedPayment] = await prisma.$transaction([
      prisma.payment.update({
        where: { appointmentId: appointment.id },
        data: {
          status: PaymentStatus.CANCELLED,
          refundReason:
            "Cancelled less than 1 hour before appointment — not eligible for refund.",
        },
      }),
      prisma.schedule.update({
        where: { id: appointment.schedule.id },
        data: { availableSlots: { increment: 1 } },
      }),
    ]);

    return {
      cancelledAppointment: appointment,
      refundedPayment: null,
      payment: updatedPayment,
    };
  }

  // Branch B: eligible. Call bKash, then commit payment+slot together.
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    // Roll back the cancellation — haven't touched payment or slot yet.
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CONFIRMED },
    });
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "BKash Access Token not found!",
    );
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

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { appointmentId: appointment.id },
      data: {
        refundTrxId: bkashRefundPaymentResult.refundTrxID,
        refundedAmount: bkashRefundPaymentResult.amount,
        refundReason: reason,
        refundedAt: bkashRefundPaymentResult.completedTime,
        status: PaymentStatus.REFUNDED,
        gatewayResponse: bkashRefundPaymentResult,
      },
    }),
    prisma.schedule.update({
      where: { id: appointment.schedule.id },
      data: { availableSlots: { increment: 1 } },
    }),
  ]);

  return {
    cancelledAppointment: appointment,
    refundedPayment: updatedPayment,
  };
};

// doctor only API
const updateAppointmentStatus = async (
  appointmentId: string,
  payload: IUpdateAppointmentStatus,
  user: IRequestUser,
) => {
  const isDoctorExists = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorId: isDoctorExists.id },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!");
  }

  if (appointment.status === AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Appointment is already completed!",
    );
  }

  if (
    appointment.status === AppointmentStatus.CANCELLED ||
    appointment.status === AppointmentStatus.INITIATED ||
    appointment.status === AppointmentStatus.PENDING
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      `${appointment.status} appointments cannot be updated!`,
    );
  }

  if (
    appointment.status === AppointmentStatus.CONFIRMED &&
    payload.status !== AppointmentStatus.ONGOING
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Confirmed appointments can only be updated to Ongoing.",
    );
  }

  if (
    appointment.status === AppointmentStatus.ONGOING &&
    payload.status !== AppointmentStatus.COMPLETED
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Ongoing appointments can only be updated to Completed.",
    );
  }

  const updateResult = await prisma.appointment.updateManyAndReturn({
    where: {
      id: appointmentId,
      doctorId: isDoctorExists.id,
      status: appointment.status,
    },
    data: { status: payload.status },
  });

  return updateResult[0];
};

// patient appointments
const getMyAppointments = async (
  query: IGetAppointmentsQuery,
  user: IRequestUser,
) => {
  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient not found!");
  }

  const andConditions: AppointmentWhereInput[] = [{ patientId: patient.id }];

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  const appointments = await prisma.appointment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
  });

  return {
    data: appointments,
    meta: {
      page,
      limit,
      total: appointments.length,
      totalPages: Math.ceil(appointments.length / limit),
    },
  };
};

// doctor apoointments
const getDoctorAppointments = async (
  query: IGetAppointmentsQuery,
  user: IRequestUser,
) => {
  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const andConditions: AppointmentWhereInput[] = [{ doctorId: doctor.id }];

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  const appointments = await prisma.appointment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
  });

  return {
    data: appointments,
    meta: {
      page,
      limit,
      total: appointments.length,
      totalPages: Math.ceil(appointments.length / limit),
    },
  };
};

// admin/super_admin
const getAllAppointments = async (query: IGetAllAppointmentsQuery) => {
  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const andConditions: AppointmentWhereInput[] = [];

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  if (query.doctorId) {
    andConditions.push({ doctorId: query.doctorId });
  }

  if (query.doctorEmail) {
    andConditions.push({ doctor: { email: query.doctorEmail } });
  }

  if (query.patientId) {
    andConditions.push({ patientId: query.patientId });
  }

  if (query.patientEmail) {
    andConditions.push({ patient: { user: { email: query.patientEmail } } });
  }

  const appointments = await prisma.appointment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
  });

  return {
    data: appointments,
    meta: {
      page,
      limit,
      total: appointments.length,
      totalPages: Math.ceil(appointments.length / limit),
    },
  };
};

// all logged-in user
const getSingleAppointment = async (
  appointmentId: string,
  user: IRequestUser,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: {
        select: {
          id: true,
          specialization: true,
          userId: true,
          user: { select: { name: true } },
        },
      },
      patient: {
        select: {
          id: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment not found!");
  }

  if (
    (user.role === Role.DOCTOR && appointment.doctor.userId !== user.userId) ||
    (user.role === Role.PATIENT && appointment.patient.userId !== user.userId)
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to view this appointment!",
    );
  }

  return appointment;
};

export const AppointmentService = {
  bookAppointment,
  payForAppointment,
  bookAppointmentCallback,
  cancelAppointmentAndGetRefunded,
  updateAppointmentStatus,
  getMyAppointments,
  getDoctorAppointments,
  getAllAppointments,
  getSingleAppointment,
};
