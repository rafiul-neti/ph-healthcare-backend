import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import validateQuery from "../../middleware/validateQuery";
import { validateRequest } from "../../middleware/validateRequest";
import { ScheduleController } from "./schedule.controller";
import {
  CreateScheduleValidationZodSchema,
  GetAllSchedulesQueryValidationSchema,
  GetMySchedulesQueryValidationSchema,
  GetTodaysSchedulesQueryValidationSchema,
  UpdateScheduleValidationZodSchema,
} from "./schedule.validation";

const router = Router();

router.post(
  "/create-schedule",
  auth(Role.DOCTOR),
  validateRequest(CreateScheduleValidationZodSchema),
  ScheduleController.createSchedule,
);

router.get(
  "/my-schedules",
  auth(Role.DOCTOR),
  validateQuery(GetMySchedulesQueryValidationSchema),
  ScheduleController.getMySchedules,
);

router.get(
  "/all-schedules",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateQuery(GetAllSchedulesQueryValidationSchema),
  ScheduleController.getAllSchedules,
);

router.get(
  "/:scheduleId",
  auth(Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  ScheduleController.getScheduleById,
);

router.get(
  "/todays-schedule",
  auth(Role.PATIENT),
  validateQuery(GetTodaysSchedulesQueryValidationSchema),
  ScheduleController.getTodaysSchedule,
);

router.patch(
  "update-schedule/:scheduleId",
  auth(Role.DOCTOR),
  validateRequest(UpdateScheduleValidationZodSchema),
  ScheduleController.updateSchedule,
);

router.delete(
  "/:scheduleId",
  auth(Role.DOCTOR),
  ScheduleController.deleteSchedule,
);

export const ScheduleRoutes = router;
