import type { ScheduleStatus } from "../../../generated/prisma/enums";
import type { IQuery } from "../../interfaces";

export interface ICreateSchedulePayload {
  startDateTime: Date;
  endDateTime: Date;
  meetingLink: string;
}

export interface IGetMySchedulesQuery extends IQuery {
  status: ScheduleStatus;
}

export interface IGetAllSchedulesQuery extends IGetMySchedulesQuery {
  doctorId: string;
  doctorEmail: string;
}

export interface IUpdateSchedulePayload {
  startDateTime?: Date;
  endDateTime?: Date;
  meetingLink?: string;
  status?: ScheduleStatus;
}

export interface IGetTodaysScheduleQuery extends IQuery {
  doctorId: string;
}
