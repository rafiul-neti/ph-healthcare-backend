import httpStatus from "http-status";
import {
  AppointmentStatus,
  DoctorVerificationStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";

async function getAdminAnalytics() {
  // total doctors
  const totalDoctors = await prisma.doctor.count({
    where: { isDeleted: false },
  });

  const totalPendingDocotrApplications = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificatonStatus: DoctorVerificationStatus.PENDING,
    },
  });

  const approvedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificatonStatus: DoctorVerificationStatus.APPROVED,
    },
  });

  const rejectedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificatonStatus: DoctorVerificationStatus.REJECTED,
    },
  });

  //   patient
  const totalPatients = prisma.patient.count({
    where: { isDeleted: false },
  });

  //   appointments
  const totalAppointments = await prisma.appointment.count();

  const completedAppointments = await prisma.appointment.count({
    where: { status: AppointmentStatus.COMPLETED },
  });

  const cancelledAppointments = await prisma.appointment.count({
    where: { status: AppointmentStatus.CANCELLED },
  });

  const totalRefundResult = await prisma.payment.aggregate({
    where: { status: PaymentStatus.REFUNDED },
    _sum: { amount: true },
  });

  const totalRefund = totalRefundResult._sum.amount?.toNumber() || 0;

  const totalRevenueResult = await prisma.payment.aggregate({
    where: { status: PaymentStatus.PAID },
    _sum: { amount: true },
  });

  const totalRevenue =
    (totalRevenueResult._sum.amount?.toNumber() || 0) - totalRefund;

  return {
    totalDoctors,
    totalPendingDocotrApplications,
    approvedDoctors,
    rejectedDoctors,
    totalPatients,
    totalAppointments,
    completedAppointments,
    cancelledAppointments,
    totalRevenue,
    totalRefund,
  };
}

async function getPatientAnalytics(user: IRequestUser) {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found!");
  }

  const totalAppointments = await prisma.appointment.count({
    where: { patientId: patient.id },
  });

  const upcomingAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.CONFIRMED },
  });

  const completedAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.COMPLETED },
  });

  const cancelledAppointments = await prisma.appointment.count({
    where: { patientId: patient.id, status: AppointmentStatus.CANCELLED },
  });

  const totalAmountSpentResult = await prisma.payment.aggregate({
    where: {
      appointment: { patientId: patient.id },
      status: PaymentStatus.PAID,
    },
    _sum: { amount: true },
  });

  const totalAmountSpent = totalAmountSpentResult._sum.amount?.toNumber() || 0;

  const totalRefundResult = await prisma.payment.aggregate({
    where: {
      appointment: { patientId: patient.id },
      status: PaymentStatus.REFUNDED,
    },
    _sum: { amount: true },
  });

  const totalRefund = totalRefundResult._sum.amount?.toNumber() || 0;

  return {
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalAmountSpent,
    totalRefund,
  };
}

async function getDoctorAnalytics(user: IRequestUser) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const totalSchedules = await prisma.schedule.count({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
    },
  });

  const publishedSchedules = await prisma.schedule.count({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      status: ScheduleStatus.PUBLISHED,
    },
  });

  const draftSchedules = await prisma.schedule.count({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      status: ScheduleStatus.DRAFT,
    },
  });

  const totalAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id },
  });

  const upcomingAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: AppointmentStatus.CONFIRMED },
  });

  const ongoingAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: AppointmentStatus.ONGOING },
  });

  const completedAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: AppointmentStatus.COMPLETED },
  });

  const cancelledAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: AppointmentStatus.CANCELLED },
  });

  const totalDoctorEarningResult = await prisma.payment.aggregate({
    where: { appointment: { doctorId: doctor.id }, status: PaymentStatus.PAID },
    _sum: { amount: true },
  });

  const totalEarnings = totalDoctorEarningResult._sum.amount?.toNumber() || 0;

  const totalDoctorRefundResult = await prisma.payment.aggregate({
    where: {
      appointment: { doctorId: doctor.id },
      status: PaymentStatus.REFUNDED,
    },
    _sum: { amount: true },
  });

  const totalRefunded = totalDoctorRefundResult._sum.amount?.toNumber() || 0;

  return {
    totalSchedules,
    publishedSchedules,
    draftSchedules,
    totalAppointments,
    upcomingAppointments,
    ongoingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalEarning: totalEarnings - totalRefunded,
  };
}

export const AnalyticsService = {
  getAdminAnalytics,
  getPatientAnalytics,
  getDoctorAnalytics,
};
