import { z } from "zod";
import { ScheduleStatus } from "../../../generated/prisma/enums";
import { QuerySchema } from "../../validations";

export const CreateScheduleValidationZodSchema = z.object({
  startDateTime: z.coerce.date({ error: "Invalid start date time!" }),
  endDateTime: z.coerce.date({ error: "Invalid start date time!" }),
  meetingLink: z.url({ error: "Invalid meeting link!" }).trim(),
});

export const UpdateScheduleValidationZodSchema = z.object({
  startDateTime: z.coerce
    .date({ error: "Invalid start date time!" })
    .optional(),
  endDateTime: z.coerce.date({ error: "Invalid start date time!" }).optional(),
  meetingLink: z.url({ error: "Invalid meeting link!" }).trim().optional(),
  staus: z
    .enum([
      ScheduleStatus.DRAFT,
      ScheduleStatus.PUBLISHED,
      ScheduleStatus.CANCELLED,
    ])
    .optional(),
});

export const GetMySchedulesQueryValidationSchema = z.object({
  ...QuerySchema.shape,
  staus: z
    .enum([
      ScheduleStatus.DRAFT,
      ScheduleStatus.PUBLISHED,
      ScheduleStatus.CANCELLED,
    ])
    .optional(),
});

export const GetAllSchedulesQueryValidationSchema = z.object({
  ...GetMySchedulesQueryValidationSchema.shape,
  doctorId: z.uuid().optional(),
  doctorEmail: z.email().optional,
});

export const GetTodaysSchedulesQueryValidationSchema = z.object({
  ...QuerySchema.shape,
  doctorId: z.uuid(),
});
