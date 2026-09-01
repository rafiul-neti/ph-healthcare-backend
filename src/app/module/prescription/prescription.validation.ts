import { z } from "zod";

export const CreatePrescriptionValidationSchema = z.object({
  appointmentId: z.uuid("Invalid appointment reference!"),
  findings: z
    .string()
    .trim()
    .min(5, "Findings must be at least 5 characters long!"),
  medicines: z.array(
    z.object({
      name: z.string().trim().min(1, "Medicine name is required!"),
      dosage: z.string().trim().min(1, "Dosage is required!"),
      duration: z.string().trim().min(1, "Duration is required!"),
      instructions: z.string().trim().optional(),
    }),
  ),
});
