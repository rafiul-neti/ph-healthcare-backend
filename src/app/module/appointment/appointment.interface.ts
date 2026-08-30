import type { AppointmentStatus } from "../../../generated/prisma/enums";
import type { IQuery } from "../../interfaces";

export interface IBookAppointmentPayload {
  scheduleId: string;
}

export interface IUpdateAppointmentStatus {
  status: "ONGOING" | "COMPLETED";
}

export interface IGetAppointmentsQuery extends IQuery {
  status?: AppointmentStatus;
}

export interface IGetAllAppointmentsQuery extends IGetAppointmentsQuery {
  doctorId: string;
  patientId: string;
  doctorEmail: string;
  patientEmail: string;
}
