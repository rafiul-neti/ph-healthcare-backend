import { z } from "zod";
import { AppointmentStatus } from "../../../generated/prisma/enums";
import { QuerySchema } from "../../validations";

export const BookAppointmentValidationSchema = z.object({
  scheduleId: z.uuid("Invalid schedule reference!"),
});

export const UpdateAppointmentStatusValidationSchema = z.object({
  status: z.enum(
    [AppointmentStatus.ONGOING, AppointmentStatus.COMPLETED],
    "Status Must Be Either ONGOING or COMPLETED!",
  ),
});

export const GetAppointmentsQueryValidationSchema = z.object({
  ...QuerySchema.shape,
  status: z
    .enum(
      [
        AppointmentStatus.CANCELLED,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.INITIATED,
        AppointmentStatus.ONGOING,
        AppointmentStatus.PENDING,
      ],
      "Invalid appointment status!",
    )
    .optional(),
});

export const GetAllAppointmentsQueryValidationSchema = z.object({
  ...GetAppointmentsQueryValidationSchema.shape,
  doctorId: z.uuid("Invalid doctor reference!").optional(),
  patientId: z.uuid("Invalid patient reference!").optional(),
  doctorEmail: z.email("Invalid doctor email!").optional(),
  patientEmail: z.email("Invalid patient email!").optional(),
});
