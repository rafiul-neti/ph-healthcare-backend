import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import validateQuery from "../../middleware/validateQuery";
import { validateRequest } from "../../middleware/validateRequest";
import { AppointmentController } from "./appointment.controller";
import {
  BookAppointmentValidationSchema,
  GetAllAppointmentsQueryValidationSchema,
  GetAppointmentsQueryValidationSchema,
  UpdateAppointmentStatusValidationSchema,
} from "./appointment.validation";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  validateRequest(BookAppointmentValidationSchema),
  AppointmentController.bookAppointment,
);

router.post(
  "/recreate-appointment-payment",
  auth(Role.PATIENT),
  AppointmentController.recreatePaymentForFailedPayment,
);

router.post(
  "/cancel-appointment",
  auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentController.cancelAppointmentAndGetRefunded,
);

// book appointment callback
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);

// update status route
router.patch(
  "/update-status/:appointmentId",
  auth(Role.DOCTOR),
  validateRequest(UpdateAppointmentStatusValidationSchema),
  AppointmentController.updateAppointmentStatus,
);

// get patient appointments
router.get(
  "/my-appointments",
  auth(Role.PATIENT),
  validateQuery(GetAppointmentsQueryValidationSchema),
  AppointmentController.getMyAppointments,
);

// get doctor appointments
router.get(
  "/doctor-appointments",
  auth(Role.DOCTOR),
  validateQuery(GetAppointmentsQueryValidationSchema),
  AppointmentController.getDoctorAppointments,
);

// get all appointments
router.get(
  "/doctor-appointments",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateQuery(GetAllAppointmentsQueryValidationSchema),
  AppointmentController.getAllAppointments,
);

// get single appointment
router.get(
  "/:appointmentId",
  auth(Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentController.getSingleAppointment,
);

export const AppointmentRoutes = router;
