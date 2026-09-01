import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { DoctorController } from "./doctor.controller";
import { UpdateDoctorProfileValidationSchema } from "./doctor.validation";

const router = Router();

router.post(
  "/apply-as-doctor",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "additionalFiles", maxCount: 5 },
  ]),
  DoctorController.applyAsDoctor,
);

router.post(
  "/apply-as-doctor/verify-email",
  DoctorController.verifyDoctorEmail,
);

// admin only routes
router.post(
  "/approve-doctor",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.approveDoctor,
);

router.get(
  "/all-doctors",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.getAllDoctors,
);

router.patch(
  "/update-my-profile",
  auth(Role.DOCTOR),
  validateRequest(UpdateDoctorProfileValidationSchema),
  DoctorController.updateDoctorProfile,
);

// public
router.get(
  "/public/available-today",
  DoctorController.getAvailableDoctorByTodaysSchedule,
);

router.get("/public/all-doctors", DoctorController.getAllDoctorsListPublic);

router.get("/public/:doctorId", DoctorController.getSingleDoctorPublicProfile);

export const DoctorRoutes = router;
