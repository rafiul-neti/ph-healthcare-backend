import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PrescriptionController } from "./prescription.controller";
import { CreatePrescriptionValidationSchema } from "./prescription.validation";

const router = Router();

router.post(
  "/create-prescription",
  auth(Role.DOCTOR),
  validateRequest(CreatePrescriptionValidationSchema),
  PrescriptionController.createPrescription,
);

router.get(
  "/:appointmentId",
  auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  PrescriptionController.getPrescription,
);

export const PrescriptionRoutes = router;
