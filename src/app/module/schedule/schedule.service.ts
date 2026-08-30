import {
  addDays,
  differenceInMinutes,
  isAfter,
  isSameDay,
  startOfDay,
} from "date-fns";
import httpStatus from "http-status";
import { ScheduleStatus } from "../../../generated/prisma/enums";
import type {
  ScheduleUpdateInput,
  ScheduleWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";
import type {
  ICreateSchedulePayload,
  IGetAllSchedulesQuery,
  IGetMySchedulesQuery,
  IGetTodaysScheduleQuery,
  IUpdateSchedulePayload,
} from "./schedule.interface";

async function createSchedule(
  payload: ICreateSchedulePayload,
  user: IRequestUser,
) {
  const isDoctorExists = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start and End Date Time must be on the same day>",
    );
  }

  if (isAfter(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time cannot be after End Date Time!",
    );
  }

  const startOfTheDay = startOfDay(payload.startDateTime);
  const startOfTheNextDay = addDays(startOfTheDay, 1);

  const existingScheduleOnThisDate = await prisma.schedule.findFirst({
    where: {
      doctorId: isDoctorExists.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfTheNextDay,
      },
    },
  });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a schedule for this date",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.startDateTime,
    payload.endDateTime,
  );

  const ALLOCATED_MINUTES_PER_SLOTS = 20;

  const totalSlots = Math.floor(
    durationInMinutes / ALLOCATED_MINUTES_PER_SLOTS,
  );

  const createdSchedule = await prisma.schedule.create({
    data: {
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots,
      availableSlots: totalSlots,
      doctorId: isDoctorExists.id,
    },
    include: {
      doctor: {
        select: {
          user: { select: { name: true } },
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return createdSchedule;
}

async function getMySchedules(query: IGetMySchedulesQuery, user: IRequestUser) {
  const isDoctorExists = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;

  const andConditions: ScheduleWhereInput[] = [
    { doctorId: isDoctorExists.id },
    { isDeleted: false },
  ];

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },
    take: limit,
    skip,
    orderBy: { startDateTime: "desc" },
    include: {
      appointments: {
        include: {
          patient: true,
        },
        omit: { doctorId: true },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getAllSchedules(query: IGetAllSchedulesQuery) {
  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;

  const andConditions: ScheduleWhereInput[] = [];

  if (query.doctorId) {
    andConditions.push({ doctorId: query.doctorId });
  }

  if (query.doctorEmail) {
    andConditions.push({ doctor: { email: query.doctorEmail } });
  }

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  if (query.searchTerm) {
    andConditions.push({
      doctor: {
        OR: [
          { email: { contains: query.searchTerm, mode: "insensitive" } },
          {
            specialization: { contains: query.searchTerm, mode: "insensitive" },
          },
        ],
      },
    });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },
    take: limit,
    skip,
    orderBy: { startDateTime: "desc" },
    include: {
      appointments: {
        include: {
          patient: true,
        },
        omit: { doctorId: true },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getScheduleById(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      doctor: {
        select: {
          user: { select: { name: true } },
          email: true,
          specialization: true,
          userId: true,
        },
      },
      appointments: {
        include: { patient: true },
      },
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, " Schedule not found!");
  }

  return schedule;
}

async function updateSchedule(
  scheduleId: string,
  payload: IUpdateSchedulePayload,
  user: IRequestUser,
) {
  const isDoctorExists = await prisma.doctor.findFirst({
    where: {
      userId: user.userId,
      isDeleted: false,
    },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, isDeleted: false, doctorId: isDoctorExists.id },
  });

  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found!");
  }

  if (payload.status && schedule.status === payload.status) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Schedule status is already ${schedule.status}. No changes were necessary!`,
    );
  }

  if (schedule.status === ScheduleStatus.CANCELLED) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Schedule once cancelled cannot be updated.",
    );
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A published schedule with booked slots cannot be updated.",
    );
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    payload.status === ScheduleStatus.DRAFT
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A published schedule cannot be moved back to draft.",
    );
  }

  const data: ScheduleUpdateInput = {};

  const startDateTime = payload.startDateTime ?? schedule.startDateTime;

  const endDateTime = payload.endDateTime ?? schedule.endDateTime;

  if (!isSameDay(startDateTime, endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start and End Date Time must be on the same day.",
    );
  }

  if (isAfter(startDateTime, endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time cannot be after End Date Time!",
    );
  }

  if (payload.startDateTime !== undefined) {
    data.startDateTime = payload.startDateTime;
  }

  if (payload.endDateTime !== undefined) {
    data.endDateTime = payload.endDateTime;
  }

  if (payload.meetingLink !== undefined) {
    data.meetingLink = payload.meetingLink;
  }

  if (payload.status !== undefined) {
    data.status = payload.status;
  }

  const updatedSchedule = await prisma.schedule.update({
    where: { id: schedule.id },
    data,
    include: {
      doctor: {
        select: {
          user: { select: { name: true } },
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return updatedSchedule;
}

async function deleteSchedule(scheduleId: string, user: IRequestUser) {
  const isDoctorExists = await prisma.doctor.findFirst({
    where: {
      userId: user.userId,
      isDeleted: false,
    },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, isDeleted: false, doctorId: isDoctorExists.id },
  });

  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found!");
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A published schedule with booked slots cannot be deleted.",
    );
  }

  const deletedSchedule = await prisma.schedule.update({
    where: { id: schedule.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  return deletedSchedule;
}

async function getTodaysSchedule(query: IGetTodaysScheduleQuery) {
  if (!query.doctorId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Query must include the doctorId!",
    );
  }

  const isDoctorExists = await prisma.doctor.findUnique({
    where: { id: query.doctorId },
  });

  if (!isDoctorExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const limit = Number(query.limit) ?? 10;
  const page = Number(query.page) ?? 1;
  const skip = (page - 1) * limit;

  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfTommorrow = addDays(startOfToday, 1);

  const andConditions: ScheduleWhereInput[] = [
    { doctorId: query.doctorId },
    { isDeleted: false },
    { status: ScheduleStatus.PUBLISHED },
    {
      startDateTime: {
        gte: startOfToday,
        lt: startOfTommorrow,
        gt: now,
      },
    },
    { availableSlots: { gt: 0 } },
  ];

  const schedules = await prisma.schedule.findMany({
    where: { AND: andConditions },
    take: limit,
    skip,
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.schedule.count({
    where: { AND: andConditions },
  });

  return {
    data: schedules,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export const ScheduleService = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  getTodaysSchedule,
};
