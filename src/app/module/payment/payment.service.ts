import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import type { PaymentWhereInput } from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";
import type {
  IGetAllPaymentsQuery,
  IGetMyPaymentsQuery,
} from "./payment.interface";

async function getMyPayments(query: IGetMyPaymentsQuery, user: IRequestUser) {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const patient = await prisma.patient.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient not found!");
  }

  const andConditions: PaymentWhereInput[] = [
    { appointment: { patientId: patient.id } },
  ];

  const payments = await prisma.payment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
  });

  return {
    data: payments,
    meta: {
      page,
      limit,
      total: payments.length,
      totalPages: Math.ceil(payments.length / limit),
    },
  };
}

async function getAllPayments(query: IGetAllPaymentsQuery) {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const andConditions: PaymentWhereInput[] = [];

  if (query.patientEmail) {
    andConditions.push({
      appointment: { patient: { user: { email: query.patientEmail } } },
    });
  }

  const payments = await prisma.payment.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { [sortBy]: sortOrder },
  });

  return {
    data: payments,
    meta: {
      page,
      limit,
      total: payments.length,
      totalPages: Math.ceil(payments.length / limit),
    },
  };
}

async function getSinglePayment(paymentId: string, user: IRequestUser) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      appointment: {
        include: {
          patient: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true, email: true } },
            },
          },
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { name: true } },
            },
          },
          schedule: true,
        },
      },
    },
  });

  if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment not found!");
  }

  if (
    (user.role === Role.PATIENT &&
      payment.appointment.patient.userId !== user.userId) ||
    user.role === Role.DOCTOR
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to view this payment!",
    );
  }

  return payment;
}

export const PaymentService = {
  getMyPayments,
  getAllPayments,
  getSinglePayment,
};
