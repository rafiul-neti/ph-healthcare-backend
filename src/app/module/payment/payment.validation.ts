import { z } from "zod";
import { QuerySchema } from "../../validations";

export const GetMyPaymentsValidationSchema = z.object({
  ...QuerySchema.shape,
});

export const GetAllPaymentsValidationSchema = z.object({
  ...GetMyPaymentsValidationSchema.shape,
  patientEmail: z.email().optional(),
});
